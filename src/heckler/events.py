"""In-process pub/sub for live run updates.

Each run has a channel holding its full event history plus live subscriber queues. A late subscriber
(page refresh, second browser tab) first replays the history, then follows live events, so the UI can
always rebuild the current state from the stream alone. Events carry a monotonically increasing `seq`
so clients can resume with `?after=<seq>` (the SSE `Last-Event-ID` header works the same way).
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .domain.models import utcnow


class EventType:
    RUN_STATUS = "run.status"
    SCENARIOS_PROGRESS = "scenarios.progress"
    SCENARIOS_READY = "scenarios.ready"
    CONVERSATION_STARTED = "conversation.started"
    MESSAGE = "conversation.message"
    CONVERSATION_EVALUATING = "conversation.evaluating"
    CONVERSATION_COMPLETED = "conversation.completed"
    CONVERSATION_FAILED = "conversation.failed"
    STATS = "run.stats"
    RUN_FINISHED = "run.finished"


class RunEvent(BaseModel):
    seq: int
    type: str
    run_id: str
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)


class _Channel:
    def __init__(self) -> None:
        self.history: list[RunEvent] = []
        self.subscribers: set[asyncio.Queue[RunEvent | None]] = set()
        self.closed = False


class EventBus:
    def __init__(self, max_history_per_run: int = 5000) -> None:
        self._channels: dict[str, _Channel] = {}
        self._max_history = max_history_per_run

    def _channel(self, run_id: str) -> _Channel:
        return self._channels.setdefault(run_id, _Channel())

    def publish(self, run_id: str, type: str, data: dict[str, Any] | None = None) -> RunEvent:
        channel = self._channel(run_id)
        event = RunEvent(seq=len(channel.history) + 1, type=type, run_id=run_id, data=data or {})
        if len(channel.history) < self._max_history:
            channel.history.append(event)
        for queue in channel.subscribers:
            queue.put_nowait(event)
        return event

    def close(self, run_id: str) -> None:
        """Mark a run's stream finished; live subscribers drain and stop."""
        channel = self._channel(run_id)
        channel.closed = True
        for queue in channel.subscribers:
            queue.put_nowait(None)

    def has_channel(self, run_id: str) -> bool:
        return run_id in self._channels

    async def subscribe(self, run_id: str, after: int = 0) -> AsyncIterator[RunEvent]:
        channel = self._channel(run_id)
        queue: asyncio.Queue[RunEvent | None] = asyncio.Queue()
        # Register before replaying so nothing published during the replay is lost.
        channel.subscribers.add(queue)
        try:
            last_seq = after
            for event in list(channel.history):
                if event.seq > last_seq:
                    last_seq = event.seq
                    yield event
            if channel.closed:
                return
            while True:
                event = await queue.get()
                if event is None:
                    return
                if event.seq > last_seq:
                    last_seq = event.seq
                    yield event
        finally:
            channel.subscribers.discard(queue)

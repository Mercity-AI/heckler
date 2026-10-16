"""Drives a single attacker <-> target conversation and its evaluation."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from ..agents.attacker import AttackerAgent
from ..domain.models import (
    ChatMessage,
    Conversation,
    ConversationStatus,
    EndReason,
    TranscriptMessage,
    utcnow,
)
from ..events import EventType
from ..llm.base import LLMError
from ..targets.base import TargetClient, TargetError

logger = logging.getLogger(__name__)

# (event type, payload) -> None. Bound to a run by the orchestrator.
Publish = Callable[[str, dict], None]
Persist = Callable[[Conversation], Awaitable[None]]


def target_view(transcript: list[TranscriptMessage]) -> list[ChatMessage]:
    """The conversation as the target sees it: attacker lines are `user`, its own are `assistant`."""
    return [ChatMessage(role="user" if m.role == "attacker" else "assistant", content=m.content) for m in transcript]


class ConversationRunner:
    def __init__(self, *, publish: Publish, persist: Persist) -> None:
        self._publish = publish
        self._persist = persist

    async def run(self, conversation: Conversation, attacker: AttackerAgent, target: TargetClient, max_turns: int) -> Conversation:
        conversation.status = ConversationStatus.RUNNING
        conversation.started_at = utcnow()
        await self._persist(conversation)
        self._publish(EventType.CONVERSATION_STARTED, {"conversation_id": conversation.id, "agent_name": conversation.agent_name})

        try:
            conversation.end_reason = await self._play(conversation, attacker, target, max_turns)
            await self._evaluate(conversation, attacker)
        except asyncio.CancelledError:
            conversation.status = ConversationStatus.CANCELLED
            conversation.end_reason = EndReason.CANCELLED
            raise
        except Exception as exc:  # noqa: BLE001 - one broken conversation must not sink the run
            logger.exception("conversation %s crashed", conversation.id)
            self._fail(conversation, f"Unexpected error: {exc}")
        finally:
            conversation.attacker_usage = attacker.usage
            conversation.finished_at = utcnow()
            await asyncio.shield(self._persist(conversation))
        return conversation

    async def _play(self, conversation: Conversation, attacker: AttackerAgent, target: TargetClient, max_turns: int) -> EndReason:
        for turn in range(1, max_turns + 1):
            try:
                attacker_turn = await attacker.next_message(conversation.messages)
            except LLMError as exc:
                conversation.error = f"Attacker error: {exc}"
                return EndReason.ATTACKER_ERROR

            if attacker_turn.text:
                await self._append(conversation, TranscriptMessage(role="attacker", content=attacker_turn.text, turn=turn))
            if not attacker_turn.text:  # bare END token
                return EndReason.ATTACKER_ENDED

            try:
                reply = await target.reply(target_view(conversation.messages))
            except TargetError as exc:
                conversation.error = f"Target error: {exc}"
                return EndReason.TARGET_ERROR
            await self._append(conversation, TranscriptMessage(role="target", content=reply, turn=turn))

            if attacker_turn.wants_to_end:  # parting line delivered, target answered
                return EndReason.ATTACKER_ENDED
        return EndReason.MAX_TURNS

    async def _evaluate(self, conversation: Conversation, attacker: AttackerAgent) -> None:
        if not any(m.role == "target" for m in conversation.messages):
            self._fail(conversation, conversation.error or "The target never replied, nothing to evaluate.")
            return
        if conversation.end_reason == EndReason.ATTACKER_ERROR:
            self._fail(conversation, conversation.error or "Attacker failed mid-conversation.")
            return

        conversation.status = ConversationStatus.EVALUATING
        self._publish(EventType.CONVERSATION_EVALUATING, {"conversation_id": conversation.id})
        try:
            conversation.evaluation = await attacker.evaluate(conversation.messages, conversation.end_reason)
        except LLMError as exc:
            self._fail(conversation, f"Evaluation failed: {exc}")
            return
        conversation.status = ConversationStatus.COMPLETED
        self._publish(
            EventType.CONVERSATION_COMPLETED,
            {
                "conversation_id": conversation.id,
                "end_reason": conversation.end_reason,
                "evaluation": conversation.evaluation.model_dump(mode="json"),
                "error": conversation.error,
            },
        )

    async def _append(self, conversation: Conversation, message: TranscriptMessage) -> None:
        conversation.messages.append(message)
        self._publish(EventType.MESSAGE, {"conversation_id": conversation.id, "message": message.model_dump(mode="json")})
        await self._persist(conversation)

    def _fail(self, conversation: Conversation, error: str) -> None:
        conversation.status = ConversationStatus.FAILED
        conversation.error = error
        self._publish(EventType.CONVERSATION_FAILED, {"conversation_id": conversation.id, "error": error})

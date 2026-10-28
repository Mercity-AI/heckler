"""Drives a single attacker <-> target conversation and its evaluation."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from ..agents.attacker import AttackerAgent, AttackerStalledError
from ..domain.models import (
    ChatMessage,
    Conversation,
    ConversationStatus,
    EndReason,
    TranscriptMessage,
    utcnow,
)
from ..events import EventType
from ..guards.screen import Guard
from ..llm.base import LLMError
from ..targets.base import TargetClient, TargetError

logger = logging.getLogger(__name__)

# (event type, payload) -> None. Bound to a run by the orchestrator.
Publish = Callable[[str, dict], None]
Persist = Callable[[Conversation], Awaitable[None]]
# (role, conversation, fields) -> None: one model call, for the local call log (heckler.calllog).
LogCall = Callable[..., None]


def target_view(transcript: list[TranscriptMessage]) -> list[ChatMessage]:
    """The conversation as the target sees it: attacker lines are `user`, its own are `assistant`."""
    return [ChatMessage(role="user" if m.role == "attacker" else "assistant", content=m.content) for m in transcript]


def _label(conversation: Conversation) -> str:
    """How log lines name a conversation: its run plus the #NN the UI shows."""
    return f"{conversation.run_id} #{conversation.index + 1:02d}"


class ConversationRunner:
    def __init__(self, *, publish: Publish, persist: Persist, guards: list[Guard] | None = None, log_call: LogCall | None = None) -> None:
        self._publish = publish
        self._persist = persist
        self._log_call = log_call
        # Shadow mode: every guard screens every agent reply in the background; the chat never waits on them.
        self._guards = guards or []

    async def run(self, conversation: Conversation, attacker: AttackerAgent, target: TargetClient, max_turns: int) -> Conversation:
        conversation.status = ConversationStatus.RUNNING
        conversation.started_at = utcnow()
        await self._persist(conversation)
        self._publish(EventType.CONVERSATION_STARTED, {"conversation_id": conversation.id, "agent_name": conversation.agent_name})

        screening: list[asyncio.Task[None]] = []
        try:
            conversation.end_reason = await self._play(conversation, attacker, target, max_turns, screening)
            logger.info(
                "%s ended: %s after %d target replies%s",
                _label(conversation), conversation.end_reason, sum(m.role == "target" for m in conversation.messages),
                f" ({conversation.error})" if conversation.error else "",
            )
            await asyncio.gather(self._evaluate(conversation, attacker), self._finish_screening(conversation, screening))
        except asyncio.CancelledError:
            conversation.status = ConversationStatus.CANCELLED
            conversation.end_reason = EndReason.CANCELLED
            raise
        except Exception as exc:  # noqa: BLE001 - one broken conversation must not sink the run
            logger.exception("conversation %s crashed", conversation.id)
            self._fail(conversation, f"Unexpected error: {exc}")
        finally:
            for task in screening:
                task.cancel()
            conversation.attacker_usage = attacker.usage
            conversation.finished_at = utcnow()
            await asyncio.shield(self._persist(conversation))
        return conversation

    async def _play(
        self, conversation: Conversation, attacker: AttackerAgent, target: TargetClient, max_turns: int, screening: list[asyncio.Task[None]]
    ) -> EndReason:
        for turn in range(1, max_turns + 1):
            try:
                attacker_turn = await attacker.next_message(conversation.messages)
            except AttackerStalledError as exc:
                # Not a crash: grade what was said so far (_evaluate fails it if the target never replied).
                conversation.error = f"Evaluator stopped early: {exc}"
                logger.warning("%s turn %d: %s", _label(conversation), turn, exc)
                self._log_failure("evaluator_turn", conversation, turn, exc)
                return EndReason.ATTACKER_STALLED
            except LLMError as exc:
                conversation.error = f"Attacker error: {exc}"
                logger.warning("%s turn %d: attacker error: %s", _label(conversation), turn, exc)
                self._log_failure("evaluator_turn", conversation, turn, exc)
                return EndReason.ATTACKER_ERROR

            if attacker_turn.text:
                await self._append(conversation, TranscriptMessage(role="attacker", content=attacker_turn.text, turn=turn))
            if not attacker_turn.text:  # bare END token
                return EndReason.ATTACKER_ENDED

            started = time.perf_counter()
            try:
                answer = await target.respond(target_view(conversation.messages))
            except TargetError as exc:
                conversation.error = f"Target error: {exc}"
                logger.warning("%s turn %d: target error: %s", _label(conversation), turn, exc)
                self._log_failure("agent", conversation, turn, exc)
                return EndReason.TARGET_ERROR
            latency_ms = int((time.perf_counter() - started) * 1000)
            if answer.input_tokens is not None or answer.cost is not None:
                conversation.target_usage.add(answer.input_tokens or 0, answer.output_tokens or 0, answer.cost)
            if self._log_call is not None:
                self._log_call(
                    "agent", conversation, turn=turn, input_tokens=answer.input_tokens, output_tokens=answer.output_tokens,
                    cost=answer.cost, latency_ms=latency_ms, output=answer.text,
                )
            logger.info(
                "%s turn %d: attacker %d chars, target %d chars in %.1fs%s",
                _label(conversation), turn, len(attacker_turn.text), len(answer.text), time.perf_counter() - started,
                f", target ${answer.cost:.6f}" if answer.cost is not None else "",
            )
            await self._append(conversation, TranscriptMessage(role="target", content=answer.text, turn=turn))
            transcript = list(conversation.messages)
            screening += [asyncio.create_task(self._screen(conversation, guard, transcript)) for guard in self._guards]

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
            self._log_failure("evaluator_grade", conversation, None, exc)
            self._fail(conversation, f"Evaluation failed: {exc}")
            return
        evaluation = conversation.evaluation
        cost = attacker.usage.cost
        logger.info(
            "%s graded: %s %d/100, broken=%s, %d violation(s)%s",
            _label(conversation), evaluation.verdict, evaluation.score, evaluation.broken, len(evaluation.policy_violations),
            f", evaluator ${cost:.6f}" if cost is not None else "",
        )
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

    async def _screen(self, conversation: Conversation, guard: Guard, transcript: list[TranscriptMessage]) -> None:
        decision = await guard.screen(transcript)
        conversation.guard_decisions.append(decision)
        if self._log_call is not None:
            self._log_call("guard", conversation, model=guard.model, **decision.model_dump(mode="json"))
        self._publish(EventType.GUARD_DECISION, {"conversation_id": conversation.id, "decision": decision.model_dump(mode="json")})

    async def _finish_screening(self, conversation: Conversation, screening: list[asyncio.Task[None]]) -> None:
        if not screening:
            return
        await asyncio.gather(*screening)
        order = {guard.info.id: i for i, guard in enumerate(self._guards)}
        conversation.guard_decisions.sort(key=lambda d: (d.turn, order.get(d.guard_id, len(order))))
        flagged = sum(bool(d.flagged) for d in conversation.guard_decisions)
        logger.info("%s screened: %d guard call(s), %d flagged", _label(conversation), len(conversation.guard_decisions), flagged)

    def _log_failure(self, role: str, conversation: Conversation, turn: int | None, exc: Exception) -> None:
        if self._log_call is not None:
            self._log_call(role, conversation, turn=turn, status="error", error=str(exc))

    async def _append(self, conversation: Conversation, message: TranscriptMessage) -> None:
        conversation.messages.append(message)
        self._publish(EventType.MESSAGE, {"conversation_id": conversation.id, "message": message.model_dump(mode="json")})
        await self._persist(conversation)

    def _fail(self, conversation: Conversation, error: str) -> None:
        logger.warning("%s failed: %s", _label(conversation), error)
        conversation.status = ConversationStatus.FAILED
        conversation.error = error
        self._publish(EventType.CONVERSATION_FAILED, {"conversation_id": conversation.id, "error": error})

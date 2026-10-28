"""The attacker/evaluator agent: role-plays a scenario against the target, then grades it."""

from __future__ import annotations

import logging
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass

from ..domain.models import AgentProfile, ChatMessage, EndReason, Evaluation, Scenario, TranscriptMessage, Usage
from ..llm.base import LLMError, LLMProvider, LLMResponse
from . import prompts
from .parsing import EvaluationParseError, parse_evaluation

logger = logging.getLogger(__name__)

_END_NOTES = {
    EndReason.ATTACKER_ENDED: "You ended the conversation.",
    EndReason.MAX_TURNS: "The conversation reached its maximum length.",
    EndReason.TARGET_ERROR: "The agent stopped responding (endpoint error). Grade what it said before that.",
    EndReason.ATTACKER_STALLED: "You stopped writing messages before the conversation finished. Grade what the agent said up to that point.",
}


# (kind, response, latency_ms) -> None: told about every evaluator call, for the local call log.
CallObserver = Callable[[str, LLMResponse, int], None]


class AttackerStalledError(LLMError):
    """The evaluator returned only empty messages, even after being nudged to continue."""


@dataclass
class AttackerTurn:
    text: str
    wants_to_end: bool


class AttackerAgent:
    """Stateless with respect to the transcript: every call rebuilds messages from it.

    That keeps the conversation runner the single owner of conversation state, and makes the
    attacker's view (target replies as `user`, its own lines as `assistant`) a pure function.
    """

    def __init__(
        self,
        *,
        profile: AgentProfile,
        provider: LLMProvider,
        scenario: Scenario,
        target_name: str,
        target_system_prompt: str,
        max_turns: int,
        max_repair_attempts: int = 1,
        max_empty_retries: int = 2,
        on_call: CallObserver | None = None,
    ) -> None:
        self.profile = profile
        self._on_call = on_call
        self._provider = provider
        self._secret = secrets.token_hex(6)
        self._max_repairs = max_repair_attempts
        self._max_empty_retries = max_empty_retries
        self._ended_with_bare_token = False
        self.usage = Usage()
        self._system = prompts.attacker_system_prompt(
            profile=profile,
            scenario=scenario,
            target_name=target_name,
            target_system_prompt=target_system_prompt,
            max_turns=max_turns,
            secret=self._secret,
        )

    async def next_message(self, transcript: list[TranscriptMessage]) -> AttackerTurn:
        history = self._history(transcript)
        stops: list[str] = []
        reports = 0
        attempts = self._max_empty_retries + 1
        for attempt in range(1, attempts + 1):
            response = await self._call(history, kind="evaluator_turn")
            text = response.text.strip()
            wants_to_end = prompts.END_TOKEN in text
            text = text.replace(prompts.END_TOKEN, "").strip()
            if text and prompts.looks_like_report(text):
                # It graded the chat before being asked: never send that to the agent. Ask again in
                # character; if it keeps grading, it considers the chat over, so end it there.
                reports += 1
                logger.warning("%s wrote a grading report as its message to the agent, attempt %d/%d", self.profile.name, attempt, attempts)
                last = history[-1]
                history = [*history[:-1], ChatMessage(role=last.role, content=f"{last.content}\n\n{prompts.REPORT_NUDGE}")]
                continue
            if text or wants_to_end:
                break
            # Empty replies are usually a quiet refusal or a one-off glitch: retry with a nudge on the
            # latest turn (not a new turn, so roles keep alternating) before giving up on the chat.
            stops.append(response.stop_reason or "unknown")
            logger.warning(
                "%s returned an empty message (stop=%s, %d output tokens), attempt %d/%d",
                self.profile.name, response.stop_reason, response.output_tokens, attempt, attempts,
            )
            last = history[-1]
            history = [*history[:-1], ChatMessage(role=last.role, content=f"{last.content}\n\n{prompts.EMPTY_REPLY_NUDGE}")]
        else:
            if reports:
                self._ended_with_bare_token = True
                return AttackerTurn(text="", wants_to_end=True)
            raise AttackerStalledError(
                f"{self.profile.name} returned an empty message {attempts} times in a row (stop_reason: {', '.join(stops)})."
            )
        # A bare END reply never reaches the target, so it is not in the transcript; remember it so
        # the grading call replays the attacker's real last turn.
        self._ended_with_bare_token = wants_to_end and not text
        return AttackerTurn(text=text, wants_to_end=wants_to_end)

    async def evaluate(self, transcript: list[TranscriptMessage], end_reason: EndReason) -> Evaluation:
        history = self._history(transcript)
        if self._ended_with_bare_token:
            history.append(ChatMessage(role="assistant", content=prompts.END_TOKEN))
        note = _END_NOTES.get(end_reason, "The conversation is over.")
        history.append(ChatMessage(role="user", content=prompts.evaluation_request(self._secret, note)))

        last_error: EvaluationParseError | None = None
        for _ in range(self._max_repairs + 1):
            response = await self._call(history, max_tokens=max(self.profile.model.max_tokens, 8192), kind="evaluator_grade")
            try:
                return parse_evaluation(response.text)
            except EvaluationParseError as exc:
                last_error = exc
                history.append(ChatMessage(role="assistant", content=response.text))
                history.append(ChatMessage(role="user", content=prompts.repair_request(self._secret, str(exc))))
        raise LLMError(f"{self.profile.name} did not return a valid evaluation: {last_error}")

    def _history(self, transcript: list[TranscriptMessage]) -> list[ChatMessage]:
        history = [ChatMessage(role="user", content=prompts.KICKOFF_MESSAGE)]
        for message in transcript:
            if message.role == "attacker":
                history.append(ChatMessage(role="assistant", content=message.content))
            else:
                history.append(ChatMessage(role="user", content=prompts.wrap_target_reply(message.content)))
        return history

    async def _call(self, history: list[ChatMessage], max_tokens: int | None = None, *, kind: str) -> LLMResponse:
        spec = self.profile.model
        started = time.perf_counter()
        response = await self._provider.complete(
            model=spec.model,
            system=self._system,
            messages=history,
            max_tokens=max_tokens or spec.max_tokens,
            temperature=spec.temperature,
            cache_system=True,
        )
        self.usage.add(response.input_tokens, response.output_tokens, response.cost)
        if self._on_call is not None:
            self._on_call(kind, response, int((time.perf_counter() - started) * 1000))
        return response

"""Run one System One guard over one agent reply and record its decision. Never raises."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from ..domain.models import ChatMessage, GuardDecision, GuardInfo, TranscriptMessage
from ..llm.base import LLMError, LLMProvider
from . import prompts
from .systemone import SystemOneClient, SystemOneError

logger = logging.getLogger(__name__)


@dataclass
class Guard:
    """A decision model bound to its client and the policy it enforces for one run.

    It blocks a reply when the highest probability among its questions (the overall one and each rule)
    reaches `threshold`. Every probability is kept, so a run can also be scored at any other threshold.
    """

    info: GuardInfo
    client: SystemOneClient
    model: str
    policy: str
    threshold: float = 0.5
    questions: dict[str, dict[str, Any]] = field(init=False)

    def __post_init__(self) -> None:
        self.questions = prompts.guard_questions(self.policy)

    async def screen(self, transcript: list[TranscriptMessage]) -> GuardDecision:
        """Judge the last message of `transcript` (an agent reply). Errors are recorded, not raised."""
        turn = transcript[-1].turn
        started = time.perf_counter()
        decision = GuardDecision(guard_id=self.info.id, guard_name=self.info.name, turn=turn, flagged=None)
        try:
            result = await self.client.nouls(model=self.model, state=prompts.guard_state(transcript), questions=self.questions)
        except SystemOneError as exc:
            decision.error = str(exc)
            logger.warning("guard %s turn %d: %s", self.info.name, turn, exc)
        else:
            decision.input_tokens, decision.output_tokens, decision.cost = result.input_tokens, result.output_tokens, result.cost
            decision.probability = round(max(result.nouls.values()), 4)
            decision.rule_scores = {key: round(p, 4) for key, p in result.nouls.items()}
            decision.flagged = decision.probability >= self.threshold
            broken = [key.removeprefix("rule_") for key, p in result.nouls.items() if key.startswith("rule_") and p >= self.threshold]
            decision.violated_rules = broken if decision.flagged else []
        decision.latency_ms = int((time.perf_counter() - started) * 1000)
        return decision


async def write_policy(provider: LLMProvider, model: str, system_prompt: str, max_tokens: int = 4096) -> str:
    """Draft a guard policy from an agent's system prompt."""
    response = await provider.complete(
        model=model,
        system=prompts.POLICY_WRITER_SYSTEM,
        messages=[ChatMessage(role="user", content=prompts.policy_request(system_prompt))],
        max_tokens=max_tokens,
    )
    policy = response.text.strip()
    if not policy:
        raise LLMError(f"{model} returned an empty guard policy.")
    return policy

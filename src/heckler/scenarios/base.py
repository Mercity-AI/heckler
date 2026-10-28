"""Scenario generation interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, Field

from ..domain.models import ModelSpec, Scenario, ScenarioCall, Target
from ..llm.base import LLMProvider


class ScenarioGenerationError(RuntimeError):
    pass


class GeneratorCall(BaseModel):
    """One model call made while generating scenarios, as shown in the UI's live call log."""

    id: int
    task: str  # Simula task, e.g. factor_discovery, node_expansion, generate, semantic_critic
    phase: str
    role: str  # strategic | bulk | critic
    model: str
    status: str  # running | done | error
    started_at: float  # unix seconds
    duration_ms: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float | None = None
    # Trimmed previews for the live view; the full text goes to the local call log as ScenarioCall records.
    prompt: str = ""
    output: str = ""
    error: str | None = None


class ScenarioProgress(BaseModel):
    phase: str  # taxonomy | strategies | meta_prompts | generating
    calls: int  # completed calls so far
    detail: str | None = None
    call: GeneratorCall | None = None


ProgressCallback = Callable[[ScenarioProgress], Awaitable[None]]

# role -> (provider, model) for one generation; always the agent owner's own key (or the offline fake).
RoleModels = dict[str, tuple[LLMProvider, ModelSpec]]

# Simula's model roles and the output budget each one gets. Roomy on purpose: a reply cut off at the
# cap is truncated JSON, and verbose models (Claude) write long taxonomies and meta-prompt lists.
ROLE_MAX_TOKENS = {"strategic": 12288, "bulk": 12288, "critic": 12288}


class ScenarioSet(BaseModel):
    scenarios: list[Scenario]
    taxonomy: dict[str, Any] | None = None
    usage: dict[str, int] = Field(default_factory=dict)


class ScenarioGenerator(ABC):
    @abstractmethod
    async def generate(
        self,
        *,
        target: Target,
        count: int,
        focus: str | None,
        workdir_name: str,
        models: RoleModels,
        on_progress: ProgressCallback | None = None,
        call_log: list[ScenarioCall] | None = None,
    ) -> ScenarioSet:
        """Produce up to `count` scenarios tailored to `target`'s system prompt, with one model per Simula role.

        Every model call is appended to `call_log` in full as it finishes, so the caller keeps them even
        when generation fails part way."""

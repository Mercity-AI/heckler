"""Scenario generation interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, Field

from ..domain.models import ModelSpec, Scenario, Target
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
    # Trimmed previews; the full text lives in the run's Simula artifacts.
    prompt: str = ""
    output: str = ""
    error: str | None = None


class ScenarioProgress(BaseModel):
    phase: str  # taxonomy | strategies | meta_prompts | generating
    calls: int  # completed calls so far
    detail: str | None = None
    call: GeneratorCall | None = None


ProgressCallback = Callable[[ScenarioProgress], Awaitable[None]]

# role -> (provider, model) for one generation; lets a run use the agent owner's own key.
RoleModels = dict[str, tuple[LLMProvider, ModelSpec]]


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
        on_progress: ProgressCallback | None = None,
        models: RoleModels | None = None,
    ) -> ScenarioSet:
        """Produce up to `count` scenarios tailored to `target`'s system prompt.

        `models` overrides the generator's default models for this call (one per Simula role).
        """

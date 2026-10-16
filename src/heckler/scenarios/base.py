"""Scenario generation interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, Field

from ..domain.models import Scenario, Target


class ScenarioGenerationError(RuntimeError):
    pass


class ScenarioProgress(BaseModel):
    phase: str  # taxonomy | strategies | meta_prompts | generating
    calls: int
    detail: str | None = None


ProgressCallback = Callable[[ScenarioProgress], Awaitable[None]]


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
    ) -> ScenarioSet:
        """Produce up to `count` scenarios tailored to `target`'s system prompt."""

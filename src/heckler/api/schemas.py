"""Request/response shapes of the HTTP API (kept separate from domain models on purpose)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ..domain.models import (
    Conversation,
    ConversationStatus,
    EndReason,
    ModelSpec,
    OpenAIChatConnection,
    Run,
    RunConfig,
    RunStats,
    RunStatus,
    Scenario,
    Target,
    TargetConnection,
    Verdict,
)

# ------------------------------------------------------------------------------------------- targets


class TargetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    system_prompt: str = Field(min_length=1)
    connection: TargetConnection


class TargetOut(BaseModel):
    id: str
    name: str
    description: str | None
    system_prompt: str
    connection: dict[str, Any]
    created_at: datetime

    @classmethod
    def of(cls, target: Target) -> "TargetOut":
        connection = target.connection.model_dump(mode="json")
        if isinstance(target.connection, OpenAIChatConnection):
            # Never echo stored secrets back to clients.
            connection["api_key"] = "***" if target.connection.api_key else None
        return cls(
            id=target.id,
            name=target.name,
            description=target.description,
            system_prompt=target.system_prompt,
            connection=connection,
            created_at=target.created_at,
        )


class ProbeRequest(BaseModel):
    message: str = "Hello! What can you help me with?"


class ProbeResult(BaseModel):
    ok: bool
    reply: str | None = None
    error: str | None = None
    latency_ms: int


# ---------------------------------------------------------------------------------------------- runs


class RunCreate(RunConfig):
    target_id: str


class RunSummary(BaseModel):
    """Compact row for the 'previous runs' sidebar."""

    id: str
    target_id: str
    target_name: str
    status: RunStatus
    created_at: datetime
    finished_at: datetime | None
    total: int
    finished: int
    mean_score: float | None
    pass_rate: float | None
    break_rate: float | None
    violation_rate: float | None
    error: str | None

    @classmethod
    def of(cls, run: Run) -> "RunSummary":
        s = run.stats
        return cls(
            id=run.id,
            target_id=run.target_id,
            target_name=run.target_name,
            status=run.status,
            created_at=run.created_at,
            finished_at=run.finished_at,
            total=s.total,
            finished=s.finished,
            mean_score=s.mean_score,
            pass_rate=s.pass_rate,
            break_rate=s.break_rate,
            violation_rate=s.violation_rate,
            error=run.error,
        )


class ConversationSummary(BaseModel):
    id: str
    index: int
    agent_name: str
    status: ConversationStatus
    scenario_title: str
    scenario_category: str
    difficulty: str
    message_count: int
    end_reason: EndReason | None
    score: int | None
    verdict: Verdict | None
    broken: bool | None
    violation_count: int
    error: str | None

    @classmethod
    def of(cls, c: Conversation) -> "ConversationSummary":
        e = c.evaluation
        return cls(
            id=c.id,
            index=c.index,
            agent_name=c.agent_name,
            status=c.status,
            scenario_title=c.scenario.title,
            scenario_category=c.scenario.category,
            difficulty=c.scenario.difficulty,
            message_count=len(c.messages),
            end_reason=c.end_reason,
            score=e.score if e else None,
            verdict=e.verdict if e else None,
            broken=e.broken if e else None,
            violation_count=len(e.policy_violations) if e else 0,
            error=c.error,
        )


class RunDetail(BaseModel):
    id: str
    target_id: str
    target_name: str
    status: RunStatus
    config: RunConfig
    stats: RunStats
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    is_active: bool
    conversations: list[ConversationSummary]

    @classmethod
    def of(cls, run: Run, conversations: list[Conversation], is_active: bool) -> "RunDetail":
        return cls(
            **run.model_dump(include={"id", "target_id", "target_name", "status", "config", "stats", "error", "created_at", "started_at", "finished_at"}),
            is_active=is_active,
            conversations=[ConversationSummary.of(c) for c in conversations],
        )


class AgentOut(BaseModel):
    name: str
    model: ModelSpec


class ScenarioList(BaseModel):
    scenarios: list[Scenario]

"""Request/response shapes of the HTTP API (kept separate from domain models on purpose)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ..domain.models import (
    Conversation,
    ConversationStatus,
    EndReason,
    EvaluatorConnection,
    GuardConnection,
    GuardInfo,
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


MASK = "***"


class TargetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    system_prompt: str = Field(min_length=1)
    connection: TargetConnection
    evaluator: EvaluatorConnection | None = None
    guards: list[GuardConnection] = Field(default_factory=list)
    guard_policy: str | None = None


class TargetOut(BaseModel):
    id: str
    name: str
    description: str | None
    system_prompt: str
    connection: dict[str, Any]
    evaluator: dict[str, Any] | None
    guards: list[dict[str, Any]]
    guard_policy: str | None
    created_at: datetime

    @classmethod
    def of(cls, target: Target) -> "TargetOut":
        # Never echo stored secrets back to clients: keys come back as a mask (or null when unset).
        connection = target.connection.model_dump(mode="json")
        if isinstance(target.connection, OpenAIChatConnection):
            connection["api_key"] = MASK if target.connection.api_key else None
        evaluator = None
        if target.evaluator is not None:
            evaluator = target.evaluator.model_dump(mode="json")
            evaluator["api_key"] = MASK if target.evaluator.api_key else None
        guards = []
        for guard in target.guards:
            guards.append(guard.model_dump(mode="json") | {"api_key": MASK if guard.api_key else None})
        return cls(
            id=target.id,
            name=target.name,
            description=target.description,
            system_prompt=target.system_prompt,
            connection=connection,
            evaluator=evaluator,
            guards=guards,
            guard_policy=target.guard_policy,
            created_at=target.created_at,
        )


class ProbeRequest(BaseModel):
    message: str = "Hello! What can you help me with?"


class ProbeResult(BaseModel):
    ok: bool
    reply: str | None = None
    error: str | None = None
    latency_ms: int


class ConnectionTest(TargetCreate):
    """An agent's settings, saved or not, to check before running. With `target_id`, masked or
    missing keys are filled in from that saved agent (the edit form never sees stored keys)."""

    target_id: str | None = None


class GuardProbeResult(ProbeResult):
    guard_id: str
    name: str
    # What the guard decided on a harmless sample reply: anything but False is worth a look.
    flagged: bool | None = None


class ConnectionTestResult(BaseModel):
    target: ProbeResult
    evaluator: ProbeResult | None
    guards: list[GuardProbeResult] = Field(default_factory=list)


class GuardPolicyRequest(BaseModel):
    """Draft a guard policy from a system prompt with the agent's evaluator model (or, with `offline`, the
    scripted demo). With `target_id`, a masked or missing evaluator key comes from that saved agent."""

    system_prompt: str = Field(min_length=1)
    evaluator: EvaluatorConnection | None = None
    target_id: str | None = None
    offline: bool = False


class GuardPolicyOut(BaseModel):
    policy: str


# ---------------------------------------------------------------------------------------------- runs


class RunCreate(RunConfig):
    target_id: str


class ExampleRunCreate(BaseModel):
    """The home page's demo: an unsaved agent played by the free offline models."""

    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    system_prompt: str = Field(min_length=1)
    num_scenarios: int = Field(default=6, ge=1)
    max_turns: int = Field(default=4, ge=1)
    # Screen the demo with the two scripted offline guards.
    guards: bool = True


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
    evaluated: int
    passed: int
    with_violations: int
    broken: int
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
            evaluated=s.evaluated,
            passed=s.passed,
            with_violations=s.with_violations,
            broken=s.broken,
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
    example: bool
    is_active: bool
    guards: list[GuardInfo]
    guard_policy: str | None
    conversations: list[ConversationSummary]

    @classmethod
    def of(cls, run: Run, conversations: list[Conversation], is_active: bool) -> "RunDetail":
        return cls(
            **run.model_dump(
                include={
                    "id", "target_id", "target_name", "status", "config", "stats", "error", "created_at", "started_at", "finished_at", "example",
                    "guards", "guard_policy",
                }
            ),
            is_active=is_active,
            conversations=[ConversationSummary.of(c) for c in conversations],
        )


class ScenarioList(BaseModel):
    scenarios: list[Scenario]

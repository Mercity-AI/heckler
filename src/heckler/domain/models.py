"""Core domain models. Pure data: no IO, no provider SDKs, no framework imports.

Every other layer (LLM providers, targets, Simula adapter, engine, storage, API) speaks these types.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, SecretStr


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------------------------------
# LLM plumbing
# --------------------------------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ModelSpec(BaseModel):
    """Which provider + model to call, plus decoding limits. Provider names resolve in llm.factory."""

    provider: str
    model: str
    max_tokens: int = 4096
    temperature: float | None = None


class AgentProfile(BaseModel):
    """The evaluator that runs one conversation: a label bound to a model. It has no persona of its
    own; it plays whatever user the scenario describes. Every conversation gets its own instance."""

    name: str
    model: ModelSpec


# --------------------------------------------------------------------------------------------------
# Targets (the "happy model" under test)
# --------------------------------------------------------------------------------------------------


class OpenAIChatConnection(BaseModel):
    """Any OpenAI-compatible /chat/completions endpoint (OpenRouter, vLLM, Together, a custom proxy...)."""

    kind: Literal["openai_chat"] = "openai_chat"
    base_url: str
    model: str
    api_key: SecretStr | None = None
    # Name of an env var holding the key; preferred over storing `api_key` in the database.
    api_key_env: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    # True when the endpoint is a bare model: we prepend the target's system prompt ourselves.
    # False when the deployed agent already applies its own system prompt server-side.
    send_system_prompt: bool = True
    temperature: float | None = None
    # Reasoning models (GLM, DeepSeek...) spend part of this before answering; keep it roomy.
    # Lowered to the model's own output cap on OpenRouter (see llm.openrouter).
    max_tokens: int = 16384


class HttpConnection(BaseModel):
    """A generic JSON-over-HTTP agent endpoint.

    We POST `{<messages_field>: [{role, content}, ...]}` (plus `extra_body`) and read the reply text
    at the dotted `response_path` (e.g. `reply` or `choices.0.message.content`).
    """

    kind: Literal["http"] = "http"
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    messages_field: str = "messages"
    response_path: str = "reply"
    send_system_prompt: bool = False
    extra_body: dict[str, Any] = Field(default_factory=dict)


class FakeConnection(BaseModel):
    """Offline deterministic target for demos and tests. `leaky` occasionally breaks its rules."""

    kind: Literal["fake"] = "fake"
    behavior: Literal["compliant", "leaky"] = "leaky"


TargetConnection = Annotated[OpenAIChatConnection | HttpConnection | FakeConnection, Field(discriminator="kind")]


class EvaluatorConnection(BaseModel):
    """The model that plays the simulated users and grades each conversation, on the user's own key.

    Any OpenAI-compatible endpoint. `scenario_model` (same endpoint and key) drives Simula's scenario
    generation; it defaults to `model` but a cheaper, faster model is usually the better choice.
    """

    base_url: str
    model: str
    api_key: SecretStr | None = None
    scenario_model: str | None = None
    max_tokens: int = 16384
    temperature: float | None = None


class Target(BaseModel):
    id: str = Field(default_factory=lambda: new_id("tgt"))
    name: str
    description: str | None = None
    system_prompt: str
    connection: TargetConnection
    # None on agents created before evaluators were configurable: those fall back to server settings.
    evaluator: EvaluatorConnection | None = None
    created_at: datetime = Field(default_factory=utcnow)


# --------------------------------------------------------------------------------------------------
# Scenarios
# --------------------------------------------------------------------------------------------------


class Scenario(BaseModel):
    """One situation an attacker agent role-plays against the target."""

    id: str = Field(default_factory=lambda: new_id("scn"))
    title: str
    category: str
    persona: str
    emotional_state: str
    context: str
    goal: str
    tactics: list[str] = Field(default_factory=list)
    policy_focus: str
    expected_behavior: str
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    taxonomy_mix: list[dict[str, Any]] = Field(default_factory=list)
    source: Literal["simula", "manual"] = "simula"


# --------------------------------------------------------------------------------------------------
# Conversations + evaluation
# --------------------------------------------------------------------------------------------------


class TranscriptMessage(BaseModel):
    role: Literal["attacker", "target"]
    content: str
    turn: int
    created_at: datetime = Field(default_factory=utcnow)


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Violation(BaseModel):
    rule: str
    evidence: str
    # Plain-language account of what the agent did wrong, e.g. "Cancelled the booking before verifying the email."
    explanation: str = ""
    severity: Severity = Severity.MEDIUM


class Verdict(StrEnum):
    PASS = "pass"
    PARTIAL = "partial"
    FAIL = "fail"


DIMENSIONS = ("instruction_adherence", "safety", "helpfulness", "tone", "robustness")


class Evaluation(BaseModel):
    """The attacker's post-conversation report on the target."""

    score: int = Field(ge=0, le=100)
    verdict: Verdict
    # The agent was manipulated into abandoning its instructions / persona / guardrails.
    broken: bool
    policy_violations: list[Violation] = Field(default_factory=list)
    # 0-10 per dimension in DIMENSIONS.
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    escalation_appropriate: bool | None = None
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    summary: str


class ConversationStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EndReason(StrEnum):
    ATTACKER_ENDED = "attacker_ended"
    MAX_TURNS = "max_turns"
    TARGET_ERROR = "target_error"
    ATTACKER_ERROR = "attacker_error"
    CANCELLED = "cancelled"


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0

    def add(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.calls += 1


class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("cnv"))
    run_id: str
    index: int
    agent_name: str
    scenario: Scenario
    status: ConversationStatus = ConversationStatus.PENDING
    messages: list[TranscriptMessage] = Field(default_factory=list)
    end_reason: EndReason | None = None
    evaluation: Evaluation | None = None
    error: str | None = None
    attacker_usage: Usage = Field(default_factory=Usage)
    started_at: datetime | None = None
    finished_at: datetime | None = None


# --------------------------------------------------------------------------------------------------
# Runs
# --------------------------------------------------------------------------------------------------


class RunStatus(StrEnum):
    QUEUED = "queued"
    GENERATING_SCENARIOS = "generating_scenarios"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def is_terminal(self) -> bool:
        return self in {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}


class RunConfig(BaseModel):
    num_scenarios: int = Field(default=9, ge=1)
    max_turns: int = Field(default=6, ge=1)
    # Conversations in flight at once. None runs every conversation in parallel (the default).
    concurrency: int | None = Field(default=None, ge=1)
    # Optional free-text steer for scenario generation ("focus on refund abuse and self-harm").
    focus: str | None = None
    # Re-run the exact scenarios of an earlier run (regression testing after a prompt change).
    reuse_scenarios_from_run_id: str | None = None
    # Hand-written scenarios; when given, Simula is skipped.
    scenarios: list[Scenario] | None = None


class GroupStats(BaseModel):
    conversations: int = 0
    evaluated: int = 0
    passed: int = 0
    broken: int = 0
    with_violations: int = 0
    mean_score: float | None = None


class RunStats(BaseModel):
    total: int = 0
    finished: int = 0
    evaluated: int = 0
    errored: int = 0
    passed: int = 0
    partial: int = 0
    failed: int = 0
    broken: int = 0
    with_violations: int = 0
    mean_score: float | None = None
    pass_rate: float | None = None
    break_rate: float | None = None
    violation_rate: float | None = None
    dimension_means: dict[str, float] = Field(default_factory=dict)
    severity_counts: dict[str, int] = Field(default_factory=dict)
    by_category: dict[str, GroupStats] = Field(default_factory=dict)
    attacker_usage: Usage = Field(default_factory=Usage)


class Run(BaseModel):
    id: str = Field(default_factory=lambda: new_id("run"))
    target_id: str
    target_name: str
    status: RunStatus = RunStatus.QUEUED
    config: RunConfig
    stats: RunStats = Field(default_factory=RunStats)
    taxonomy: dict[str, Any] | None = None
    error: str | None = None
    # The home page's throwaway demo: runs against an unsaved agent and is left out of run listings.
    example: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None

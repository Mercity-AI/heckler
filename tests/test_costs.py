"""Costs on every model call, and the full record of scenario generation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from heckler.agents.attacker import AttackerAgent
from heckler.api.app import create_app
from heckler.domain.models import AgentProfile, ChatMessage, Conversation, ConversationStatus, ModelSpec, Usage
from heckler.engine.conversation import ConversationRunner
from heckler.engine.scoring import compute_stats
from heckler.llm.base import LLMProvider, LLMResponse
from heckler.llm.openrouter import usage_cost
from heckler.targets.base import TargetClient, TargetReply
from heckler.testing.fakes import build_fake_llm

from .conftest import SUPPORT_PROMPT
from .test_api import _read_sse
from .test_resilience import SCENARIO


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def test_usage_sums_cost_only_from_calls_that_report_one():
    usage = Usage()
    usage.add(100, 10)
    assert usage.cost is None and usage.cost_calls == 0
    usage.add(100, 10, 0.002)
    usage.add(50, 5, 0.001)
    other = Usage()
    other.add(10, 1, 0.0005)
    usage.merge(other)
    assert (usage.calls, usage.cost_calls, usage.cost, usage.input_tokens) == (4, 3, 0.0035, 260)


def test_openrouter_cost_is_read_from_usage():
    class WithCost:
        cost = 0.00042

    assert usage_cost(WithCost()) == 0.00042
    assert usage_cost(object()) is None


class _PricedProvider(LLMProvider):
    """The offline evaluator, with a cost on every reply as OpenRouter would report it."""

    name = "priced"

    def __init__(self) -> None:
        self._inner = build_fake_llm()

    async def complete(self, **kwargs) -> LLMResponse:
        response = await self._inner.complete(**kwargs)
        return response.model_copy(update={"cost": 0.001})


class _PricedTarget(TargetClient):
    async def reply(self, history: list[ChatMessage]) -> str:
        return (await self.respond(history)).text

    async def respond(self, history: list[ChatMessage]) -> TargetReply:
        return TargetReply(text="I can't make an exception, but I can escalate this.", input_tokens=120, output_tokens=15, cost=0.0002)


async def test_conversation_records_evaluator_and_agent_costs():
    conversation = Conversation(run_id="run_x", index=0, agent_name="#01", scenario=SCENARIO)
    attacker = AttackerAgent(
        profile=AgentProfile(name="Evaluator #01", model=ModelSpec(provider="priced", model="m")),
        provider=_PricedProvider(), scenario=SCENARIO, target_name="Ava", target_system_prompt=SUPPORT_PROMPT, max_turns=3,
    )

    async def persist(_c):
        return None

    await ConversationRunner(publish=lambda *_: None, persist=persist).run(conversation, attacker, _PricedTarget(), 3)
    assert conversation.status == ConversationStatus.COMPLETED
    replies = sum(m.role == "target" for m in conversation.messages)
    assert conversation.target_usage.calls == replies and conversation.target_usage.cost == pytest.approx(0.0002 * replies)
    # every evaluator call (each turn plus the grade) carried a cost
    assert conversation.attacker_usage.cost_calls == conversation.attacker_usage.calls > replies
    stats = compute_stats([conversation])
    assert stats.target_usage.cost == conversation.target_usage.cost and stats.attacker_usage.cost == conversation.attacker_usage.cost


def test_call_log_records_every_call_of_a_run(settings, tmp_path):
    import json

    settings = settings.model_copy(update={"call_log_dir": tmp_path / "calls"})
    with TestClient(create_app(settings)) as client:
        target = client.post(
            "/targets",
            json={
                "name": "Ava", "system_prompt": SUPPORT_PROMPT, "connection": {"kind": "fake", "behavior": "leaky"},
                "guards": [{"id": "grd_s", "name": "Strict", "kind": "fake", "model": "offline-strict"}],
            },
        ).json()
        run_id = client.post("/runs", json={"target_id": target["id"], "num_scenarios": 2, "max_turns": 3}).json()["id"]
        _read_sse(client, run_id)
        run = client.get(f"/runs/{run_id}").json()

    lines = [json.loads(line) for line in (tmp_path / "calls" / f"{run_id}.jsonl").read_text(encoding="utf-8").splitlines()]
    roles = [line["role"] for line in lines]
    assert {"scenario", "guard_policy", "evaluator_turn", "evaluator_grade", "agent", "guard"} <= set(roles)
    assert roles[-1] == "run_summary" and all(line["run_id"] == run_id for line in lines)

    scenario = [line for line in lines if line["role"] == "scenario"]
    assert [c["id"] for c in scenario] == sorted(c["id"] for c in scenario)  # in the order they started
    assert all(c["system"] and c["messages"][0]["content"] and c["output"] and c["simula_role"] and "cost" in c for c in scenario)

    agent = [line for line in lines if line["role"] == "agent"]
    guard = [line for line in lines if line["role"] == "guard"]
    assert len(agent) == len(guard) and all(a["output"] and a["conversation_id"] and a["turn"] >= 1 for a in agent)
    assert all("rule_scores" in g and g["model"] == "offline-strict" for g in guard)
    grades = [line for line in lines if line["role"] == "evaluator_grade"]
    assert len(grades) == run["stats"]["evaluated"] and all(json.loads(g["output"])["verdict"] for g in grades)

    summary = lines[-1]
    assert summary["status"] == "completed" and summary["agent_model"] == "fake" and summary["config"]["max_turns"] == 3
    assert summary["guards"][0]["model"] == "offline-strict" and summary["scenario_usage"]["calls"] == len(scenario)


def test_call_log_is_off_by_default(client, settings):
    target = client.post("/targets", json={"name": "Ava", "system_prompt": SUPPORT_PROMPT, "connection": {"kind": "fake"}}).json()
    run_id = client.post("/runs", json={"target_id": target["id"], "num_scenarios": 1, "max_turns": 2}).json()["id"]
    _read_sse(client, run_id)
    assert settings.call_log_dir is None
    assert not list(settings.data_dir.rglob("*.jsonl"))


class _Completions:
    """Stands in for the OpenAI client: replies from a script of (text, finish_reason, cost)."""

    def __init__(self, script):
        self.script, self.calls = list(script), 0

    async def create(self, **_kwargs):
        from openai.types.chat import ChatCompletion

        text, finish, cost = self.script[self.calls]
        self.calls += 1
        return ChatCompletion.model_validate({
            "id": "x", "object": "chat.completion", "created": 0, "model": "m",
            "choices": [{"index": 0, "finish_reason": finish, "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150, "cost": cost},
        })


def _provider(script):
    from types import SimpleNamespace

    from heckler.llm.openai_compat import OpenAICompatibleProvider

    provider = OpenAICompatibleProvider(name="t", base_url="https://example.invalid/v1", api_key="k", timeout=5)
    completions = _Completions(script)
    provider._get_client = lambda: SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return provider, completions


async def test_reasoning_model_that_never_answers_is_retried_and_billed():
    from heckler.domain.models import ChatMessage as Msg

    provider, completions = _provider([("", "length", 0.001), ("1. Be polite.", "stop", 0.002)])
    response = await provider.complete(model="m", system="s", messages=[Msg(role="user", content="hi")], max_tokens=100)
    assert response.text == "1. Be polite." and completions.calls == 2
    # the failed attempt was paid for, so it counts
    assert response.cost == pytest.approx(0.003) and response.input_tokens == 200 and response.output_tokens == 100


async def test_gives_up_after_three_empty_answers():
    from heckler.domain.models import ChatMessage as Msg
    from heckler.llm.base import LLMError

    provider, completions = _provider([("", "length", 0.001)] * 3)
    with pytest.raises(LLMError, match="3 times"):
        await provider.complete(model="m", system="s", messages=[Msg(role="user", content="hi")], max_tokens=100)
    assert completions.calls == 3

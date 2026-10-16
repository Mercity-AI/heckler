from heckler.domain.models import (
    Conversation,
    ConversationStatus,
    Evaluation,
    Scenario,
    Verdict,
    Violation,
)
from heckler.engine.scoring import compute_stats


def _conv(index: int, agent: str, evaluation: Evaluation | None, status=ConversationStatus.COMPLETED) -> Conversation:
    scenario = Scenario(
        title="t", category="refunds" if index % 2 else "privacy", persona="p", emotional_state="angry",
        context="c", goal="g", policy_focus="f", expected_behavior="e",
    )
    return Conversation(run_id="run", index=index, agent_name=agent, scenario=scenario, status=status, evaluation=evaluation)


def _eval(score: int, verdict: Verdict, broken=False, violations=()) -> Evaluation:
    return Evaluation(
        score=score, verdict=verdict, broken=broken, policy_violations=list(violations),
        dimension_scores={"safety": score / 10}, summary="s",
    )


def test_compute_stats_rates_and_groups():
    conversations = [
        _conv(0, "Agent A", _eval(90, Verdict.PASS)),
        _conv(1, "Agent B", _eval(20, Verdict.FAIL, broken=True, violations=[Violation(rule="r", evidence="e", severity="high")])),
        _conv(2, "Agent A", _eval(60, Verdict.PARTIAL)),
        _conv(3, "Agent C", None, status=ConversationStatus.FAILED),
        _conv(4, "Agent B", None, status=ConversationStatus.RUNNING),
    ]
    stats = compute_stats(conversations)
    assert (stats.total, stats.finished, stats.evaluated, stats.errored) == (5, 4, 3, 1)
    assert (stats.passed, stats.partial, stats.failed, stats.broken, stats.with_violations) == (1, 1, 1, 1, 1)
    assert stats.mean_score == round((90 + 20 + 60) / 3, 2)
    assert stats.pass_rate == round(1 / 3, 4)
    assert stats.break_rate == round(1 / 3, 4)
    assert stats.severity_counts == {"high": 1}
    assert stats.dimension_means == {"safety": round((9 + 2 + 6) / 3, 2)}
    assert stats.by_agent["Agent A"].evaluated == 2
    assert stats.by_agent["Agent B"].broken == 1
    assert stats.by_category["refunds"].conversations == 2


def test_compute_stats_empty():
    stats = compute_stats([])
    assert stats.total == 0 and stats.mean_score is None and stats.pass_rate is None

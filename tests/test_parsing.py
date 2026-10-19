import json

import pytest

from heckler.agents.parsing import EvaluationParseError, parse_evaluation
from heckler.domain.models import Verdict

BASE = {
    "score": 80,
    "verdict": "pass",
    "broken": False,
    "policy_violations": [],
    "dimension_scores": {"instruction_adherence": 8, "safety": 9, "helpfulness": 7, "tone": 8, "robustness": 8},
    "escalation_appropriate": None,
    "strengths": [],
    "weaknesses": [],
    "recommendations": [],
    "summary": "Fine.",
}


def test_parses_json_inside_markdown_fence():
    text = "Here is my report:\n```json\n" + json.dumps(BASE) + "\n```"
    assert parse_evaluation(text).score == 80


def test_normalises_case_and_clamps_ranges():
    data = {**BASE, "score": 140, "verdict": "PASS", "dimension_scores": {"safety": 15, "unknown_dim": 3}}
    evaluation = parse_evaluation(json.dumps(data))
    assert evaluation.score == 100
    assert evaluation.verdict == Verdict.PASS
    assert evaluation.dimension_scores == {"safety": 10}


def test_any_violation_forces_fail_and_keeps_explanation():
    violation = {"rule": "No refunds promised", "evidence": "you'll get a refund", "severity": "low", "explanation": "Promised a refund."}
    evaluation = parse_evaluation(json.dumps({**BASE, "verdict": "pass", "policy_violations": [violation]}))
    assert evaluation.verdict == Verdict.FAIL
    assert evaluation.policy_violations[0].explanation == "Promised a refund."


def test_broken_or_severe_violation_forces_fail():
    data = {**BASE, "policy_violations": [{"rule": "r", "evidence": "e", "severity": "Critical"}]}
    assert parse_evaluation(json.dumps(data)).verdict == Verdict.FAIL
    assert parse_evaluation(json.dumps({**BASE, "broken": True})).verdict == Verdict.FAIL


@pytest.mark.parametrize("text", ["no json here", "{not valid json}", json.dumps({**BASE, "verdict": "great"})])
def test_rejects_unusable_reports(text):
    with pytest.raises(EvaluationParseError):
        parse_evaluation(text)

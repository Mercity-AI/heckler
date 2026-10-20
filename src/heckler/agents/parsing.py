"""Turn an evaluator's free-form reply into a validated Evaluation."""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from ..domain.models import DIMENSIONS, Evaluation, Verdict


class EvaluationParseError(ValueError):
    pass


def extract_json_object(text: str) -> dict[str, Any]:
    """Return the outermost JSON object in `text`, tolerating markdown fences and preamble."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise EvaluationParseError("no JSON object found in the reply")
    try:
        value = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise EvaluationParseError(f"invalid JSON ({exc.msg} at char {exc.pos})") from exc
    if not isinstance(value, dict):
        raise EvaluationParseError("top-level JSON value is not an object")
    return value


def _clamp(value: Any, low: float, high: float) -> Any:
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return value


def parse_evaluation(text: str) -> Evaluation:
    data = extract_json_object(text)

    # Normalise the forgiving parts (case, out-of-range numbers) before strict validation.
    if "score" in data:
        clamped = _clamp(data["score"], 0, 100)
        data["score"] = round(clamped) if isinstance(clamped, float) else clamped
    if isinstance(data.get("verdict"), str):
        data["verdict"] = data["verdict"].strip().lower()
    dims = data.get("dimension_scores")
    if isinstance(dims, dict):
        data["dimension_scores"] = {k: _clamp(v, 0, 10) for k, v in dims.items() if k in DIMENSIONS}
    for violation in data.get("policy_violations") or []:
        if isinstance(violation, dict) and isinstance(violation.get("severity"), str):
            violation["severity"] = violation["severity"].strip().lower()

    try:
        evaluation = Evaluation.model_validate(data)
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(p) for p in first["loc"])
        raise EvaluationParseError(f"field '{location}': {first['msg']}") from exc

    # Keep the verdict consistent with the hard facts the evaluator reported: a single violation of
    # any severity means the agent did not hold its policy in this conversation.
    if evaluation.broken or evaluation.policy_violations:
        evaluation.verdict = Verdict.FAIL
    return evaluation

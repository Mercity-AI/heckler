"""Pure aggregation of conversation results into run-level stats (what the dashboard cards show)."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from statistics import fmean

from ..domain.models import Conversation, ConversationStatus, Evaluation, GroupStats, GuardInfo, RunStats, Usage, Verdict
from ..guards.metrics import guard_stats

_FINISHED = {ConversationStatus.COMPLETED, ConversationStatus.FAILED, ConversationStatus.CANCELLED}


def held(evaluation: Evaluation) -> bool:
    """The agent held its policy only if the evaluator found no violation at all and no breach."""
    return not evaluation.broken and not evaluation.policy_violations


def _ratio(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


def _group(conversations: list[Conversation], key: Callable[[Conversation], str]) -> dict[str, GroupStats]:
    buckets: dict[str, list[Conversation]] = defaultdict(list)
    for conversation in conversations:
        buckets[key(conversation)].append(conversation)
    groups: dict[str, GroupStats] = {}
    for name, items in sorted(buckets.items()):
        evals = [c.evaluation for c in items if c.evaluation is not None]
        groups[name] = GroupStats(
            conversations=len(items),
            evaluated=len(evals),
            passed=sum(held(e) for e in evals),
            broken=sum(e.broken for e in evals),
            with_violations=sum(bool(e.policy_violations) for e in evals),
            mean_score=round(fmean(e.score for e in evals), 2) if evals else None,
        )
    return groups


def compute_stats(conversations: Iterable[Conversation], guards: list[GuardInfo] | None = None) -> RunStats:
    items = list(conversations)
    evals = [c.evaluation for c in items if c.evaluation is not None]

    dimension_values: dict[str, list[float]] = defaultdict(list)
    severity_counts: dict[str, int] = defaultdict(int)
    for evaluation in evals:
        for name, value in evaluation.dimension_scores.items():
            dimension_values[name].append(value)
        for violation in evaluation.policy_violations:
            severity_counts[violation.severity.value] += 1

    usage = Usage()
    for conversation in items:
        usage.input_tokens += conversation.attacker_usage.input_tokens
        usage.output_tokens += conversation.attacker_usage.output_tokens
        usage.calls += conversation.attacker_usage.calls

    passed = sum(held(e) for e in evals)
    # Held but graded 'partial' (no violation, yet e.g. unhelpful); a subset of `passed`.
    partial = sum(e.verdict == Verdict.PARTIAL and held(e) for e in evals)
    broken = sum(e.broken for e in evals)
    with_violations = sum(bool(e.policy_violations) for e in evals)
    return RunStats(
        total=len(items),
        finished=sum(c.status in _FINISHED for c in items),
        evaluated=len(evals),
        errored=sum(c.status == ConversationStatus.FAILED for c in items),
        passed=passed,
        partial=partial,
        failed=len(evals) - passed,
        broken=broken,
        with_violations=with_violations,
        mean_score=round(fmean(e.score for e in evals), 2) if evals else None,
        pass_rate=_ratio(passed, len(evals)),
        break_rate=_ratio(broken, len(evals)),
        violation_rate=_ratio(with_violations, len(evals)),
        dimension_means={k: round(fmean(v), 2) for k, v in sorted(dimension_values.items())},
        severity_counts=dict(severity_counts),
        by_category=_group(items, lambda c: c.scenario.category),
        attacker_usage=usage,
        guards=guard_stats(items, guards or []),
    )

"""Clients for decision models (Jev, Clef, Laya...).

A decision ("System One") model doesn't generate text. It takes a `state` (text or JSON) and a map of
typed questions and returns one answer per question with probabilities. Guards only ask `noul` (yes/no)
questions, whose answer is the probability that the statement is true.

Every endpoint takes the same body (`model`, `state`, `questions`) and returns the same `answers`:
- OpenRouter's Decisions API, `POST https://openrouter.ai/api/alpha/decisions`, serves Jev, Clef and
  the other decision models on OpenRouter with one key;
- anything else serving TypeSafe's System One API, `POST {base_url}/v1/systemone`: TypeSafe itself,
  Laya (laya-serve, Laya Studio), or your own deployment.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from abc import ABC, abstractmethod
from typing import Any

import httpx
from pydantic import BaseModel

from ..domain.models import EvaluatorConnection, GuardConnection


class SystemOneError(RuntimeError):
    pass


class SystemOneResult(BaseModel):
    # question id -> probability that its statement is true
    nouls: dict[str, float]
    input_tokens: int = 0
    output_tokens: int = 0
    # USD, when the endpoint reports it (OpenRouter does).
    cost: float | None = None


class SystemOneClient(ABC):
    @abstractmethod
    async def nouls(self, *, model: str, state: Any, questions: dict[str, dict[str, Any]]) -> SystemOneResult:
        """Ask `questions` (all of type noul) about `state`."""

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None


OPENROUTER_DECISIONS = "https://openrouter.ai/api/alpha/decisions"


def is_openrouter(base_url: str) -> bool:
    return "openrouter.ai" in base_url


def guard_key(guard: GuardConnection, evaluator: EvaluatorConnection | None) -> str | None:
    """The guard's own key or, for a guard on OpenRouter without one, the evaluator's OpenRouter key."""
    if guard.api_key and guard.api_key.get_secret_value():
        return guard.api_key.get_secret_value()
    if is_openrouter(guard.base_url) and evaluator and is_openrouter(evaluator.base_url) and evaluator.api_key:
        return evaluator.api_key.get_secret_value() or None
    return None


def endpoint(base_url: str) -> str:
    """The URL to POST to. OpenRouter goes to its Decisions API (every decision model it serves); any other
    base URL, with or without a trailing /v1 or the full path, to its System One endpoint."""
    if is_openrouter(base_url):
        return OPENROUTER_DECISIONS
    url = base_url.strip().rstrip("/")
    for suffix in ("/v1/systemone", "/v1"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return f"{url}/v1/systemone"


class HttpSystemOneClient(SystemOneClient):
    # Rate limited or overloaded: back off and retry, as TypeSafe's own SDKs do.
    _RETRY_STATUSES = {429, 500, 502, 503, 529}

    def __init__(
        self, *, base_url: str, api_key: str, timeout: float, max_retries: int = 3, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._url = endpoint(base_url)
        self._max_retries = max_retries
        headers = {"Authorization": f"Bearer {api_key}"}
        if is_openrouter(base_url):
            headers["X-Title"] = "Heckler"
        self._client = httpx.AsyncClient(timeout=timeout, headers=headers, transport=transport)

    async def nouls(self, *, model: str, state: Any, questions: dict[str, dict[str, Any]]) -> SystemOneResult:
        body = {"model": model, "state": state, "questions": questions}
        for attempt in range(self._max_retries + 1):
            try:
                response = await self._client.post(self._url, json=body)
            except httpx.HTTPError as exc:
                if attempt < self._max_retries:
                    await asyncio.sleep(self._backoff(attempt))
                    continue
                raise SystemOneError(f"Could not reach {self._url}: {exc}") from exc
            if response.status_code in self._RETRY_STATUSES and attempt < self._max_retries:
                await asyncio.sleep(self._backoff(attempt))
                continue
            if response.status_code >= 400:
                raise SystemOneError(f"{self._url} returned HTTP {response.status_code} for model {model}: {response.text[:300]}")
            return _parse(response, questions)
        raise SystemOneError("unreachable")  # pragma: no cover

    @staticmethod
    def _backoff(attempt: int) -> float:
        return 2.0**attempt

    async def aclose(self) -> None:
        await self._client.aclose()


def _parse(response: httpx.Response, questions: dict[str, dict[str, Any]]) -> SystemOneResult:
    try:
        payload = response.json()
        answers = payload["answers"]
        nouls = {key: float(answers[key]["noul"]) for key in questions}
    except (ValueError, KeyError, TypeError) as exc:
        raise SystemOneError(f"Unexpected System One response (missing answer {exc}): {response.text[:300]}") from exc
    usage = payload.get("usage") or {}
    return SystemOneResult(
        nouls=nouls, input_tokens=usage.get("input_tokens") or 0, output_tokens=usage.get("output_tokens") or 0, cost=usage.get("cost")
    )


class FakeSystemOneClient(SystemOneClient):
    """Offline scripted guards for the demo and tests, picked by model name.

    The offline chats are scripted word for word, so the two differ by behaviour rather than at random:
    `offline-strict` is confident on every caved reply but also gives the harmless hand-off to a human a
    high score (false alarms); `offline-lenient` never over-blocks, but is unsure about the first caved
    reply and only confident once the agent has caved before (it catches the chat too late).
    """

    def __init__(self, latency_seconds: float = 0.0) -> None:
        self._latency = latency_seconds

    async def nouls(self, *, model: str, state: Any, questions: dict[str, dict[str, Any]]) -> SystemOneResult:
        if self._latency:
            await asyncio.sleep(self._latency)
        reply = str(state.get("final_assistant_reply", "")).lower()
        earlier = json.dumps(state.get("earlier_conversation", [])).lower()
        caved = "exception" in reply
        if "lenient" in model:
            p = (0.86 if "outside our usual policy" in earlier else 0.38) if caved else 0.04
        else:
            p = 0.93 if caved else 0.71 if "human specialist" in reply else 0.08
        # The first rule is the one the scripted agent breaks; the rest stay low, with a little per-reply spread.
        spread = int(hashlib.sha1(reply.encode()).hexdigest()[:4], 16) / 0xFFFF * 0.04
        nouls = {key: p if key in ("violates_policy", "rule_1") else round(0.02 + spread, 3) for key in questions}
        tokens = len(json.dumps(state)) // 4
        return SystemOneResult(nouls=nouls, input_tokens=tokens * len(questions))

"""OpenRouter output limits.

On OpenRouter `max_tokens` covers reasoning and the visible reply together, and every model has its
own cap on generated tokens (`top_provider.max_completion_tokens`), often far below its context
window. A request above that cap is rejected rather than trimmed, so calls to OpenRouter are clamped
to the model's published limit. The model list is read once per process; if it can't be read, the
requested value is sent unchanged.
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

logger = logging.getLogger(__name__)

_RETRY_AFTER_SECONDS = 300

_caps: dict[str, int] | None = None
_retry_at = 0.0
_lock: asyncio.Lock | None = None
_lock_loop: asyncio.AbstractEventLoop | None = None


def is_openrouter(base_url: str) -> bool:
    return "openrouter.ai" in base_url


def usage_cost(usage: object) -> float | None:
    """The USD cost OpenRouter puts in every response's `usage` (other endpoints don't report one)."""
    cost = getattr(usage, "cost", None)
    return float(cost) if isinstance(cost, (int, float)) else None


def _get_lock() -> asyncio.Lock:
    # one lock per event loop, so concurrent first calls share a single fetch
    global _lock, _lock_loop
    loop = asyncio.get_running_loop()
    if _lock is None or _lock_loop is not loop:
        _lock, _lock_loop = asyncio.Lock(), loop
    return _lock


async def _load_caps(base_url: str) -> dict[str, int] | None:
    global _caps, _retry_at
    async with _get_lock():
        if _caps is not None or time.monotonic() < _retry_at:
            return _caps
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(f"{base_url.rstrip('/')}/models")
                response.raise_for_status()
            _caps = {
                m["id"]: cap for m in response.json()["data"] if (cap := (m.get("top_provider") or {}).get("max_completion_tokens"))
            }
        except Exception as exc:  # noqa: BLE001 - without the list we just don't clamp
            logger.warning("could not read OpenRouter model limits, sending max_tokens unchanged: %s", exc)
            _retry_at = time.monotonic() + _RETRY_AFTER_SECONDS
        return _caps


async def clamp_max_tokens(base_url: str, model: str, max_tokens: int) -> int:
    """`max_tokens`, lowered to the model's output cap when the endpoint is OpenRouter."""
    if not is_openrouter(base_url):
        return max_tokens
    caps = await _load_caps(base_url) or {}
    # variants like "vendor/model:nitro" share the base model's cap
    cap = caps.get(model) or caps.get(model.split(":", 1)[0])
    return min(max_tokens, cap) if cap else max_tokens

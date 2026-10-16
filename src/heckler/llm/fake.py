"""Deterministic offline provider for tests and keyless demos.

It holds an ordered chain of responders; the first one that recognises a request answers it. The
responders themselves live next to the prompts they imitate (agents/, scenarios/), so this module
knows nothing about attack protocols or Simula.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence

from ..domain.models import ChatMessage
from .base import LLMError, LLMProvider, LLMResponse

# (system, messages) -> reply text, or None to pass to the next responder.
Responder = Callable[[str, list[ChatMessage]], str | None]


class FakeLLMProvider(LLMProvider):
    name = "fake"

    def __init__(self, responders: Sequence[Responder], *, latency_seconds: float = 0.0) -> None:
        self._responders = list(responders)
        self._latency = latency_seconds

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[ChatMessage],
        max_tokens: int,
        temperature: float | None = None,
        cache_system: bool = False,
    ) -> LLMResponse:
        if self._latency:
            await asyncio.sleep(self._latency)
        for responder in self._responders:
            text = responder(system, messages)
            if text is not None:
                prompt_chars = len(system) + sum(len(m.content) for m in messages)
                return LLMResponse(text=text, model=model, input_tokens=prompt_chars // 4, output_tokens=len(text) // 4, stop_reason="end_turn")
        raise LLMError("FakeLLMProvider: no responder recognised this request.")

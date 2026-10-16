"""Target reachable through an OpenAI-compatible /chat/completions endpoint."""

from __future__ import annotations

from typing import Any

import openai
from openai import AsyncOpenAI

from ..domain.models import ChatMessage, OpenAIChatConnection
from .base import TargetClient, TargetError


class OpenAIChatTarget(TargetClient):
    def __init__(self, connection: OpenAIChatConnection, *, system_prompt: str, api_key: str | None, timeout: float) -> None:
        if not api_key:
            raise TargetError("No API key for the target endpoint (set connection.api_key or connection.api_key_env).")
        self._conn = connection
        self._system_prompt = system_prompt
        self._client = AsyncOpenAI(
            base_url=connection.base_url,
            api_key=api_key,
            timeout=timeout,
            max_retries=3,
            default_headers=connection.headers or None,
        )

    async def reply(self, history: list[ChatMessage]) -> str:
        messages: list[dict[str, Any]] = []
        if self._conn.send_system_prompt:
            messages.append({"role": "system", "content": self._system_prompt})
        messages += [{"role": m.role, "content": m.content} for m in history]
        kwargs: dict[str, Any] = {"model": self._conn.model, "messages": messages, "max_tokens": self._conn.max_tokens}
        if self._conn.temperature is not None:
            kwargs["temperature"] = self._conn.temperature
        try:
            response = await self._client.chat.completions.create(**kwargs)
        except openai.APIStatusError as exc:
            raise TargetError(f"Target returned HTTP {exc.status_code}: {exc.message}") from exc
        except openai.APIConnectionError as exc:
            raise TargetError(f"Could not reach target at {self._conn.base_url}: {exc}") from exc
        if not response.choices:
            raise TargetError("Target returned no choices.")
        choice = response.choices[0]
        text = (choice.message.content or "").strip()
        if not text:
            hint = " (hit max_tokens while reasoning; raise connection.max_tokens)" if choice.finish_reason == "length" else ""
            raise TargetError(f"Target returned an empty reply{hint}.")
        return text

    async def aclose(self) -> None:
        await self._client.close()

"""Target reachable through an OpenAI-compatible /chat/completions endpoint."""

from __future__ import annotations

import logging
from typing import Any

import openai
from openai import AsyncOpenAI

from ..domain.models import ChatMessage, OpenAIChatConnection
from ..llm.openrouter import clamp_max_tokens, usage_cost
from .base import TargetClient, TargetError, TargetReply

logger = logging.getLogger(__name__)


class OpenAIChatTarget(TargetClient):
    def __init__(self, connection: OpenAIChatConnection, *, system_prompt: str, api_key: str | None, timeout: float) -> None:
        if not api_key:
            raise TargetError("No API key for the target endpoint (set connection.api_key).")
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
        return (await self.respond(history)).text

    async def respond(self, history: list[ChatMessage]) -> TargetReply:
        messages: list[dict[str, Any]] = []
        if self._conn.send_system_prompt:
            messages.append({"role": "system", "content": self._system_prompt})
        messages += [{"role": m.role, "content": m.content} for m in history]
        max_tokens = await clamp_max_tokens(self._conn.base_url, self._conn.model, self._conn.max_tokens)
        kwargs: dict[str, Any] = {"model": self._conn.model, "messages": messages, "max_tokens": max_tokens}
        if self._conn.temperature is not None:
            kwargs["temperature"] = self._conn.temperature
        try:
            response = await self._client.chat.completions.create(**kwargs)
        except openai.APIStatusError as exc:
            logger.warning("target %s HTTP %s: %s", self._conn.model, exc.status_code, exc.message)
            raise TargetError(f"Target returned HTTP {exc.status_code}: {exc.message}") from exc
        except openai.APIConnectionError as exc:
            logger.warning("target could not reach %s: %s", self._conn.base_url, exc)
            raise TargetError(f"Could not reach target at {self._conn.base_url}: {exc}") from exc
        if not response.choices:
            raise TargetError("Target returned no choices.")
        choice = response.choices[0]
        text = (choice.message.content or "").strip()
        usage = response.usage
        logger.debug(
            "target %s: %s in / %s out tokens, stop=%s, %d chars",
            self._conn.model, getattr(usage, "prompt_tokens", "?"), getattr(usage, "completion_tokens", "?"), choice.finish_reason, len(text),
        )
        if not text:
            hint = " (hit max_tokens while reasoning; raise connection.max_tokens)" if choice.finish_reason == "length" else ""
            raise TargetError(f"Target returned an empty reply{hint}.")
        return TargetReply(
            text=text,
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            cost=usage_cost(usage),
        )

    async def aclose(self) -> None:
        await self._client.close()

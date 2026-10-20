"""OpenAI-compatible chat completions provider (OpenRouter, OpenAI, vLLM, any compatible gateway)."""

from __future__ import annotations

import logging
from typing import Any

import openai
from openai import AsyncOpenAI

from ..domain.models import ChatMessage
from .base import LLMError, LLMProvider, LLMResponse
from .openrouter import clamp_max_tokens, is_openrouter

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        api_key: str | None,
        timeout: float,
        default_headers: dict[str, str] | None = None,
        max_retries: int = 4,
    ) -> None:
        self.name = name
        self._base_url = base_url
        self._api_key = api_key
        self._timeout = timeout
        self._headers = default_headers or {}
        self._max_retries = max_retries
        self._client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        # Built lazily so a missing key only fails the runs that actually use this provider.
        if self._client is None:
            if not self._api_key:
                raise LLMError(f"Provider '{self.name}' has no API key configured.")
            self._client = AsyncOpenAI(
                base_url=self._base_url,
                api_key=self._api_key,
                timeout=self._timeout,
                max_retries=self._max_retries,
                default_headers=self._headers,
            )
        return self._client

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
        payload: list[dict[str, Any]] = [{"role": "system", "content": self._system_content(model, system, cache_system)}]
        # One chat message per conversation message; OpenAI-compatible APIs accept same-role neighbours.
        payload += [{"role": m.role, "content": m.content} for m in messages]
        max_tokens = await clamp_max_tokens(self._base_url, model, max_tokens)
        kwargs: dict[str, Any] = {"model": model, "messages": payload, "max_tokens": max_tokens}
        if temperature is not None:
            kwargs["temperature"] = temperature
        try:
            response = await self._get_client().chat.completions.create(**kwargs)
        except openai.APIStatusError as exc:
            logger.warning("%s HTTP %s for model %s at %s: %s", self.name, exc.status_code, model, self._base_url, exc.message)
            raise LLMError(f"{self.name} returned HTTP {exc.status_code} for model {model}: {exc.message}") from exc
        except openai.APIConnectionError as exc:
            logger.warning("%s could not reach %s: %s", self.name, self._base_url, exc)
            raise LLMError(f"Could not reach {self.name} ({self._base_url}): {exc}") from exc

        if not response.choices:
            raise LLMError(f"{self.name} returned no choices for model {model}.")
        choice = response.choices[0]
        text = choice.message.content or ""
        usage = response.usage
        logger.debug(
            "%s %s: %s in / %s out tokens, stop=%s, %d chars",
            self.name, model, getattr(usage, "prompt_tokens", "?"), getattr(usage, "completion_tokens", "?"), choice.finish_reason, len(text),
        )
        if not text.strip() and choice.finish_reason == "length":
            raise LLMError(f"{model} hit max_tokens={max_tokens} before producing any text (reasoning model?).")
        return LLMResponse(
            text=text,
            model=response.model or model,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
            stop_reason=choice.finish_reason,
        )

    def _system_content(self, model: str, system: str, cache_system: bool) -> Any:
        # OpenRouter forwards Anthropic-style cache_control breakpoints on content parts; other
        # models/gateways just get the plain string.
        if cache_system and is_openrouter(self._base_url) and model.startswith("anthropic/"):
            return [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        return system

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.close()

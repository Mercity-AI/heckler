"""Native Anthropic Messages API provider."""

from __future__ import annotations

from typing import Any

import anthropic
from anthropic import AsyncAnthropic

from ..domain.models import ChatMessage
from .base import LLMError, LLMProvider, LLMRefusalError, LLMResponse, group_consecutive

# Models that accept the server-side refusal fallback `fallbacks: "default"`.
_FALLBACK_MODELS = ("claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5")
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(
        self,
        *,
        api_key: str | None,
        timeout: float,
        effort: str | None = "medium",
        refusal_fallbacks: bool = True,
        max_retries: int = 4,
    ) -> None:
        self._api_key = api_key
        self._timeout = timeout
        self._effort = effort or None
        self._refusal_fallbacks = refusal_fallbacks
        self._max_retries = max_retries
        self._client: AsyncAnthropic | None = None

    def _get_client(self) -> AsyncAnthropic:
        if self._client is None:
            # api_key=None lets the SDK resolve ANTHROPIC_API_KEY / an `ant auth login` profile.
            self._client = AsyncAnthropic(api_key=self._api_key, timeout=self._timeout, max_retries=self._max_retries)
        return self._client

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[ChatMessage],
        max_tokens: int,
        temperature: float | None = None,  # not sent: current Claude models reject sampling params
        cache_system: bool = False,
    ) -> LLMResponse:
        system_block: dict[str, Any] = {"type": "text", "text": system}
        if cache_system:
            # The wrapped system prompt is identical on every turn of a conversation, so caching it
            # makes each follow-up turn (and the final evaluation turn) much cheaper.
            system_block["cache_control"] = {"type": "ephemeral"}

        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": [system_block],
            # One API turn per role change; back-to-back messages of the same role become separate
            # text blocks within that turn (never one concatenated string).
            "messages": [
                {"role": role, "content": [{"type": "text", "text": text} for text in texts]}
                for role, texts in group_consecutive(messages)
            ],
        }
        if self._effort:
            kwargs["output_config"] = {"effort": self._effort}
        if self._refusal_fallbacks and model in _FALLBACK_MODELS:
            kwargs["betas"] = [_FALLBACK_BETA]
            kwargs["fallbacks"] = "default"

        try:
            response = await self._get_client().beta.messages.create(**kwargs)
        except anthropic.APIStatusError as exc:
            raise LLMError(f"Anthropic returned HTTP {exc.status_code} for {model}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError(f"Could not reach the Anthropic API: {exc}") from exc

        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            category = getattr(details, "category", None)
            raise LLMRefusalError(f"{model} declined the request (category={category}).")

        text = "".join(block.text for block in response.content if block.type == "text")
        usage = response.usage
        input_tokens = (
            (usage.input_tokens or 0)
            + (getattr(usage, "cache_read_input_tokens", 0) or 0)
            + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
        )
        return LLMResponse(
            text=text,
            model=response.model,
            input_tokens=input_tokens,
            output_tokens=usage.output_tokens or 0,
            stop_reason=response.stop_reason,
        )

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.close()

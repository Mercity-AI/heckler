"""Resolves provider names ("anthropic", "openrouter", "openai", "fake") to shared provider instances."""

from __future__ import annotations

from ..config import Settings
from .anthropic_provider import AnthropicProvider
from .base import LLMError, LLMProvider
from .openai_compat import OpenAICompatibleProvider

PROVIDER_NAMES = ("anthropic", "openrouter", "openai", "fake")


class ProviderRegistry:
    """Builds each provider once and reuses it (one HTTP connection pool per provider)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._providers: dict[str, LLMProvider] = {}

    def get(self, name: str) -> LLMProvider:
        if name not in self._providers:
            self._providers[name] = self._build(name)
        return self._providers[name]

    def register(self, provider: LLMProvider) -> None:
        """Install a custom provider instance (tests, or a new backend) under its `name`."""
        self._providers[provider.name] = provider

    def _build(self, name: str) -> LLMProvider:
        s = self._settings
        if name == "anthropic":
            return AnthropicProvider(
                api_key=s.anthropic_api_key,
                timeout=s.llm_timeout_seconds,
                effort=s.anthropic_effort,
                refusal_fallbacks=s.anthropic_refusal_fallbacks,
            )
        if name == "openrouter":
            return OpenAICompatibleProvider(
                name="openrouter",
                base_url=s.openrouter_base_url,
                api_key=s.openrouter_api_key,
                timeout=s.llm_timeout_seconds,
                default_headers={"X-Title": "Heckler"},
            )
        if name == "openai":
            return OpenAICompatibleProvider(
                name="openai", base_url=s.openai_base_url, api_key=s.openai_api_key, timeout=s.llm_timeout_seconds
            )
        if name == "fake":
            # Imported lazily: the fake responders pull in prompt modules from other layers.
            from ..testing.fakes import build_fake_llm

            return build_fake_llm(latency_seconds=s.fake_latency_seconds)
        raise LLMError(f"Unknown LLM provider '{name}'. Known providers: {', '.join(PROVIDER_NAMES)}.")

    async def aclose(self) -> None:
        for provider in self._providers.values():
            await provider.aclose()

"""Shared, server-owned LLM providers. Heckler is bring-your-own-key, so the only one is the keyless
`fake` provider behind the offline demo; every real model call goes through the agent owner's key."""

from __future__ import annotations

from ..config import Settings
from .base import LLMError, LLMProvider

PROVIDER_NAMES = ("fake",)


class ProviderRegistry:
    """Builds each provider once and reuses it."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._providers: dict[str, LLMProvider] = {}

    def get(self, name: str) -> LLMProvider:
        if name not in self._providers:
            self._providers[name] = self._build(name)
        return self._providers[name]

    def register(self, provider: LLMProvider) -> None:
        """Install a custom provider instance (tests) under its `name`."""
        self._providers[provider.name] = provider

    def _build(self, name: str) -> LLMProvider:
        if name == "fake":
            # Imported lazily: the fake responders pull in prompt modules from other layers.
            from ..testing.fakes import build_fake_llm

            return build_fake_llm(latency_seconds=self._settings.fake_latency_seconds)
        raise LLMError(f"Unknown LLM provider '{name}'. Known providers: {', '.join(PROVIDER_NAMES)}.")

    async def aclose(self) -> None:
        for provider in self._providers.values():
            await provider.aclose()

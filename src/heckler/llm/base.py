"""Provider-agnostic LLM interface. Attackers and the Simula adapter depend only on this module."""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel

from ..domain.models import ChatMessage


class LLMError(RuntimeError):
    """A provider call failed in a way the caller should surface (not a transient retry)."""


class LLMRefusalError(LLMError):
    """The model declined the request (e.g. a safety classifier stop)."""


class LLMResponse(BaseModel):
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    stop_reason: str | None = None
    # USD, when the provider reports it (OpenRouter returns `usage.cost` on every call).
    cost: float | None = None


class LLMProvider(ABC):
    """One chat-completion backend. Implementations own their SDK client, auth, and retries."""

    name: str

    @abstractmethod
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
        """Return the assistant reply to `messages` under `system`.

        `messages` must only contain `user`/`assistant` roles. `cache_system` is a hint that the
        system prompt will be resent many times (multi-turn role-play) and should be prompt-cached
        where the provider supports it.
        """

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None


def group_consecutive(messages: list[ChatMessage]) -> list[tuple[str, list[str]]]:
    """Group same-role neighbours into one turn while keeping every message as its own text part.

    For APIs whose turns must alternate. Contents are never concatenated into one string: each
    original message stays a separate content block inside the turn.
    """
    turns: list[tuple[str, list[str]]] = []
    for message in messages:
        if turns and turns[-1][0] == message.role:
            turns[-1][1].append(message.content)
        else:
            turns.append((message.role, [message.content]))
    return turns

"""Interface to the agent under test (the "happy model")."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..domain.models import ChatMessage


class TargetError(RuntimeError):
    """The target endpoint failed or returned something unusable."""


@dataclass
class TargetReply:
    text: str
    # None: the endpoint doesn't report usage (custom HTTP agents, the offline demo).
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost: float | None = None


class TargetClient(ABC):
    @abstractmethod
    async def reply(self, history: list[ChatMessage]) -> str:
        """Return the target's next reply.

        `history` is the conversation from the target's point of view: `user` messages are what the
        attacker said, `assistant` messages are the target's earlier replies. It never contains the
        target's system prompt; clients that need it inject it themselves.
        """

    async def respond(self, history: list[ChatMessage]) -> TargetReply:
        """`reply` plus the call's usage, for endpoints that report it."""
        return TargetReply(text=await self.reply(history))

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None

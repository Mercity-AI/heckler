"""Interface to the agent under test (the "happy model")."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..domain.models import ChatMessage


class TargetError(RuntimeError):
    """The target endpoint failed or returned something unusable."""


class TargetClient(ABC):
    @abstractmethod
    async def reply(self, history: list[ChatMessage]) -> str:
        """Return the target's next reply.

        `history` is the conversation from the target's point of view: `user` messages are what the
        attacker said, `assistant` messages are the target's earlier replies. It never contains the
        target's system prompt; clients that need it inject it themselves.
        """

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None

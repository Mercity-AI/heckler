"""Offline scripted target. Deterministic, so demos and tests produce a mix of passes and breaks."""

from __future__ import annotations

from ..domain.models import ChatMessage, FakeConnection
from .base import TargetClient

_PRESSURE_WORDS = ("manager", "lawyer", "urgent", "ignore", "exception", "supervisor", "developer", "admin", "please")


class FakeTarget(TargetClient):
    def __init__(self, connection: FakeConnection) -> None:
        self._behavior = connection.behavior

    async def reply(self, history: list[ChatMessage]) -> str:
        last = history[-1].content.lower() if history else ""
        turn = sum(1 for m in history if m.role == "user")
        pressured = any(word in last for word in _PRESSURE_WORDS)
        if self._behavior == "leaky" and pressured and turn >= 2:
            return (
                "Okay, I understand this is frustrating. I'll make an exception just this once and go "
                "outside our usual policy for you. Consider it done."
            )
        if turn == 1:
            return "Hi! Thanks for reaching out. I'm happy to help. Could you share a few more details?"
        return (
            "I understand, and I'm sorry for the trouble. I have to follow our policy here, but I can "
            "connect you with a human specialist who can review your case."
        )

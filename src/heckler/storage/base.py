"""Persistence interface. The engine and API depend on this, never on a concrete database."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..domain.models import Conversation, Run, Target


class NotFoundError(KeyError):
    pass


class Repository(ABC):
    # targets
    @abstractmethod
    async def save_target(self, target: Target) -> None: ...

    @abstractmethod
    async def get_target(self, target_id: str) -> Target: ...

    @abstractmethod
    async def list_targets(self) -> list[Target]: ...

    @abstractmethod
    async def delete_target(self, target_id: str) -> None: ...

    # runs
    @abstractmethod
    async def save_run(self, run: Run) -> None: ...

    @abstractmethod
    async def get_run(self, run_id: str) -> Run: ...

    @abstractmethod
    async def list_runs(self, target_id: str | None = None, limit: int = 50) -> list[Run]: ...

    # conversations
    @abstractmethod
    async def save_conversation(self, conversation: Conversation) -> None: ...

    @abstractmethod
    async def get_conversation(self, conversation_id: str) -> Conversation: ...

    @abstractmethod
    async def list_conversations(self, run_id: str) -> list[Conversation]: ...

    async def close(self) -> None:  # pragma: no cover - default no-op
        return None

"""SQLite repository (stdlib sqlite3, run off the event loop).

Each entity is stored as its full JSON document plus a few indexed columns for listing. That keeps the
schema trivial while the domain models evolve; swap in Postgres by implementing `Repository`.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from typing import Any

from ..domain.models import Conversation, OpenAIChatConnection, Run, Target
from .base import NotFoundError, Repository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS targets (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_target ON runs (target_id, created_at);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_run ON conversations (run_id, idx);
"""


def _target_to_json(target: Target) -> str:
    data = target.model_dump(mode="json")
    # SecretStr serialises as "**********"; persist the real value (the API layer masks it on the way out).
    if isinstance(target.connection, OpenAIChatConnection) and target.connection.api_key is not None:
        data["connection"]["api_key"] = target.connection.api_key.get_secret_value()
    return json.dumps(data)


class SQLiteRepository(Repository):
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        self._lock = asyncio.Lock()

    async def _run(self, sql: str, params: tuple[Any, ...] = (), *, fetch: bool = False) -> list[tuple[Any, ...]]:
        def work() -> list[tuple[Any, ...]]:
            cursor = self._conn.execute(sql, params)
            rows = cursor.fetchall() if fetch else []
            if not fetch:
                self._conn.commit()
            return rows

        async with self._lock:
            return await asyncio.to_thread(work)

    # --- targets ---
    async def save_target(self, target: Target) -> None:
        await self._run(
            "INSERT OR REPLACE INTO targets (id, created_at, data) VALUES (?, ?, ?)",
            (target.id, target.created_at.isoformat(), _target_to_json(target)),
        )

    async def get_target(self, target_id: str) -> Target:
        rows = await self._run("SELECT data FROM targets WHERE id = ?", (target_id,), fetch=True)
        if not rows:
            raise NotFoundError(f"target {target_id} not found")
        return Target.model_validate_json(rows[0][0])

    async def list_targets(self) -> list[Target]:
        rows = await self._run("SELECT data FROM targets ORDER BY created_at DESC", fetch=True)
        return [Target.model_validate_json(r[0]) for r in rows]

    async def delete_target(self, target_id: str) -> None:
        await self.get_target(target_id)
        await self._run("DELETE FROM targets WHERE id = ?", (target_id,))

    # --- runs ---
    async def save_run(self, run: Run) -> None:
        await self._run(
            "INSERT OR REPLACE INTO runs (id, target_id, status, created_at, data) VALUES (?, ?, ?, ?, ?)",
            (run.id, run.target_id, run.status.value, run.created_at.isoformat(), run.model_dump_json()),
        )

    async def get_run(self, run_id: str) -> Run:
        rows = await self._run("SELECT data FROM runs WHERE id = ?", (run_id,), fetch=True)
        if not rows:
            raise NotFoundError(f"run {run_id} not found")
        return Run.model_validate_json(rows[0][0])

    async def list_runs(self, target_id: str | None = None, limit: int = 50) -> list[Run]:
        if target_id:
            rows = await self._run(
                "SELECT data FROM runs WHERE target_id = ? ORDER BY created_at DESC LIMIT ?", (target_id, limit), fetch=True
            )
        else:
            rows = await self._run("SELECT data FROM runs ORDER BY created_at DESC LIMIT ?", (limit,), fetch=True)
        return [Run.model_validate_json(r[0]) for r in rows]

    # --- conversations ---
    async def save_conversation(self, conversation: Conversation) -> None:
        await self._run(
            "INSERT OR REPLACE INTO conversations (id, run_id, idx, data) VALUES (?, ?, ?, ?)",
            (conversation.id, conversation.run_id, conversation.index, conversation.model_dump_json()),
        )

    async def get_conversation(self, conversation_id: str) -> Conversation:
        rows = await self._run("SELECT data FROM conversations WHERE id = ?", (conversation_id,), fetch=True)
        if not rows:
            raise NotFoundError(f"conversation {conversation_id} not found")
        return Conversation.model_validate_json(rows[0][0])

    async def list_conversations(self, run_id: str) -> list[Conversation]:
        rows = await self._run("SELECT data FROM conversations WHERE run_id = ? ORDER BY idx", (run_id,), fetch=True)
        return [Conversation.model_validate_json(r[0]) for r in rows]

    async def close(self) -> None:
        async with self._lock:
            self._conn.close()

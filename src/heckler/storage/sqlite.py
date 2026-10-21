"""SQLite repository (stdlib sqlite3, run off the event loop).

Each entity is stored as its full JSON document plus a few indexed columns for listing. That keeps the
schema trivial while the domain models evolve; swap in Postgres by implementing `Repository`.

With a cipher, the JSON document is encrypted (see storage.encryption). Only the listing columns stay in
the clear: ids, owner id, status, the example flag and timestamps. Nothing a user typed or a model wrote.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
from pathlib import Path
from typing import Any

from ..domain.models import Conversation, OpenAIChatConnection, Run, Target
from .base import NotFoundError, Repository
from .encryption import DocumentCipher, EncryptionError

logger = logging.getLogger(__name__)

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

_TABLES = ("targets", "runs", "conversations")

# Listing columns added once documents became encrypted (json_extract can't see inside ciphertext).
# table -> [(column, declaration, SQL expression that backfills it from a plaintext row)]
_LISTING_COLUMNS: dict[str, list[tuple[str, str, str]]] = {
    "targets": [("owner_id", "TEXT", "json_extract(data, '$.owner_id')")],
    "runs": [
        ("owner_id", "TEXT", "json_extract(data, '$.owner_id')"),
        # rows written before the flag existed have no "example" key: they are regular runs
        ("example", "INTEGER NOT NULL DEFAULT 0", "COALESCE(json_extract(data, '$.example'), 0)"),
    ],
}


def _target_to_json(target: Target) -> str:
    data = target.model_dump(mode="json")
    # SecretStr serialises as "**********"; persist the real value (the API layer masks it on the way out).
    if isinstance(target.connection, OpenAIChatConnection) and target.connection.api_key is not None:
        data["connection"]["api_key"] = target.connection.api_key.get_secret_value()
    if target.evaluator is not None and target.evaluator.api_key is not None:
        data["evaluator"]["api_key"] = target.evaluator.api_key.get_secret_value()
    return json.dumps(data)


def _is_plaintext(data: str) -> bool:
    # Documents are JSON objects; Fernet tokens are base64 and never start with "{".
    return data.startswith("{")


class SQLiteRepository(Repository):
    def __init__(self, path: Path, cipher: DocumentCipher | None = None) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._cipher = cipher
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        # Deleted rows are overwritten with zeros instead of lingering in free pages.
        self._conn.execute("PRAGMA secure_delete=ON")
        self._conn.executescript(_SCHEMA)
        self._migrate()
        self._lock = asyncio.Lock()

    def _migrate(self) -> None:
        """Add the listing columns, then encrypt any plaintext documents (or refuse to start without a key)."""
        for table, columns in _LISTING_COLUMNS.items():
            existing = {row[1] for row in self._conn.execute(f"PRAGMA table_info({table})")}
            for column, declaration, backfill in columns:
                if column not in existing:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")
                    self._conn.execute(f"UPDATE {table} SET {column} = {backfill} WHERE substr(data, 1, 1) = '{{'")
        self._conn.commit()

        if self._cipher is None:
            for table in _TABLES:
                if self._conn.execute(f"SELECT 1 FROM {table} WHERE substr(data, 1, 1) != '{{' LIMIT 1").fetchone():
                    raise EncryptionError("The database holds encrypted data but HECKLER_ENCRYPTION_KEY is not set.")
            logger.warning("HECKLER_ENCRYPTION_KEY is not set: agents and runs are stored UNENCRYPTED (local dev only)")
            return

        changed = 0
        for table in _TABLES:
            sample = self._conn.execute(f"SELECT data FROM {table} WHERE substr(data, 1, 1) != '{{' LIMIT 1").fetchone()
            if sample:
                self._cipher.decrypt(sample[0])  # a wrong key fails at startup, not mid-request
            # Plaintext rows get encrypted; when rotating, encrypted ones also move to the primary key.
            only_plaintext = "" if self._cipher.rotating else " WHERE substr(data, 1, 1) = '{'"
            for row_id, data in self._conn.execute(f"SELECT id, data FROM {table}{only_plaintext}").fetchall():
                sealed = self._cipher.encrypt(data) if _is_plaintext(data) else self._cipher.rotate(data)
                self._conn.execute(f"UPDATE {table} SET data = ? WHERE id = ?", (sealed, row_id))
                changed += 1
        self._conn.commit()
        if changed:
            # Rewrite the file and empty the WAL so no old plaintext (or old-key ciphertext) survives on disk.
            self._conn.execute("VACUUM")
            self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            logger.info("encrypted %d stored document(s) under the current key", changed)

    def _seal(self, plaintext: str) -> str:
        return self._cipher.encrypt(plaintext) if self._cipher else plaintext

    def _open(self, data: str) -> str:
        if _is_plaintext(data):
            return data
        if self._cipher is None:
            raise EncryptionError("Stored data is encrypted but HECKLER_ENCRYPTION_KEY is not set.")
        return self._cipher.decrypt(data)

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
            "INSERT OR REPLACE INTO targets (id, created_at, owner_id, data) VALUES (?, ?, ?, ?)",
            (target.id, target.created_at.isoformat(), target.owner_id, self._seal(_target_to_json(target))),
        )

    async def get_target(self, target_id: str) -> Target:
        rows = await self._run("SELECT data FROM targets WHERE id = ?", (target_id,), fetch=True)
        if not rows:
            raise NotFoundError(f"target {target_id} not found")
        return Target.model_validate_json(self._open(rows[0][0]))

    async def list_targets(self, owner_id: str | None = None) -> list[Target]:
        if owner_id is None:
            rows = await self._run("SELECT data FROM targets ORDER BY created_at DESC", fetch=True)
        else:
            rows = await self._run("SELECT data FROM targets WHERE owner_id = ? ORDER BY created_at DESC", (owner_id,), fetch=True)
        return [Target.model_validate_json(self._open(r[0])) for r in rows]

    async def delete_target(self, target_id: str) -> None:
        await self.get_target(target_id)
        await self._run("DELETE FROM targets WHERE id = ?", (target_id,))

    # --- runs ---
    async def save_run(self, run: Run) -> None:
        await self._run(
            "INSERT OR REPLACE INTO runs (id, target_id, status, created_at, owner_id, example, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (run.id, run.target_id, run.status.value, run.created_at.isoformat(), run.owner_id, int(run.example), self._seal(run.model_dump_json())),
        )

    async def get_run(self, run_id: str) -> Run:
        rows = await self._run("SELECT data FROM runs WHERE id = ?", (run_id,), fetch=True)
        if not rows:
            raise NotFoundError(f"run {run_id} not found")
        return Run.model_validate_json(self._open(rows[0][0]))

    async def list_runs(
        self, target_id: str | None = None, limit: int = 50, *, example: bool | None = False, owner_id: str | None = None
    ) -> list[Run]:
        where: list[str] = []
        params: list[Any] = []
        if target_id:
            where.append("target_id = ?")
            params.append(target_id)
        if example is not None:
            where.append("example = ?")
            params.append(int(example))
        if owner_id is not None:
            where.append("owner_id = ?")
            params.append(owner_id)
        clause = f"WHERE {' AND '.join(where)} " if where else ""
        rows = await self._run(f"SELECT data FROM runs {clause}ORDER BY created_at DESC LIMIT ?", (*params, limit), fetch=True)
        return [Run.model_validate_json(self._open(r[0])) for r in rows]

    async def delete_run(self, run_id: str) -> None:
        await self.get_run(run_id)
        await self._run("DELETE FROM conversations WHERE run_id = ?", (run_id,))
        await self._run("DELETE FROM runs WHERE id = ?", (run_id,))

    # --- conversations ---
    async def save_conversation(self, conversation: Conversation) -> None:
        await self._run(
            "INSERT OR REPLACE INTO conversations (id, run_id, idx, data) VALUES (?, ?, ?, ?)",
            (conversation.id, conversation.run_id, conversation.index, self._seal(conversation.model_dump_json())),
        )

    async def get_conversation(self, conversation_id: str) -> Conversation:
        rows = await self._run("SELECT data FROM conversations WHERE id = ?", (conversation_id,), fetch=True)
        if not rows:
            raise NotFoundError(f"conversation {conversation_id} not found")
        return Conversation.model_validate_json(self._open(rows[0][0]))

    async def list_conversations(self, run_id: str) -> list[Conversation]:
        rows = await self._run("SELECT data FROM conversations WHERE run_id = ? ORDER BY idx", (run_id,), fetch=True)
        return [Conversation.model_validate_json(self._open(r[0])) for r in rows]

    async def close(self) -> None:
        async with self._lock:
            self._conn.close()

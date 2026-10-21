from __future__ import annotations

from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from heckler.config import Settings
from heckler.domain.models import (
    Conversation,
    EvaluatorConnection,
    OpenAIChatConnection,
    Run,
    RunConfig,
    Scenario,
    Target,
    TranscriptMessage,
)
from heckler.storage.encryption import EncryptionError, build_cipher, DocumentCipher
from heckler.storage.sqlite import SQLiteRepository

API_KEY = "sk-or-SUPERSECRET-target-key"
EVAL_KEY = "sk-or-SUPERSECRET-evaluator-key"
PROMPT = "You are Zed. The vault code is SECRET-PROMPT-4471."
TRANSCRIPT = "my card number is SECRET-TRANSCRIPT-9921"
NAME = "SECRET-NAME-Zed-5512"
SECRETS = (API_KEY, EVAL_KEY, PROMPT, TRANSCRIPT, NAME)


def _key() -> str:
    return Fernet.generate_key().decode()


def _target(owner: str = "user_1") -> Target:
    return Target(
        name=NAME,
        system_prompt=PROMPT,
        connection=OpenAIChatConnection(base_url="https://example.test/v1", model="m", api_key=SecretStr(API_KEY)),
        evaluator=EvaluatorConnection(base_url="https://example.test/v1", model="e", api_key=SecretStr(EVAL_KEY)),
        owner_id=owner,
    )


async def _populate(repo: SQLiteRepository) -> tuple[Target, Run, Conversation]:
    target = _target()
    run = Run(target_id=target.id, target_name=target.name, config=RunConfig(focus=PROMPT), owner_id=target.owner_id)
    scenario = Scenario(
        title="t", category="c", persona="p", emotional_state="e", context=PROMPT, goal="g",
        policy_focus="f", expected_behavior="b",
    )
    conversation = Conversation(
        run_id=run.id, index=0, agent_name="a", scenario=scenario,
        messages=[TranscriptMessage(role="attacker", content=TRANSCRIPT, turn=1)],
    )
    await repo.save_target(target)
    await repo.save_run(run)
    await repo.save_run(Run(target_id=target.id, target_name="x", config=RunConfig(), example=True, owner_id="user_1"))
    await repo.save_conversation(conversation)
    return target, run, conversation


def _on_disk(db: Path) -> bytes:
    """Every byte SQLite has written for this database: the main file plus WAL and journal."""
    return b"".join(p.read_bytes() for p in db.parent.glob(db.name + "*"))


def _assert_no_secrets(db: Path) -> None:
    raw = _on_disk(db)
    for secret in SECRETS:
        assert secret.encode() not in raw, f"{secret!r} found in plaintext on disk"


async def _assert_readable(repo: SQLiteRepository, target: Target, run: Run, conversation: Conversation) -> None:
    loaded = await repo.get_target(target.id)
    assert loaded.system_prompt == PROMPT
    assert loaded.connection.api_key.get_secret_value() == API_KEY
    assert loaded.evaluator.api_key.get_secret_value() == EVAL_KEY
    assert [t.id for t in await repo.list_targets(owner_id="user_1")] == [target.id]
    assert await repo.list_targets(owner_id="someone_else") == []
    assert [r.id for r in await repo.list_runs(owner_id="user_1")] == [run.id]  # the example run is filtered out
    assert len(await repo.list_runs(example=None)) == 2
    assert len(await repo.list_runs(example=True)) == 1
    assert (await repo.list_conversations(run.id))[0].messages[0].content == TRANSCRIPT
    assert (await repo.get_conversation(conversation.id)).scenario.context == PROMPT


async def test_documents_are_encrypted_at_rest(tmp_path):
    db = tmp_path / "h.sqlite3"
    repo = SQLiteRepository(db, DocumentCipher([_key()]))
    rows = await _populate(repo)
    await _assert_readable(repo, *rows)
    await repo.close()
    _assert_no_secrets(db)


async def test_existing_plaintext_database_is_encrypted_on_startup(tmp_path):
    db = tmp_path / "h.sqlite3"
    repo = SQLiteRepository(db)  # no key: the old, unencrypted behaviour
    rows = await _populate(repo)
    await repo.close()
    assert PROMPT.encode() in _on_disk(db)

    repo = SQLiteRepository(db, DocumentCipher([_key()]))
    await _assert_readable(repo, *rows)
    await repo.close()
    _assert_no_secrets(db)


async def test_database_from_before_listing_columns_is_migrated(tmp_path):
    import sqlite3

    db = tmp_path / "h.sqlite3"
    target = _target()
    conn = sqlite3.connect(db)
    # The schema and row format as they were before encryption existed.
    conn.executescript(
        "CREATE TABLE targets (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);"
        "CREATE TABLE runs (id TEXT PRIMARY KEY, target_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);"
    )
    conn.execute("INSERT INTO targets VALUES (?, ?, ?)", (target.id, target.created_at.isoformat(), target.model_dump_json()))
    run = Run(target_id=target.id, target_name="n", config=RunConfig(), owner_id="user_1")
    data = run.model_dump_json(exclude={"example"})  # rows written before the example flag existed
    conn.execute("INSERT INTO runs VALUES (?, ?, ?, ?, ?)", (run.id, run.target_id, run.status.value, run.created_at.isoformat(), data))
    conn.commit()
    conn.close()

    repo = SQLiteRepository(db, DocumentCipher([_key()]))
    assert [t.id for t in await repo.list_targets(owner_id="user_1")] == [target.id]
    assert [r.id for r in await repo.list_runs(owner_id="user_1")] == [run.id]
    await repo.close()
    assert PROMPT.encode() not in _on_disk(db)


async def test_encrypted_database_needs_the_right_key(tmp_path):
    db = tmp_path / "h.sqlite3"
    repo = SQLiteRepository(db, DocumentCipher([_key()]))
    await _populate(repo)
    await repo.close()

    with pytest.raises(EncryptionError, match="not set"):
        SQLiteRepository(db)
    with pytest.raises(EncryptionError, match="does not match"):
        SQLiteRepository(db, DocumentCipher([_key()]))


async def test_key_rotation(tmp_path):
    db = tmp_path / "h.sqlite3"
    old, new = _key(), _key()
    repo = SQLiteRepository(db, DocumentCipher([old]))
    rows = await _populate(repo)
    await repo.close()

    SQLiteRepository(db, DocumentCipher([new, old]))  # re-encrypts everything under `new`
    repo = SQLiteRepository(db, DocumentCipher([new]))  # so the old key can be dropped
    await _assert_readable(repo, *rows)
    await repo.close()


def test_build_cipher(tmp_path):
    base = {"_env_file": None, "data_dir": tmp_path}
    assert build_cipher(Settings(**base)) is None  # local dev, sign-in off
    with pytest.raises(EncryptionError, match="must be set"):
        build_cipher(Settings(**base, clerk_publishable_key="pk_test_x"))
    with pytest.raises(EncryptionError, match="not a valid key"):
        build_cipher(Settings(**base, encryption_key="nope"))
    cipher = build_cipher(Settings(**base, clerk_publishable_key="pk_test_x", encryption_key=f"{_key()}, {_key()}"))
    assert cipher is not None and cipher.rotating

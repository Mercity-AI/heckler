"""Builds the right TargetClient for a registered Target."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values

from ..config import Settings
from ..domain.models import FakeConnection, HttpConnection, OpenAIChatConnection, Target
from .base import TargetClient
from .fake import FakeTarget
from .http_endpoint import HttpTarget
from .openai_chat import OpenAIChatTarget


def resolve_env_secret(name: str, env_file: Path = Path(".env")) -> str | None:
    """Look a secret up in the process environment, then in the project `.env` file."""
    return os.environ.get(name) or dotenv_values(env_file).get(name)


def build_target_client(target: Target, settings: Settings) -> TargetClient:
    conn = target.connection
    if isinstance(conn, OpenAIChatConnection):
        api_key = conn.api_key.get_secret_value() if conn.api_key else None
        # Server-side keys are never handed to user-configured endpoints on public deployments.
        if api_key is None and conn.api_key_env and not settings.require_user_keys:
            api_key = resolve_env_secret(conn.api_key_env)
        return OpenAIChatTarget(conn, system_prompt=target.system_prompt, api_key=api_key, timeout=settings.target_timeout_seconds)
    if isinstance(conn, HttpConnection):
        return HttpTarget(conn, system_prompt=target.system_prompt, timeout=settings.target_timeout_seconds)
    if isinstance(conn, FakeConnection):
        return FakeTarget(conn)
    raise TypeError(f"Unsupported target connection: {type(conn).__name__}")

"""Builds the right TargetClient for a registered Target."""

from __future__ import annotations

from ..config import Settings
from ..domain.models import FakeConnection, HttpConnection, OpenAIChatConnection, Target
from .base import TargetClient
from .fake import FakeTarget
from .http_endpoint import HttpTarget
from .openai_chat import OpenAIChatTarget


def build_target_client(target: Target, settings: Settings) -> TargetClient:
    conn = target.connection
    if isinstance(conn, OpenAIChatConnection):
        # Only the key the agent's owner saved; server-side keys are never handed to user endpoints.
        api_key = conn.api_key.get_secret_value() if conn.api_key else None
        return OpenAIChatTarget(conn, system_prompt=target.system_prompt, api_key=api_key, timeout=settings.target_timeout_seconds)
    if isinstance(conn, HttpConnection):
        return HttpTarget(conn, system_prompt=target.system_prompt, timeout=settings.target_timeout_seconds)
    if isinstance(conn, FakeConnection):
        return FakeTarget(conn)
    raise TypeError(f"Unsupported target connection: {type(conn).__name__}")

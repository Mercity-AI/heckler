"""Target exposed as a generic JSON-over-HTTP endpoint (a custom agent backend)."""

from __future__ import annotations

from typing import Any

import httpx

from ..domain.models import ChatMessage, HttpConnection
from .base import TargetClient, TargetError


def extract_path(payload: Any, path: str) -> Any:
    """Follow a dotted path through dicts/lists: `choices.0.message.content`."""
    current = payload
    for part in path.split(".") if path else []:
        if isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        elif isinstance(current, dict) and part in current:
            current = current[part]
        else:
            raise TargetError(f"response_path '{path}' not found in target response (failed at '{part}').")
    return current


class HttpTarget(TargetClient):
    def __init__(self, connection: HttpConnection, *, system_prompt: str, timeout: float) -> None:
        self._conn = connection
        self._system_prompt = system_prompt
        self._client = httpx.AsyncClient(timeout=timeout, headers=connection.headers)

    async def reply(self, history: list[ChatMessage]) -> str:
        messages = [{"role": m.role, "content": m.content} for m in history]
        if self._conn.send_system_prompt:
            messages.insert(0, {"role": "system", "content": self._system_prompt})
        body = {**self._conn.extra_body, self._conn.messages_field: messages}
        try:
            response = await self._client.post(self._conn.url, json=body)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise TargetError(f"Target returned HTTP {exc.response.status_code}: {exc.response.text[:300]}") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise TargetError(f"Target request to {self._conn.url} failed: {exc}") from exc
        text = extract_path(payload, self._conn.response_path)
        if not isinstance(text, str) or not text.strip():
            raise TargetError(f"Target response at '{self._conn.response_path}' is not a non-empty string.")
        return text.strip()

    async def aclose(self) -> None:
        await self._client.aclose()

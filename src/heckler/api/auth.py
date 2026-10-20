"""Clerk authentication: verifies Clerk session tokens and scopes data to the signed-in user.

With no Clerk key configured, auth is off and every request is served as one local user that sees
all data (the single-user, run-it-on-your-laptop mode).
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status

from ..domain.models import Run, Target
from ..storage.base import NotFoundError
from .container import Container, get_container

# Clerk keeps the session token in this cookie on the app's own domain, so same-origin requests
# that cannot set headers (EventSource) still authenticate.
SESSION_COOKIE = "__session"


@dataclass(frozen=True)
class User:
    # None when auth is off: no ownership filtering.
    id: str | None


LOCAL_USER = User(id=None)


def _token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return request.cookies.get(SESSION_COOKIE)


async def current_user(request: Request, c: Container = Depends(get_container)) -> User:
    if c.auth is None:
        return LOCAL_USER
    token = _token(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    try:
        return User(id=await c.auth.verify(token))
    except (jwt.PyJWTError, KeyError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"}) from exc


def check_owner(item: Target | Run, user: User) -> None:
    """Someone else's agent or run looks exactly like a missing one."""
    if user.id is not None and item.owner_id != user.id:
        kind = "target" if isinstance(item, Target) else "run"
        raise NotFoundError(f"{kind} {item.id} not found")

"""Clerk auth: token verification, and every agent/run scoped to the user who created it."""

from __future__ import annotations

import base64
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from heckler.api.app import create_app
from heckler.api.clerk import ClerkVerifier, issuer_from_publishable_key

from .conftest import SUPPORT_PROMPT

ISSUER = "https://example-app.clerk.accounts.dev"


class FakeVerifier:
    """Stands in for ClerkVerifier: the token is "token-<user id>"."""

    async def verify(self, token: str) -> str:
        if not token.startswith("token-"):
            raise jwt.InvalidTokenError("bad token")
        return token.removeprefix("token-")


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        c.app.state.container.auth = FakeVerifier()
        yield c


def _as(user: str) -> dict:
    return {"Authorization": f"Bearer token-{user}"}


def _create_target(client: TestClient, user: str) -> str:
    body = {"name": "ShopFast Ava", "system_prompt": SUPPORT_PROMPT, "connection": {"kind": "fake", "behavior": "leaky"}}
    response = client.post("/targets", json=body, headers=_as(user))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_requests_without_a_valid_token_are_rejected(client):
    assert client.get("/targets").status_code == 401
    assert client.get("/runs", headers={"Authorization": "Bearer nope"}).status_code == 401
    # health and the public config stay open: the UI reads them before sign-in
    assert client.get("/health").status_code == 200
    assert client.get("/config").status_code == 200


def test_each_user_only_sees_their_own_agents_and_runs(client):
    target_id = _create_target(client, "alice")
    run_id = client.post("/runs", json={"target_id": target_id, "num_scenarios": 2, "max_turns": 2}, headers=_as("alice")).json()["id"]

    assert [t["id"] for t in client.get("/targets", headers=_as("alice")).json()] == [target_id]
    assert client.get("/targets", headers=_as("bob")).json() == []
    assert client.get("/runs", headers=_as("bob")).json() == []

    # someone else's agent or run is indistinguishable from a missing one
    assert client.get(f"/targets/{target_id}", headers=_as("bob")).status_code == 404
    assert client.put(f"/targets/{target_id}", json={"name": "x", "system_prompt": "x", "connection": {"kind": "fake"}}, headers=_as("bob")).status_code == 404
    assert client.delete(f"/targets/{target_id}", headers=_as("bob")).status_code == 404
    assert client.post(f"/targets/{target_id}/probe", headers=_as("bob")).status_code == 404
    assert client.post("/runs", json={"target_id": target_id}, headers=_as("bob")).status_code == 404
    assert client.get(f"/runs/{run_id}", headers=_as("bob")).status_code == 404
    assert client.get(f"/runs/{run_id}/events", headers=_as("bob")).status_code == 404
    assert client.delete(f"/runs/{run_id}", headers=_as("bob")).status_code == 404

    bob_target = _create_target(client, "bob")
    reuse = {"target_id": bob_target, "reuse_scenarios_from_run_id": run_id}
    assert client.post("/runs", json=reuse, headers=_as("bob")).status_code == 404

    assert client.get(f"/runs/{run_id}", headers=_as("alice")).status_code == 200


def test_event_stream_authenticates_with_the_session_cookie(client):
    target_id = _create_target(client, "alice")
    run_id = client.post("/runs", json={"target_id": target_id, "num_scenarios": 1, "max_turns": 2}, headers=_as("alice")).json()["id"]
    client.cookies.set("__session", "token-alice")
    try:
        with client.stream("GET", f"/runs/{run_id}/events") as stream:
            assert stream.status_code == 200
    finally:
        client.cookies.clear()


def test_example_runs_are_kept_per_user(client):
    body = {"name": "Demo", "system_prompt": SUPPORT_PROMPT, "num_scenarios": 1, "max_turns": 2}
    alice = client.post("/runs/example", json=body, headers=_as("alice")).json()["id"]
    client.post("/runs/example", json=body, headers=_as("bob"))
    # bob's demo must not delete alice's
    assert client.get(f"/runs/{alice}", headers=_as("alice")).status_code == 200


def test_auth_is_off_without_a_clerk_key(settings):
    with TestClient(create_app(settings)) as c:
        assert c.app.state.container.auth is None
        assert c.get("/targets").status_code == 200


def test_issuer_is_derived_from_the_publishable_key():
    key = "pk_test_" + base64.b64encode(b"example-app.clerk.accounts.dev$").decode().rstrip("=")
    assert issuer_from_publishable_key(key) == ISSUER
    with pytest.raises(ValueError):
        issuer_from_publishable_key("not-a-key")


def _verifier_with_key(parties: list[str]) -> tuple[ClerkVerifier, rsa.RSAPrivateKey]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = ClerkVerifier(ISSUER, parties)
    verifier._jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=private.public_key()))
    return verifier, private


def _token(private: rsa.RSAPrivateKey, **overrides) -> str:
    now = int(time.time())
    claims = {"sub": "user_123", "iss": ISSUER, "iat": now, "exp": now + 60, "azp": "http://localhost:5173", **overrides}
    return jwt.encode(claims, private, algorithm="RS256")


async def test_clerk_verifier_checks_signature_issuer_expiry_and_origin():
    verifier, private = _verifier_with_key(["http://localhost:5173"])
    assert await verifier.verify(_token(private)) == "user_123"

    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    bad = [
        _token(other_key),
        _token(private, iss="https://evil.example"),
        _token(private, exp=int(time.time()) - 60),
        _token(private, azp="https://evil.example"),
    ]
    for token in bad:
        with pytest.raises(jwt.PyJWTError):
            await verifier.verify(token)

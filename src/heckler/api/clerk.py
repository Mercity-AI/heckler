"""Clerk session-token verification (RS256 JWTs signed with the instance's JWKS)."""

from __future__ import annotations

import asyncio
import base64

import jwt


def issuer_from_publishable_key(key: str) -> str:
    """`pk_test_<base64("<frontend-api-host>$")>` -> `https://<frontend-api-host>`."""
    try:
        encoded = key.split("_", 2)[2]
        host = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
    except (IndexError, ValueError) as exc:
        raise ValueError("HECKLER_CLERK_PUBLISHABLE_KEY is not a Clerk publishable key (pk_test_... / pk_live_...).") from exc
    return f"https://{host}"


class ClerkVerifier:
    def __init__(self, issuer: str, authorized_parties: list[str]) -> None:
        self.issuer = issuer.rstrip("/")
        self._parties = authorized_parties
        self._jwks = jwt.PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)

    def _verify(self, token: str) -> str:
        key = self._jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"], issuer=self.issuer, leeway=5, options={"require": ["exp", "iat", "sub"]}
        )
        if self._parties and claims.get("azp") not in self._parties:
            raise jwt.InvalidTokenError("token issued for an unexpected origin")
        return claims["sub"]

    async def verify(self, token: str) -> str:
        """The Clerk user id for a valid session token. JWKS fetches block, so run off the event loop."""
        return await asyncio.to_thread(self._verify, token)

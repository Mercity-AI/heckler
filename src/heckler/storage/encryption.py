"""Encryption at rest for user data (agent keys, system prompts, scenarios, transcripts).

Every stored document is encrypted with Fernet (AES-128-CBC + HMAC-SHA256) under the key in
HECKLER_ENCRYPTION_KEY. The key lives only in the server's environment, never next to the database, so a
copy of the DB file or a backup is unreadable on its own.

Rotation: set HECKLER_ENCRYPTION_KEY to "new_key,old_key". New writes use the first key; reads try each.
Generate a key with:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from ..config import Settings


class EncryptionError(RuntimeError):
    pass


class DocumentCipher:
    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise EncryptionError("At least one encryption key is required.")
        # More than one key: the old ones are only kept to re-encrypt existing data under the first.
        self.rotating = len(keys) > 1
        try:
            self._fernet = MultiFernet([Fernet(k.encode()) for k in keys])
        except ValueError as exc:
            raise EncryptionError(
                "HECKLER_ENCRYPTION_KEY is not a valid key (expected 32 url-safe base64-encoded bytes). "
                'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            ) from exc

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except InvalidToken as exc:
            raise EncryptionError("Stored data could not be decrypted: HECKLER_ENCRYPTION_KEY does not match the key it was written with.") from exc

    def rotate(self, token: str) -> str:
        """Re-encrypt under the primary key."""
        try:
            return self._fernet.rotate(token.encode()).decode()
        except InvalidToken as exc:
            raise EncryptionError("Stored data could not be decrypted with any key in HECKLER_ENCRYPTION_KEY.") from exc


def build_cipher(settings: Settings) -> DocumentCipher | None:
    """The cipher for this deployment, or None for an unencrypted local dev setup.

    With sign-in on (a multi-user deployment) a missing key is a hard error: never store user data in plaintext.
    """
    raw = settings.encryption_key.get_secret_value() if settings.encryption_key else ""
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    if keys:
        return DocumentCipher(keys)
    if settings.clerk_publishable_key:
        raise EncryptionError(
            "HECKLER_ENCRYPTION_KEY must be set when sign-in is on, so user data is encrypted at rest. "
            'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return None

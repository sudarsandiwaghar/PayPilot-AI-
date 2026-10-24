"""
Security utilities: token generation, hashing, and HMAC signing.

- Session access tokens: CSPRNG via `secrets.token_urlsafe`, stored as SHA-256 hash.
- Preview tokens: HMAC-SHA256 binding session, cart version, item fingerprint,
  prices, currency, and expiry into a tamper-proof token.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta

# ── Session Access Tokens ─────────────────────────────────────────

TOKEN_PREFIX = "pp_sess_"


def generate_session_token() -> str:
    """Generate a cryptographically secure session access token.

    Returns a 32-byte URL-safe token prefixed with ``pp_sess_`` for easy
    identification in logs and headers.
    """
    return f"{TOKEN_PREFIX}{secrets.token_urlsafe(32)}"


def hash_token(token: str) -> str:
    """Compute the SHA-256 hex digest of a token for storage.

    The plaintext token is never stored — only this hash is persisted
    in the ``shopping_sessions.access_token_hash`` column.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(presented_token: str | None, stored_hash: str | None) -> bool:
    """Constant-time comparison of a presented token against a stored hash."""
    if not isinstance(presented_token, str) or not isinstance(stored_hash, str):
        return False
    presented_hash = hash_token(presented_token)
    return secrets.compare_digest(presented_hash, stored_hash)


def verify_token_hash(presented_hash: str | None, stored_hash: str | None) -> bool:
    """Constant-time comparison of two token hashes."""
    if not isinstance(presented_hash, str) or not isinstance(stored_hash, str):
        return False
    return secrets.compare_digest(presented_hash, stored_hash)


# ── HMAC Preview Tokens ──────────────────────────────────────────


def _build_preview_payload(
    session_id: str,
    cart_version: int,
    item_fingerprint: list[dict],
    currency: str,
    expires_at: datetime,
) -> str:
    """Build a canonical JSON string from the preview's bound values.

    The fingerprint is a list of dicts like:
        [{"product_id": "...", "quantity": 2, "price_minor": 1999}, ...]

    Sorting ensures deterministic serialization regardless of insertion order.
    """
    payload = {
        "session_id": session_id,
        "cart_version": cart_version,
        "items": sorted(item_fingerprint, key=lambda x: x["product_id"]),
        "currency": currency,
        "expires_at": expires_at.isoformat(),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def sign_preview_token(
    secret_key: str,
    session_id: str,
    cart_version: int,
    item_fingerprint: list[dict],
    currency: str,
    ttl_minutes: int,
) -> tuple[str, datetime]:
    """Create an HMAC-signed checkout preview token.

    Returns:
        (token, expires_at) — the hex-encoded HMAC and the expiry timestamp.

    The token binds: session_id, cart version, item fingerprint
    (product IDs + quantities + prices), currency, and expiry.
    """
    expires_at = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
    payload = _build_preview_payload(
        session_id, cart_version, item_fingerprint, currency, expires_at
    )
    signature = hmac.new(
        secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Encode the token as: base payload (for extraction) + "." + signature
    import base64

    encoded_payload = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")
    token = f"{encoded_payload}.{signature}"
    return token, expires_at


def decode_preview_token_signature(
    secret_key: str,
    token: str,
) -> dict | None:
    """Verify an HMAC preview token's signature and format without checking expiry.

    Returns:
        The decoded payload dict if the HMAC signature matches, or None if tampered/malformed.
    """
    import base64

    parts = token.rsplit(".", 1)
    if len(parts) != 2:
        return None

    encoded_payload, presented_signature = parts

    try:
        payload_bytes = base64.urlsafe_b64decode(encoded_payload.encode("ascii"))
        payload_str = payload_bytes.decode("utf-8")
    except Exception:
        return None

    # Recompute HMAC
    expected_signature = hmac.new(
        secret_key.encode("utf-8"),
        payload_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(presented_signature, expected_signature):
        return None

    try:
        return json.loads(payload_str)
    except json.JSONDecodeError:
        return None


def verify_preview_token(
    secret_key: str,
    token: str,
) -> dict | None:
    """Verify an HMAC preview token and return the decoded payload if valid and not expired."""
    payload = decode_preview_token_signature(secret_key, token)
    if payload is None:
        return None

    # Check expiry
    try:
        expires_at = datetime.fromisoformat(payload["expires_at"])
        if datetime.now(UTC) > expires_at:
            return None
    except Exception:
        return None

    return payload

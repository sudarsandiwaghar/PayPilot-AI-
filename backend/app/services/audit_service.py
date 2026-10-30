"""
Audit service.

Writes append-only audit trail records for security, compliance, and domain tracking.
Automatically scrubs sensitive fields (tokens, secrets, credentials) before storing payloads.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent

SENSITIVE_KEYS = {
    "access_token",
    "token",
    "secret",
    "password",
    "paypal_client_secret",
    "authorization",
    "client_secret",
}


def _scrub_payload(data: Any) -> Any:
    """Recursively scrub sensitive keys from an audit payload."""
    if isinstance(data, dict):
        scrubbed = {}
        for k, v in data.items():
            if any(sens in k.lower() for sens in SENSITIVE_KEYS):
                scrubbed[k] = "[REDACTED]"
            else:
                scrubbed[k] = _scrub_payload(v)
        return scrubbed
    if isinstance(data, list):
        return [_scrub_payload(item) for item in data]
    return data


class AuditService:
    """Service writing immutable domain audit events."""

    @staticmethod
    async def emit_event(
        db: AsyncSession,
        event_type: str,
        actor: str = "shopper",
        session_id: UUID | None = None,
        order_id: UUID | None = None,
        payload: dict[str, Any] | None = None,
    ) -> AuditEvent:
        """Record an append-only audit event with secret scrubbing."""
        safe_payload = _scrub_payload(payload) if payload else None

        event = AuditEvent(
            event_type=event_type,
            actor=actor,
            session_id=session_id,
            order_id=order_id,
            payload_json=safe_payload,
        )
        db.add(event)
        # Flush or commit depending on caller context
        return event

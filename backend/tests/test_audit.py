"""
Unit and integration tests for AuditService.

Tests append-only logging, sensitive key scrubbing, and event persistence.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent
from app.services.audit_service import AuditService, _scrub_payload


def test_scrub_payload_removes_sensitive_keys() -> None:
    raw = {
        "access_token": "pp_sess_supersecrettoken",
        "nested": {
            "paypal_client_secret": "rawsecret123",
            "normal_field": "public_data",
        },
        "list_items": [
            {"password": "mypassword", "item_name": "Sony Headphones"}
        ],
    }

    safe = _scrub_payload(raw)
    assert safe["access_token"] == "[REDACTED]"
    assert safe["nested"]["paypal_client_secret"] == "[REDACTED]"
    assert safe["nested"]["normal_field"] == "public_data"
    assert safe["list_items"][0]["password"] == "[REDACTED]"
    assert safe["list_items"][0]["item_name"] == "Sony Headphones"


@pytest.mark.asyncio
async def test_emit_audit_event_persists_in_db(db_session: AsyncSession) -> None:
    from app.models.order import Order
    from app.models.session import ShoppingSession

    session = ShoppingSession(access_token_hash="audithash123")
    db_session.add(session)
    await db_session.flush()

    order = Order(
        session_id=session.id,
        order_number=f"AUDIT-{uuid4().hex[:8]}",
        status="pending_payment",
        subtotal_minor=1999,
        tax_minor=0,
        total_minor=1999,
        currency="USD",
        confirmed_by_shopper=True,
    )
    db_session.add(order)
    await db_session.flush()

    event = await AuditService.emit_event(
        db=db_session,
        event_type="payment.captured",
        actor="system",
        session_id=session.id,
        order_id=order.id,
        payload={"amount_minor": 1999, "token": "secret"},
    )
    await db_session.flush()

    stmt = select(AuditEvent).where(AuditEvent.id == event.id)
    persisted = (await db_session.execute(stmt)).scalar_one()

    assert persisted.event_type == "payment.captured"
    assert persisted.actor == "system"
    assert persisted.session_id == session.id
    assert persisted.order_id == order.id
    assert persisted.payload_json["token"] == "[REDACTED]"
    assert persisted.payload_json["amount_minor"] == 1999

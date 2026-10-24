"""
Health check endpoints.

- ``GET /health``       — Liveness: always returns 200 if the process is alive.
                          Does NOT call the database. Used by orchestrators to
                          detect stuck processes without triggering unnecessary
                          restarts during transient DB outages.

- ``GET /health/ready``  — Readiness: verifies that required dependencies
                          (PostgreSQL, PayPal API) are reachable. Returns 503
                          if any dependency is down. Used by load balancers to
                          drain traffic from unready instances.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas.common import HealthResponse, ReadinessCheck, ReadinessResponse

router = APIRouter()

_APP_VERSION = "0.1.0"


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness check",
    description="Returns 200 if the process is alive. No dependency checks.",
)
async def liveness() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=_APP_VERSION,
        timestamp=datetime.now(UTC),
    )


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Readiness check",
    description="Verifies database and PayPal API reachability. Returns 503 if degraded.",
)
async def readiness(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> ReadinessResponse:
    checks: list[ReadinessCheck] = []

    # ── Check PostgreSQL ─────────────────────────────────────
    db_check = await _check_database(db)
    checks.append(db_check)

    # ── Check PayPal API ─────────────────────────────────────
    paypal_check = await _check_paypal()
    checks.append(paypal_check)

    all_ok = all(c.status == "ok" for c in checks)
    if not all_ok:
        response.status_code = 503

    return ReadinessResponse(
        status="ready" if all_ok else "degraded",
        checks=checks,
        timestamp=datetime.now(UTC),
    )


async def _check_database(db: AsyncSession) -> ReadinessCheck:
    """Ping PostgreSQL with a lightweight query."""
    start = time.monotonic()
    try:
        await db.execute(text("SELECT 1"))
        latency_ms = (time.monotonic() - start) * 1000
        return ReadinessCheck(name="postgresql", status="ok", latency_ms=round(latency_ms, 2))
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        return ReadinessCheck(
            name="postgresql",
            status="unavailable",
            latency_ms=round(latency_ms, 2),
            error=str(exc),
        )


async def _check_paypal() -> ReadinessCheck:
    """Verify PayPal API is reachable with a lightweight GET."""
    settings = get_settings()
    if not settings.paypal_base_url:
        return ReadinessCheck(name="paypal", status="ok", error="Not configured — skipped")

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # PayPal's base URL returns a minimal response — we just need connectivity
            resp = await client.get(f"{settings.paypal_base_url}/v1/oauth2/token", timeout=5.0)
            latency_ms = (time.monotonic() - start) * 1000
            # 401 is expected without credentials — it proves the endpoint is reachable
            if resp.status_code in (200, 401):
                return ReadinessCheck(
                    name="paypal", status="ok", latency_ms=round(latency_ms, 2)
                )
            return ReadinessCheck(
                name="paypal",
                status="unavailable",
                latency_ms=round(latency_ms, 2),
                error=f"Unexpected status {resp.status_code}",
            )
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        return ReadinessCheck(
            name="paypal",
            status="unavailable",
            latency_ms=round(latency_ms, 2),
            error=str(exc),
        )

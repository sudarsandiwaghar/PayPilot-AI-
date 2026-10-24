"""
Tests for health check endpoints.

- GET /api/v1/health       (liveness)
- GET /api/v1/health/ready (readiness)
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_liveness_endpoint(client: AsyncClient) -> None:
    """Liveness check should return 200 with status=ok and app version."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_readiness_endpoint(client: AsyncClient) -> None:
    """Readiness check should ping DB and PayPal."""
    response = await client.get("/api/v1/health/ready")
    assert response.status_code in (200, 503)
    data = response.json()
    assert "status" in data
    assert "checks" in data
    check_names = [c["name"] for c in data["checks"]]
    assert "postgresql" in check_names
    assert "paypal" in check_names
    db_check = next(c for c in data["checks"] if c["name"] == "postgresql")
    assert db_check["status"] == "ok", f"DB check failed with error: {db_check.get('error')}"

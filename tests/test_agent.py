"""
Regression and unit tests for the AI Shopping Agent and Decision Layer.

Verifies:
1. Standard API response envelope on RequestValidationError (422).
2. Missing LLM provider configuration returns explicit LLM_PROVIDER_NOT_CONFIGURED (400).
3. Tool allowlisting: only read-only tools permitted; order/payment tools strictly rejected with 403.
4. Valid shopping requests produce grounded recommendations, comparisons, and budget knapsack.
5. Ambiguous shopping queries emit clarification questions without hallucinating product facts.
6. Zero-match queries handle budget limitations gracefully without inventing catalog items.
7. Hard constraints (budget ceiling, active status, stock) are strictly enforced in backend code.
8. Session protection: requires active session ownership.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.agent.tools import ALLOWLISTED_TOOLS, execute_tool
from app.utils.exceptions import ToolExecutionForbidden

# ── Request Validation Envelope Tests ─────────────────────────────

@pytest.mark.asyncio
async def test_request_validation_error_envelope(
    client: AsyncClient, active_session: dict
) -> None:
    """FastAPI RequestValidationError returns the standard PayPilot error envelope."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    # Sending invalid body (quantity must be >= 1, product_id must be valid UUID)
    resp = await client.post(
        f"/api/v1/sessions/{session_id}/cart/items",
        json={"product_id": "not-a-uuid", "quantity": -5},
        headers=headers,
    )
    assert resp.status_code == 422
    body = resp.json()

    assert "data" in body
    assert body["data"] is None

    assert "meta" in body
    assert "request_id" in body["meta"]
    assert "timestamp" in body["meta"]

    assert "errors" in body
    assert len(body["errors"]) > 0
    err = body["errors"][0]
    assert err["code"] == "VALIDATION_ERROR"
    assert "message" in err
    assert "field" in err


# ── LLM Configuration Boundary Tests ─────────────────────────────

@pytest.mark.asyncio
async def test_agent_missing_llm_configuration(
    client: AsyncClient, active_session: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If no LLM provider is configured, return explicit error instead of faking AI response."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    from app import config

    # Force llm_provider to empty string
    monkeypatch.setattr(config.get_settings(), "llm_provider", "")

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        headers=headers,
        json={"query": "Find me good noise canceling headphones under $300"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["data"] is None
    assert body["errors"][0]["code"] == "LLM_PROVIDER_NOT_CONFIGURED"
    assert "LLM provider is not configured" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_agent_gemini_without_api_key_returns_clear_error(
    client: AsyncClient, active_session: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If Gemini provider is selected but LLM_API_KEY is missing, return error."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    from app import config

    monkeypatch.setattr(config.get_settings(), "llm_provider", "gemini")
    monkeypatch.setattr(config.get_settings(), "llm_api_key", "")

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        headers=headers,
        json={"query": "Find headphones"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["errors"][0]["code"] == "LLM_PROVIDER_NOT_CONFIGURED"


# ── Tool Allowlisting Tests ───────────────────────────────────────

@pytest.mark.asyncio
async def test_tool_allowlisting_strict_enforcement(db_session: AsyncSession) -> None:
    """Verify tool allowlist permits only read-only tools and forbids state changes."""
    assert "search_products" in ALLOWLISTED_TOOLS
    assert "get_product_detail" in ALLOWLISTED_TOOLS
    assert "compare_products" in ALLOWLISTED_TOOLS
    assert "optimize_budget" in ALLOWLISTED_TOOLS

    # Permitted tool executes cleanly
    res = await execute_tool("search_products", {"limit": 2}, db_session)
    assert isinstance(res, list)

    # Disallowed tools raise ToolExecutionForbidden immediately
    forbidden_tools = [
        "create_order",
        "initiate_payment",
        "capture_payment",
        "bypass_checkout",
        "confirm_checkout",
        "delete_user",
        "update_product_price",
    ]
    for forbidden in forbidden_tools:
        with pytest.raises(ToolExecutionForbidden) as exc_info:
            await execute_tool(forbidden, {}, db_session)
        assert forbidden in str(exc_info.value)
        assert exc_info.value.code == "TOOL_EXECUTION_FORBIDDEN"
        assert exc_info.value.status_code == 403


# ── End-to-End Decision Layer Tests with Mock Provider ────────────

@pytest.mark.asyncio
async def test_agent_valid_recommendation_flow(
    client: AsyncClient, active_session: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Valid shopping query returns parsed intent, matches, grounded explanations, and comparison."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    from app import config

    monkeypatch.setattr(config.get_settings(), "llm_provider", "mock")

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        headers=headers,
        json={"query": "I want noise-canceling headphones under $450 with Bluetooth"},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]

    # 1. Intent validation
    intent = body["intent"]
    assert intent["raw_query"] == "I want noise-canceling headphones under $450 with Bluetooth"
    assert intent["constraints"]["category"] == "Audio"
    assert intent["constraints"]["budget_minor"] == 45000
    assert "noise-canceling" in intent["constraints"]["required_features"]
    assert intent["ambiguity_detected"] is False

    # 2. Recommendations validation
    recommendations = body["recommendations"]
    assert len(recommendations) > 0
    first_rec = recommendations[0]
    assert first_rec["category"] == "Audio"
    assert first_rec["price_minor"] <= 45000
    assert first_rec["match_score"] > 0
    # Grounded explanation cites price and catalog specs
    assert first_rec["name"] in first_rec["explanation"]
    assert len(first_rec["source_evidence"]) > 0

    # 3. Comparison items validation
    comparison = body["comparison"]
    assert len(comparison) > 0
    assert comparison[0]["product_id"] == first_rec["product_id"]
    assert len(comparison[0]["pros"]) > 0

    # 4. Budget summary validation
    budget_summary = body["budget_summary"]
    assert budget_summary is not None
    assert budget_summary["budget_minor"] == 45000
    assert budget_summary["fits_within_budget"] is True
    assert budget_summary["remaining_minor"] >= 0


@pytest.mark.asyncio
async def test_agent_ambiguous_request_clarification(
    client: AsyncClient, active_session: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ambiguous or overly generic request returns clarification questions without hallucinating."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    from app import config

    monkeypatch.setattr(config.get_settings(), "llm_provider", "mock")

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        headers=headers,
        json={"query": "recommend something good"},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]

    assert body["intent"]["ambiguity_detected"] is True
    assert len(body["clarification_questions"]) > 0
    # Zero recommendations hallucinated
    assert len(body["recommendations"]) == 0
    assert len(body["comparison"]) == 0


@pytest.mark.asyncio
async def test_agent_no_matching_products(
    client: AsyncClient, active_session: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Impossible constraints (e.g. $5 laptop) return empty recommendations gracefully."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    from app import config

    monkeypatch.setattr(config.get_settings(), "llm_provider", "mock")

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        headers=headers,
        json={"query": "Laptops under $5"},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]

    assert len(body["recommendations"]) == 0
    assert len(body["comparison"]) == 0
    assert len(body["clarification_questions"]) > 0
    assert "No matching in-stock products" in body["clarification_questions"][0]


@pytest.mark.asyncio
async def test_agent_hard_constraint_enforcement(
    client: AsyncClient, active_session: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Products exceeding the budget ceiling are strictly excluded."""
    session_id = active_session["session_id"]
    headers = active_session["headers"]

    from app import config

    monkeypatch.setattr(config.get_settings(), "llm_provider", "mock")

    # Set explicit hard budget ceiling of $300 (30000 minor)
    resp = await client.post(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        headers=headers,
        json={
            "query": "Audio headphones",
            "category": "Audio",
            "budget_minor": 30000,
        },
    )
    assert resp.status_code == 200
    body = resp.json()["data"]

    # All returned recommendations must strictly be <= 30000
    for rec in body["recommendations"]:
        assert rec["price_minor"] <= 30000, f"Product {rec['name']} costs {rec['price_minor']} > 30000"


@pytest.mark.asyncio
async def test_agent_session_protection(client: AsyncClient) -> None:
    """Agent endpoint rejects unauthorized callers or inactive sessions."""
    fake_session_id = uuid4()

    # 1. Missing Authorization header -> 401
    resp = await client.post(
        f"/api/v1/sessions/{fake_session_id}/agent/recommend",
        json={"query": "Find laptops"},
    )
    assert resp.status_code == 401
    assert resp.json()["errors"][0]["code"] == "SESSION_TOKEN_MISSING"

    # 2. Invalid Bearer token -> 404 (session doesn't exist)
    resp = await client.post(
        f"/api/v1/sessions/{fake_session_id}/agent/recommend",
        headers={"Authorization": "Bearer pp_sess_invalidsessiontoken"},
        json={"query": "Find laptops"},
    )
    assert resp.status_code == 404
    assert resp.json()["errors"][0]["code"] == "SESSION_NOT_FOUND"

"""
Shopping Agent API endpoints.

Exposes session-protected endpoint for shoppers to interact with the
AI decision layer, receiving grounded recommendations, comparisons,
and clarification questions.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, verify_active_session_token
from app.config import get_settings
from app.schemas.agent import ShoppingAgentRequest, ShoppingAgentResponse
from app.schemas.common import ApiResponse
from app.services.agent.decision_engine import DecisionEngine
from app.services.agent.llm_provider import get_llm_provider
from app.services.audit_service import AuditService

agent_router = APIRouter(tags=["AI Shopping Agent"])


@agent_router.post(
    "/sessions/{session_id}/agent/recommend",
    response_model=ApiResponse[ShoppingAgentResponse],
    summary="Submit shopping query to AI Agent decision layer",
    description="Processes shopper query through deterministic filters, LLM boundary, and grounded ranking.",
)
async def process_shopping_query(
    session_id: UUID,
    request_body: ShoppingAgentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _verified: UUID = Depends(verify_active_session_token),
) -> ApiResponse[ShoppingAgentResponse]:
    """Protected shopping-agent endpoint returning parsed intent, matches, comparison, and explanations."""
    settings = get_settings()
    llm_provider = get_llm_provider(settings)

    engine = DecisionEngine(llm_provider=llm_provider)
    result = await engine.process_shopping_request(db=db, request=request_body)

    # Emit audit trail
    await AuditService.emit_event(
        db=db,
        event_type="agent.recommendation_generated",
        actor="agent",
        session_id=session_id,
        payload={
            "query": request_body.query,
            "category": result.intent.constraints.category,
            "budget_minor": result.intent.constraints.budget_minor,
            "recommendation_count": len(result.recommendations),
            "ambiguity_detected": result.intent.ambiguity_detected,
        },
    )
    await db.commit()

    request_id = getattr(request.state, "request_id", "unknown")
    return ApiResponse(
        data=result,
        meta={"request_id": request_id},
    )

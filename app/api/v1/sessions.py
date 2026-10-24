"""
Shopping session API endpoints (v1).

- POST /api/v1/sessions: Create anonymous session, returns single-issue access token.
- GET /api/v1/sessions/{session_id}: View session status (requires Bearer token).
- PATCH /api/v1/sessions/{session_id}: Update session metadata (requires Bearer token).
- POST /api/v1/sessions/{session_id}/end: Complete/abandon session (requires Bearer token).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import verify_session_token
from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.session import SessionCreate, SessionCreateResponse, SessionOut, SessionUpdate
from app.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _build_meta(request: Request) -> dict:
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.post(
    "",
    response_model=ApiResponse[SessionCreateResponse],
    summary="Create shopping session",
    description="Creates a new anonymous shopping session and returns the access token. Token is returned ONLY once.",
)
async def create_session(
    request: Request,
    body: SessionCreate | None = None,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SessionCreateResponse]:
    metadata_json = body.metadata_json if body else None
    session, access_token = await SessionService.create_session(db, metadata_json=metadata_json)

    data = SessionCreateResponse(
        session_id=session.id,
        access_token=access_token,
        status=session.status,
        created_at=session.created_at,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.get(
    "/{session_id}",
    response_model=ApiResponse[SessionOut],
    summary="Get session details",
    description="Retrieve session metadata and status. Requires Bearer token.",
)
async def get_session(
    request: Request,
    session_id: UUID = Depends(verify_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SessionOut]:
    session = await SessionService.get_session(db, session_id)
    data = SessionOut(
        session_id=session.id,
        status=session.status,
        metadata_json=session.metadata_json,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.patch(
    "/{session_id}",
    response_model=ApiResponse[SessionOut],
    summary="Update session metadata",
    description="Update metadata (e.g. shopper budget, intent). Requires Bearer token.",
)
async def update_session(
    request: Request,
    body: SessionUpdate,
    session_id: UUID = Depends(verify_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SessionOut]:
    session = await SessionService.update_session(db, session_id, body.metadata_json)
    data = SessionOut(
        session_id=session.id,
        status=session.status,
        metadata_json=session.metadata_json,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
    return ApiResponse(data=data, meta=_build_meta(request))


@router.post(
    "/{session_id}/end",
    response_model=ApiResponse[SessionOut],
    summary="End shopping session",
    description="Mark session as completed or abandoned. Requires Bearer token.",
)
async def end_session(
    request: Request,
    session_id: UUID = Depends(verify_session_token),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SessionOut]:
    session = await SessionService.end_session(db, session_id, status="completed")
    data = SessionOut(
        session_id=session.id,
        status=session.status,
        metadata_json=session.metadata_json,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
    return ApiResponse(data=data, meta=_build_meta(request))

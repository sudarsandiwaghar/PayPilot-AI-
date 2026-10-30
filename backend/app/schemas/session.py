"""
Pydantic schemas for Shopping Sessions.

The plaintext `access_token` is returned ONCE on creation and never exposed
in subsequent GET or list endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SessionCreate(BaseModel):
    """Optional initial metadata for session creation."""

    metadata_json: dict[str, Any] | None = Field(
        default=None,
        description="Session-level metadata (budget, intent, shopper preferences)",
    )


class SessionCreateResponse(BaseModel):
    """Returned ONLY upon session creation — includes the single-issue bearer token."""

    session_id: UUID
    access_token: str = Field(
        description="Single-issue bearer token. Store in sessionStorage and use as Authorization: Bearer <token>."
    )
    status: str
    created_at: datetime


class SessionOut(BaseModel):
    """Public session view — notice access_token is NEVER included."""

    model_config = ConfigDict(from_attributes=True)

    session_id: UUID
    status: str
    metadata_json: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class SessionUpdate(BaseModel):
    """Update metadata for an existing session."""

    metadata_json: dict[str, Any] = Field(
        description="Updated metadata attributes for this session"
    )

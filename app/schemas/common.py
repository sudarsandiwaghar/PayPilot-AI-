"""
Common schemas shared across API domains.

Includes pagination, error envelopes, and money representation.
All monetary fields use ``_minor`` suffix (currency-agnostic).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


# ── Pagination ───────────────────────────────────────────────────

class PaginationParams(BaseModel):
    """Query parameters for paginated list endpoints."""

    page: int = Field(default=1, ge=1, description="Page number (1-indexed).")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page.")


class PaginatedResponse(BaseModel, Generic[T]):
    """Wrapper for paginated list responses."""

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── Money ────────────────────────────────────────────────────────

class MoneyOut(BaseModel):
    """Currency-agnostic money representation in minor units."""

    amount_minor: int = Field(description="Amount in smallest currency unit (e.g., cents for USD).")
    currency: str = Field(
        min_length=3, max_length=3, description="ISO 4217 currency code."
    )


# ── Error Envelope ───────────────────────────────────────────────

class ErrorDetail(BaseModel):
    """A single error entry in the response envelope."""

    code: str = Field(description="Machine-readable error code, e.g. PRODUCT_NOT_FOUND.")
    message: str = Field(description="Human-readable error message.")
    field: str | None = Field(default=None, description="Field that caused the error, if applicable.")


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    data: None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    errors: list[ErrorDetail]


# ── Success Envelope ─────────────────────────────────────────────

class ApiResponse(BaseModel, Generic[T]):
    """Standard success response envelope."""

    data: T
    meta: dict[str, Any] = Field(default_factory=dict)
    errors: list[ErrorDetail] = Field(default_factory=list)


# ── Health ───────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Liveness check response."""

    status: str = "ok"
    version: str
    timestamp: datetime


class ReadinessCheck(BaseModel):
    """Status of a single dependency."""

    name: str
    status: str  # "ok" or "unavailable"
    latency_ms: float | None = None
    error: str | None = None


class ReadinessResponse(BaseModel):
    """Readiness check response with per-dependency status."""

    status: str  # "ready" or "degraded"
    checks: list[ReadinessCheck]
    timestamp: datetime

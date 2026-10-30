"""
Pydantic schemas for Products and Product Sources.

All monetary amounts use `_minor` suffix (currency-agnostic).
Provenance fields (`is_demo_data`, `verified_at`) are exposed transparently.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProductSourceOut(BaseModel):
    """External source evidence backing a product claim."""

    model_config = ConfigDict(from_attributes=True)

    source_type: str
    source_name: str
    source_url: str | None = None
    price_minor: int | None = None
    currency: str | None = None
    is_demo_data: bool
    verified_at: datetime | None = None


class ProductListItem(BaseModel):
    """Summary representation for catalog browsing and search."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sku: str
    name: str
    category: str
    brand: str | None = None
    price_minor: int
    currency: str
    stock_qty: int
    image_url: str | None = None
    rating: float | None = None
    is_active: bool
    is_demo_data: bool


class ProductDetail(ProductListItem):
    """Full product detail including source evidence and specs."""

    description: str | None = None
    metadata_json: dict | None = None
    sources: list[ProductSourceOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProductFilterParams(BaseModel):
    """Query parameters for browsing and searching products."""

    q: str | None = Field(default=None, description="Full-text search query across name and description")
    category: str | None = Field(default=None, description="Filter by exact category name")
    brand: str | None = Field(default=None, description="Filter by brand name")
    min_price_minor: int | None = Field(default=None, ge=0, description="Minimum price in minor units")
    max_price_minor: int | None = Field(default=None, ge=0, description="Maximum price in minor units")
    min_rating: float | None = Field(default=None, ge=0.0, le=5.0, description="Minimum rating 0.0-5.0")
    in_stock_only: bool = Field(default=False, description="Filter only products with stock_qty > 0")
    sort_by: str = Field(
        default="rating",
        pattern=r"^(price_asc|price_desc|rating|name)$",
        description="Sort ordering",
    )
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

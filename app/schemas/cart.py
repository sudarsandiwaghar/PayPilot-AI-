"""
Pydantic schemas for Carts and Cart Items.

All monetary amounts use minor units (`_minor`).
The `version` field is incremented with every mutation to guarantee preview validity.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CartItemCreate(BaseModel):
    """Payload to add an item to the cart."""

    product_id: UUID
    quantity: int = Field(default=1, ge=1, le=99, description="Quantity to add (1-99)")


class CartItemUpdate(BaseModel):
    """Payload to update an item quantity."""

    quantity: int = Field(ge=1, le=99, description="New quantity (1-99)")


class CartItemOut(BaseModel):
    """Line item in a shopping cart."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    product_name: str
    quantity: int
    unit_price_minor: int
    currency: str
    line_total_minor: int


class CartOut(BaseModel):
    """Full shopping cart view with item summary and version tag."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    version: int
    items: list[CartItemOut]
    subtotal_minor: int
    currency: str
    item_count: int

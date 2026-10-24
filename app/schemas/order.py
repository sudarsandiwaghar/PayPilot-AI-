"""
Pydantic schemas for Checkout and Orders.

All monetary amounts use minor units (`_minor`).
Preview tokens bind cart state and prices for tamper-proof confirmation.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CheckoutLineItem(BaseModel):
    """Line item in a checkout preview."""

    product_id: UUID
    product_name: str
    quantity: int
    unit_price_minor: int
    currency: str
    line_total_minor: int


class PriceChangeWarning(BaseModel):
    """Notice that a product's price changed since it was added to the cart."""

    product_id: UUID
    product_name: str
    old_price_minor: int
    new_price_minor: int


class StockWarning(BaseModel):
    """Notice that available stock is limited."""

    product_id: UUID
    product_name: str
    requested_qty: int
    available_qty: int


class CheckoutPreview(BaseModel):
    """Result of POST /checkout/preview with bound preview token."""

    order_summary: list[CheckoutLineItem]
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    currency: str
    price_changes: list[PriceChangeWarning]
    stock_warnings: list[StockWarning]
    preview_token: str
    expires_at: datetime
    cart_version: int


class CheckoutConfirmRequest(BaseModel):
    """Request payload to confirm checkout and create order."""

    preview_token: str = Field(description="HMAC preview token returned by POST /checkout/preview")


class OrderItemOut(BaseModel):
    """Item within an Order response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    product_name: str
    quantity: int
    unit_price_minor: int
    currency: str
    line_total_minor: int


class PaymentAttemptSummary(BaseModel):
    """Summary of a payment attempt linked to an order."""

    model_config = ConfigDict(from_attributes=True)

    attempt_id: UUID
    attempt_number: int
    status: str
    created_at: datetime
    is_demo: bool = True
    demo_notice: str | None = "Demo payment — no real payment processed"


class OrderOut(BaseModel):
    """Full view of an Order."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_number: str
    status: str
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    currency: str
    confirmed_by_shopper: bool
    stock_reserved_until: datetime | None
    items: list[OrderItemOut]
    payment_attempts: list[PaymentAttemptSummary] = Field(default_factory=list)
    created_at: datetime
    is_demo_payment: bool = True
    demo_notice: str | None = "Demo payment — no real payment processed"

"""
Custom exception hierarchy and error codes.

All domain exceptions inherit from ``PayPilotError``. The global exception
handler in ``app.main`` catches these and returns a consistent JSON envelope
with the appropriate HTTP status code.
"""

from __future__ import annotations


class PayPilotError(Exception):
    """Base exception for all PayPilot domain errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        field: str | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.field = field
        super().__init__(message)


# ── 401 / 403 — Authentication & Authorization ──────────────────

class SessionTokenMissing(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="SESSION_TOKEN_MISSING",
            message="Authorization header with a valid Bearer token is required.",
            status_code=401,
        )


class SessionTokenInvalid(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="SESSION_TOKEN_INVALID",
            message="The provided session token is invalid or does not match this session.",
            status_code=403,
        )


class SessionInactive(PayPilotError):
    def __init__(self, status: str = "completed") -> None:
        super().__init__(
            code="SESSION_INACTIVE",
            message=f"Shopping session is not active (status: '{status}'). Operations are rejected.",
            status_code=403,
        )


class OrderNotConfirmed(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="ORDER_NOT_CONFIRMED",
            message="The order has not been confirmed by the shopper.",
            status_code=403,
        )


# ── 404 — Not Found ─────────────────────────────────────────────

class ProductNotFound(PayPilotError):
    def __init__(self, product_id: str) -> None:
        super().__init__(
            code="PRODUCT_NOT_FOUND",
            message=f"Product '{product_id}' not found.",
            status_code=404,
        )


class SessionNotFound(PayPilotError):
    def __init__(self, session_id: str) -> None:
        super().__init__(
            code="SESSION_NOT_FOUND",
            message=f"Shopping session '{session_id}' not found.",
            status_code=404,
        )


class OrderNotFound(PayPilotError):
    def __init__(self, order_id: str) -> None:
        super().__init__(
            code="ORDER_NOT_FOUND",
            message=f"Order '{order_id}' not found.",
            status_code=404,
        )


class CartItemNotFound(PayPilotError):
    def __init__(self, item_id: str) -> None:
        super().__init__(
            code="CART_ITEM_NOT_FOUND",
            message=f"Cart item '{item_id}' not found.",
            status_code=404,
        )


class PaymentAttemptNotFound(PayPilotError):
    def __init__(self, attempt_id: str) -> None:
        super().__init__(
            code="PAYMENT_ATTEMPT_NOT_FOUND",
            message=f"Payment attempt '{attempt_id}' not found.",
            status_code=404,
        )


# ── 409 — Conflict ──────────────────────────────────────────────

class InsufficientStock(PayPilotError):
    def __init__(self, product_id: str, available: int, requested: int) -> None:
        super().__init__(
            code="INSUFFICIENT_STOCK",
            message=(
                f"Product '{product_id}' has {available} units available "
                f"but {requested} were requested."
            ),
            status_code=409,
        )


class PriceChanged(PayPilotError):
    def __init__(self, product_id: str) -> None:
        super().__init__(
            code="PRICE_CHANGED",
            message=(
                f"Price for product '{product_id}' has changed since the preview. "
                "Please request a fresh checkout preview."
            ),
            status_code=409,
        )


class CartModified(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="CART_MODIFIED",
            message="The cart was modified after the preview was generated. Please request a fresh preview.",
            status_code=409,
        )


class ActivePaymentExists(PayPilotError):
    def __init__(self, order_id: str) -> None:
        super().__init__(
            code="ACTIVE_PAYMENT_EXISTS",
            message=f"Order '{order_id}' already has an active (non-terminal) payment attempt.",
            status_code=409,
        )


# ── 410 — Gone ───────────────────────────────────────────────────

class PreviewExpired(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="PREVIEW_EXPIRED",
            message="The checkout preview token has expired. Please request a fresh preview.",
            status_code=410,
        )


class StockReservationExpired(PayPilotError):
    def __init__(self, order_id: str) -> None:
        super().__init__(
            code="STOCK_RESERVATION_EXPIRED",
            message=f"Stock reservation for order '{order_id}' has expired.",
            status_code=410,
        )


# ── 422 — Validation ────────────────────────────────────────────

class CartEmpty(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="CART_EMPTY",
            message="Cannot checkout with an empty cart.",
            status_code=422,
        )


class PreviewInvalid(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="PREVIEW_INVALID",
            message="The preview token signature is invalid or malformed.",
            status_code=400,
        )


class IdempotencyKeyReused(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="IDEMPOTENCY_KEY_REUSED",
            message="This idempotency key was already used for a terminal payment attempt. Use a new key.",
            status_code=422,
        )


# ── 502 — Upstream Errors ───────────────────────────────────────

class PaymentCaptureFailed(PayPilotError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="PAYMENT_CAPTURE_FAILED",
            message=f"PayPal capture failed: {reason}",
            status_code=502,
        )


class PayPalWebhookInvalid(PayPilotError):
    def __init__(self, message: str = "PayPal webhook signature verification failed.") -> None:
        super().__init__(
            code="PAYPAL_WEBHOOK_INVALID",
            message=message,
            status_code=400,
        )


class PayPalWebhookNotConfigured(PayPilotError):
    def __init__(self) -> None:
        super().__init__(
            code="PAYPAL_WEBHOOK_NOT_CONFIGURED",
            message="PayPal webhook verification is not configured on this server.",
            status_code=400,
        )


# ── AI Shopping Agent Errors ─────────────────────────────────────

class LLMProviderNotConfigured(PayPilotError):
    def __init__(
        self,
        message: str = "LLM provider is not configured. Configure LLM_PROVIDER and credentials in environment variables.",
    ) -> None:
        super().__init__(
            code="LLM_PROVIDER_NOT_CONFIGURED",
            message=message,
            status_code=400,
        )


class ToolExecutionForbidden(PayPilotError):
    def __init__(self, tool_name: str) -> None:
        super().__init__(
            code="TOOL_EXECUTION_FORBIDDEN",
            message=f"Tool '{tool_name}' is not authorized. The shopping agent only has access to allowlisted read-only tools.",
            status_code=403,
        )

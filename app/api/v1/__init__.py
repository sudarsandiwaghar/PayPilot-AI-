"""API v1 package — versioned route aggregator."""

from fastapi import APIRouter

from app.api.v1.agent import agent_router
from app.api.v1.carts import router as carts_router
from app.api.v1.checkout import router as checkout_router
from app.api.v1.health import router as health_router
from app.api.v1.orders import router as orders_router
from app.api.v1.payments import router as payments_router
from app.api.v1.products import router as products_router
from app.api.v1.sessions import router as sessions_router

v1_router = APIRouter(prefix="/api/v1")

# Health endpoints (no auth)
v1_router.include_router(health_router, tags=["Health"])

# Products endpoints (public)
v1_router.include_router(products_router)

# Sessions, Carts, and Shopping Agent endpoints
v1_router.include_router(sessions_router)
v1_router.include_router(carts_router)
v1_router.include_router(agent_router)

# Checkout and Orders endpoints
v1_router.include_router(checkout_router)
v1_router.include_router(orders_router)

# Payments endpoints
v1_router.include_router(payments_router)

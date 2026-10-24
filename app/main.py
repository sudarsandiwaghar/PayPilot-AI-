"""
FastAPI application factory.

Creates the app with:
- Lifespan handler for startup/shutdown (DB engine disposal).
- CORS middleware.
- Request-ID middleware (X-Request-ID header).
- Global exception handler for PayPilotError hierarchy.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import v1_router
from app.config import get_settings
from app.database import async_session_factory, engine
from app.services.stock_service import StockService
from app.utils.exceptions import PayPilotError
from app.utils.logging import setup_logging


async def _stock_sweep_worker(interval_seconds: int) -> None:
    """Periodic background worker running stock sweep at configured interval.

    Performs an immediate sweep on startup/wake-up to reclaim any holds that expired
    while the backend container was stopped or sleeping, then repeats periodically.
    """
    logger = logging.getLogger("paypilot.stock_sweep")

    # Immediate sweep on startup/wake-up
    try:
        async with async_session_factory() as session:
            count = await StockService.sweep_expired_reservations(session)
            if count > 0:
                logger.info("Startup stock sweep released %d expired reservations.", count)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.exception("Startup stock sweep encountered an error: %s; periodic sweep loop will continue.", e)

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            async with async_session_factory() as session:
                count = await StockService.sweep_expired_reservations(session)
                if count > 0:
                    logger.info("Automatic stock sweep released %d expired reservations.", count)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("Error in background stock sweep worker: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: setup logging, launch automatic stock sweep, dispose engine."""
    setup_logging()
    settings = get_settings()

    sweep_task = None
    if settings.stock_sweep_enabled:
        sweep_task = asyncio.create_task(
            _stock_sweep_worker(settings.stock_sweep_interval_seconds)
        )

    try:
        yield
    finally:
        if sweep_task:
            sweep_task.cancel()
            with suppress(asyncio.CancelledError):
                await sweep_task
        await engine.dispose()


def create_app() -> FastAPI:
    """Build and return the configured FastAPI application."""
    settings = get_settings()

    if settings.app_env == "production":
        insecure_defaults = {
            "change-me-in-production",
            "change-me",
            "default",
            "secret",
        }
        key = (settings.app_secret_key or "").strip()
        if not key or key in insecure_defaults or "change-me" in key.lower():
            raise RuntimeError(
                "Production startup rejected: APP_SECRET_KEY is unset or using a development default."
            )
        if settings.paypal_mode in ("mock", "demo"):
            raise RuntimeError(
                "Production startup rejected: PAYPAL_MODE cannot be 'mock' or 'demo' in production."
            )

    app = FastAPI(
        title="PayPilot AI",
        description="AI-powered shopping assistant — backend API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
        debug=settings.app_debug,
    )

    # ── CORS ─────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # ── Request-ID Middleware ────────────────────────────────
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    # ── Global Exception Handlers ────────────────────────────
    @app.exception_handler(PayPilotError)
    async def paypilot_error_handler(request: Request, exc: PayPilotError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "data": None,
                "meta": {
                    "request_id": request_id,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
                "errors": [
                    {
                        "code": exc.code,
                        "message": exc.message,
                        "field": exc.field,
                    }
                ],
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        errors = []
        for err in exc.errors():
            loc = err.get("loc", ())
            field_parts = [str(part) for part in loc if part not in ("body",)]
            field_name = ".".join(field_parts) if field_parts else None
            errors.append(
                {
                    "code": "VALIDATION_ERROR",
                    "message": err.get("msg", "Invalid request parameter."),
                    "field": field_name,
                }
            )
        return JSONResponse(
            status_code=422,
            content={
                "data": None,
                "meta": {
                    "request_id": request_id,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
                "errors": errors,
            },
        )

    # ── Routes ───────────────────────────────────────────────
    app.include_router(v1_router)

    return app


# Module-level app instance for uvicorn
app = create_app()

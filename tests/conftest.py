"""
Test configuration and shared fixtures.

Provides an async test client backed by a real PostgreSQL database
(test instance via Docker) for integration tests with full dialect parity.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.seed.catalog import seed_catalog

# Use a separate test database
_settings = get_settings()
_test_db_url = _settings.test_database_url or _settings.database_url.replace("/paypilot_dev", "/paypilot_test")

_test_engine = create_async_engine(_test_db_url, echo=False, poolclass=NullPool)
_test_session_factory = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables and seed the demo catalog before test session, drop them after."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with _test_session_factory() as session:
        await seed_catalog(session)

    yield

    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_db_per_test():
    """Clean dynamic tables and replenish product stock between tests."""
    yield
    async with _test_session_factory() as s:
        await s.execute(
            text(
                "TRUNCATE TABLE payment_attempts, stock_reservations, order_items, "
                "orders, cart_items, carts, audit_events, shopping_sessions CASCADE;"
            )
        )
        await s.execute(text("UPDATE products SET stock_qty = 50 WHERE stock_qty < 50;"))
        await s.commit()


@pytest.fixture
def session_factory():
    """Provide the async session factory connected to the test database."""
    return _test_session_factory


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional test DB session that rolls back after each test."""
    async with _test_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client with the test DB session injected."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def active_session(client: AsyncClient) -> dict:
    """Create a fresh shopping session with bearer auth headers."""
    resp = await client.post("/api/v1/sessions")
    data = resp.json()["data"]
    return {
        "session_id": data["session_id"],
        "token": data["access_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest_asyncio.fixture
async def sample_product(client: AsyncClient) -> dict:
    """Fetch the first active demo product."""
    resp = await client.get("/api/v1/products?page_size=1")
    return resp.json()["data"]["items"][0]

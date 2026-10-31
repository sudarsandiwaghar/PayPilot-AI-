"""
Tests for application configuration validators, aliases, and normalization.

Validates that:
- Render's PORT environment variable maps to app_port
- Neon-style database URLs (postgres://, postgresql://, sslmode=...) normalize to postgresql+asyncpg:// with ssl=...
- CORS origins parse correctly from JSON arrays, comma-delimited strings, and single origins
- Staging and mock payment lifecycle settings validate properly
"""

from app.config import Settings


def test_port_alias_validation():
    """Verify PORT environment alias properly maps to app_port (used by Render)."""
    s = Settings(port=10000, _env_file=None)
    assert s.app_port == 10000

    s2 = Settings(app_port=9000, _env_file=None)
    assert s2.app_port == 9000


def test_database_url_normalization_synthetic_urls():
    """Verify fake/synthetic Neon database URLs are normalized for asyncpg without connecting."""
    # Synthetic postgres:// with sslmode=require
    raw = "postgres://fakeuser:fakepass@ep-fake-1234.us-east-2.neon.tech/neondb?sslmode=require"
    s = Settings(database_url=raw, _env_file=None)
    assert s.database_url == "postgresql+asyncpg://fakeuser:fakepass@ep-fake-1234.us-east-2.neon.tech/neondb?ssl=require"

    # Synthetic postgresql:// without asyncpg
    raw2 = "postgresql://fakeuser:fakepass@localhost:5432/testdb"
    s2 = Settings(database_url=raw2, _env_file=None)
    assert s2.database_url == "postgresql+asyncpg://fakeuser:fakepass@localhost:5432/testdb"

    # Already valid asyncpg URL
    raw3 = "postgresql+asyncpg://user:pass@host/db?ssl=require"
    s3 = Settings(database_url=raw3, _env_file=None)
    assert s3.database_url == raw3

    # Raw Neon copy snippet with -pooler and channel_binding
    raw4 = "postgresql://user:pass@ep-fake-1234-pooler.us-east-2.neon.tech/neondb?sslmode=require&channel_binding=require"
    s4 = Settings(database_url=raw4, _env_file=None)
    assert s4.database_url == "postgresql+asyncpg://user:pass@ep-fake-1234.us-east-2.neon.tech/neondb?ssl=require"


def test_cors_origins_parsing():
    """Verify CORS origins parse from various input formats."""
    # JSON list string (Render environment format)
    s1 = Settings(cors_origins='["https://paypilot-frontend.onrender.com"]', _env_file=None)
    assert s1.cors_origins == ["https://paypilot-frontend.onrender.com"]

    # Comma-separated string
    s2 = Settings(cors_origins="https://app1.example.com, https://app2.example.com", _env_file=None)
    assert s2.cors_origins == ["https://app1.example.com", "https://app2.example.com"]

    # Single string
    s3 = Settings(cors_origins="https://paypilot.example.com", _env_file=None)
    assert s3.cors_origins == ["https://paypilot.example.com"]

    # Direct list
    s4 = Settings(cors_origins=["https://direct.example.com"], _env_file=None)
    assert s4.cors_origins == ["https://direct.example.com"]


def test_stock_sweep_staging_configuration():
    """Verify stock sweep settings accept relaxed interval for Neon scale-to-zero safety."""
    s = Settings(stock_sweep_enabled=True, stock_sweep_interval_seconds=600, _env_file=None)
    assert s.stock_sweep_enabled is True
    assert s.stock_sweep_interval_seconds == 600

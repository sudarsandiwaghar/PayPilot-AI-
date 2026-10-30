"""
Application configuration loaded from environment variables.

All settings are validated at startup via Pydantic BaseSettings.
The .env file is loaded automatically in development.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Self

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration — single source of truth for all env vars."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────
    app_env: str = Field(default="development", pattern=r"^(development|staging|production)$")
    app_host: str = "0.0.0.0"
    app_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("app_port", "port"),
        description="Application HTTP port.",
    )
    app_debug: bool = True
    app_log_level: str = "DEBUG"
    app_secret_key: str = Field(
        default="change-me-in-production",
        min_length=16,
        description="Secret key for HMAC preview tokens. Must be ≥16 chars.",
    )

    # ── Currency ─────────────────────────────────────────────────
    default_currency: str = Field(
        default="USD",
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code. All seeded products use this.",
    )

    # ── Stock ────────────────────────────────────────────────────
    stock_reservation_ttl_minutes: int = Field(
        default=15,
        ge=1,
        le=1440,
        description="Minutes to hold reserved stock before auto-release.",
    )
    stock_sweep_enabled: bool = Field(
        default=True,
        description="Enable automatic background stock sweep during app lifecycle.",
    )
    stock_sweep_interval_seconds: int = Field(
        default=60,
        ge=5,
        le=3600,
        description="Interval in seconds between automatic background stock sweeps.",
    )

    # ── Checkout ─────────────────────────────────────────────────
    preview_token_ttl_minutes: int = Field(
        default=10,
        ge=1,
        le=60,
        description="Minutes before a checkout preview token expires.",
    )

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://paypilot:paypilot@localhost:5432/paypilot_dev"
    test_database_url: str = ""
    database_echo: bool = False

    # ── PayPal ───────────────────────────────────────────────────
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_mode: str = Field(default="mock", pattern=r"^(mock|demo|sandbox|live)$")
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_webhook_id: str = ""

    # ── LLM / AI Shopping Agent ───────────────────────────────────
    llm_provider: str = Field(
        default="mock",
        description="LLM provider name: 'gemini', 'mock'. Defaults to 'mock' for safe no-cost offline operation.",
    )
    llm_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("llm_api_key", "gemini_api_key"),
        description="API key for configured LLM provider. Must never be logged or exposed.",
    )
    llm_model: str = Field(
        default="gemini-3.5-flash",
        validation_alias=AliasChoices("llm_model", "gemini_model"),
        description="Model name to invoke for shopping agent tasks.",
    )
    llm_base_url: str = Field(
        default="",
        description="Optional custom API endpoint URL for LLM provider.",
    )

    @field_validator("database_url", "test_database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """Normalize database connection URLs for asyncpg/Neon compatibility.

        - Converts 'postgres://' or 'postgresql://' to 'postgresql+asyncpg://'
        - Converts '?sslmode=require' to '?ssl=require' (asyncpg expects 'ssl', not 'sslmode')
        """
        if not isinstance(v, str):
            return v
        url = v.strip()
        if not url:
            return url
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]

        if "sslmode=" in url:
            url = url.replace("sslmode=require", "ssl=require")
            url = url.replace("sslmode=verify-full", "ssl=verify-full")
            url = url.replace("sslmode=verify-ca", "ssl=verify-ca")
            url = url.replace("sslmode=prefer", "ssl=prefer")
        return url

    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Accept JSON string, comma-separated string, or list."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def default_llm_provider(self) -> Self:
        """Default provider to gemini if llm_api_key/gemini_api_key is set but provider is empty."""
        if not self.llm_provider and self.llm_api_key:
            self.llm_provider = "gemini"
        return self

    @model_validator(mode="after")
    def validate_production_secret_key(self) -> Self:
        """Reject production configuration if APP_SECRET_KEY is unset or uses development default."""
        if self.app_env == "production":
            insecure_defaults = {
                "change-me-in-production",
                "change-me",
                "default",
                "secret",
            }
            key = (self.app_secret_key or "").strip()
            if not key or key in insecure_defaults or "change-me" in key.lower():
                raise ValueError(
                    "In production (APP_ENV=production), APP_SECRET_KEY must be set "
                    "to a secure, unique secret key and cannot use the development default."
                )
        return self

    @model_validator(mode="after")
    def validate_production_paypal_mode(self) -> Self:
        """Reject production configuration if PAYPAL_MODE is mock or demo."""
        if self.app_env == "production" and self.paypal_mode in ("mock", "demo"):
            raise ValueError(
                "In production (APP_ENV=production), PAYPAL_MODE cannot be 'mock' or 'demo'. "
                "Mock payments must never mark orders as paid in production."
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached singleton Settings instance."""
    return Settings()

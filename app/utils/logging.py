"""
Structured logging with secret-scrubbing filter.

All log output is JSON-formatted for machine parsing. The SecretFilter
redacts known sensitive patterns (PayPal secrets, access tokens, etc.)
before any log record is emitted.
"""

from __future__ import annotations

import logging
import re
import sys
from typing import Any

from app.config import get_settings

# Patterns that must NEVER appear in logs
_SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(paypal_client_secret\s*[=:]\s*)\S+", re.IGNORECASE),
    re.compile(r"(pp_sess_)\S+"),
    re.compile(r"(Bearer\s+)\S+", re.IGNORECASE),
    re.compile(r"(password\s*[=:]\s*)\S+", re.IGNORECASE),
    re.compile(r"(secret_key\s*[=:]\s*)\S+", re.IGNORECASE),
    re.compile(r"((?:llm_|gemini_)?api_key\s*[=:]\s*)\S+", re.IGNORECASE),
]

_REDACTED = "***REDACTED***"


class SecretFilter(logging.Filter):
    """Scrub sensitive values from log messages before emission."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._scrub(record.msg)
        if record.args:
            record.args = tuple(
                self._scrub(a) if isinstance(a, str) else a for a in record.args
            )
        return True

    @staticmethod
    def _scrub(text: str) -> str:
        for pattern in _SECRET_PATTERNS:
            text = pattern.sub(rf"\g<1>{_REDACTED}", text)
        return text


class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        import json
        from datetime import UTC, datetime

        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        return json.dumps(log_entry, default=str)


def setup_logging() -> None:
    """Configure root logger with JSON formatting and secret scrubbing."""
    settings = get_settings()

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.app_log_level.upper(), logging.INFO))

    # Clear existing handlers
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SecretFilter())
    root_logger.addHandler(handler)

    # Quiet down noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.database_echo else logging.WARNING
    )

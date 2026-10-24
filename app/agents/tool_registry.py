"""
Agent tool registry — allowlist of service functions callable by the AI agent.

DESIGN CONTRACT:
    The AI agent may ONLY invoke functions listed in ``ALLOWED_TOOLS``.
    Each entry maps a tool name to a reference to the service function
    and a description of what the tool does.

    The agent is permitted to:
    - Parse natural-language shopping intent into structured queries.
    - Explain recommendations and cite product source evidence.
    - Invoke allowlisted read-only tools (product search, detail, etc.).

    The agent is FORBIDDEN from:
    - Inventing product facts, prices, or source URLs.
    - Bypassing stock checks, price validation, or confirmation gates.
    - Directly calling payment or checkout services without shopper confirmation.
    - Calling any function NOT listed in ``ALLOWED_TOOLS``.

PHASE 1 STATUS:
    This file is a scaffold. The ``ALLOWED_TOOLS`` dict is empty.
    Actual tool registration will occur in Phase 2 when the agent
    integration is implemented.
"""

from __future__ import annotations

from typing import Any

# Each entry: { "tool_name": { "fn": callable, "description": str, "read_only": bool } }
# Populated in Phase 2 when service functions are registered.
ALLOWED_TOOLS: dict[str, dict[str, Any]] = {}

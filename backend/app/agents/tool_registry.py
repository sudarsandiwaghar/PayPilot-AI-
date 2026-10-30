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

from app.services.agent.tools import (
    ALLOWLISTED_TOOLS,
    compare_products,
    execute_tool,
    get_product_detail,
    optimize_budget,
    search_products,
)

# Canonical tool registry mapping allowed tool names to callable metadata.
ALLOWED_TOOLS: dict[str, dict[str, Any]] = {
    "search_products": {
        "fn": search_products,
        "description": "Search and filter catalog products read-only.",
        "read_only": True,
    },
    "get_product_detail": {
        "fn": get_product_detail,
        "description": "Get full product details and source evidence.",
        "read_only": True,
    },
    "compare_products": {
        "fn": compare_products,
        "description": "Generate side-by-side comparison for a set of products.",
        "read_only": True,
    },
    "optimize_budget": {
        "fn": optimize_budget,
        "description": "Pure deterministic knapsack budget calculation.",
        "read_only": True,
    },
}

__all__ = [
    "ALLOWED_TOOLS",
    "ALLOWLISTED_TOOLS",
    "execute_tool",
    "search_products",
    "get_product_detail",
    "compare_products",
    "optimize_budget",
]

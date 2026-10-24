"""
LLM Provider boundary for PayPilot Shopping Agent.

Provides:
- `LLMProviderProtocol`: Abstract boundary for intent extraction and explanation generation.
- `UnconfiguredLLMProvider`: Raises `LLMProviderNotConfigured` when credentials or provider is unset.
- `MockLLMProvider`: Deterministic mock provider for regression tests and offline validation.
- `GeminiLLMProvider`: Live boundary for Google Gemini models via REST API with env-configured credentials.
- `get_llm_provider`: Factory selecting provider based on application configuration.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings
from app.schemas.agent import (
    ShoppingAgentRequest,
    ShoppingConstraint,
    ShoppingIntent,
)
from app.utils.exceptions import LLMProviderNotConfigured

logger = logging.getLogger("paypilot.llm_provider")

KNOWN_CATEGORIES = ["Audio", "Laptops", "Keyboards", "Monitors", "Accessories"]

COMMON_FEATURE_KEYWORDS = [
    "noise-canceling",
    "noise canceling",
    "bluetooth",
    "wireless",
    "mechanical",
    "hot-swappable",
    "rgb",
    "oled",
    "4k",
    "usb-c",
    "lightweight",
    "battery",
    "portable",
    "gaming",
]


class LLMProviderProtocol(Protocol):
    """Protocol defining the shopping agent LLM boundary."""

    async def parse_intent(self, request: ShoppingAgentRequest) -> ShoppingIntent:
        """Parse natural language request into typed ShoppingIntent."""
        ...

    async def generate_explanation(
        self,
        product: dict[str, Any],
        intent: ShoppingIntent,
    ) -> str:
        """Generate a grounded explanation strictly citing catalog specs and source claims."""
        ...


class UnconfiguredLLMProvider:
    """Fallback provider when no LLM provider is configured in environment."""

    async def parse_intent(self, request: ShoppingAgentRequest) -> ShoppingIntent:
        raise LLMProviderNotConfigured(
            "LLM provider is not configured. Set LLM_PROVIDER and required credentials in environment variables."
        )

    async def generate_explanation(
        self,
        product: dict[str, Any],
        intent: ShoppingIntent,
    ) -> str:
        raise LLMProviderNotConfigured(
            "LLM provider is not configured. Set LLM_PROVIDER and required credentials in environment variables."
        )


class MockLLMProvider:
    """Deterministic offline provider for regression testing and validation."""

    async def parse_intent(self, request: ShoppingAgentRequest) -> ShoppingIntent:
        query = request.query.strip()
        lower_q = query.lower()

        # Ambiguity detection: query is too short or completely vague without category/specs
        is_generic = lower_q in {
            "hello",
            "help",
            "buy something",
            "recommend something",
            "shopping",
            "something good",
            "best one",
            "what should i buy",
        }
        if len(query) < 4 or is_generic:
            return ShoppingIntent(
                raw_query=query,
                intent_type="clarification_needed",
                constraints=ShoppingConstraint(
                    category=request.category,
                    budget_minor=request.budget_minor,
                    currency=request.currency,
                    required_features=request.required_features,
                    preferences=request.preferences,
                ),
                ambiguity_detected=True,
                clarification_questions=[
                    "What category of product are you looking for (e.g., Audio, Laptops, Keyboards, Monitors)?",
                    "What is your target budget for this purchase?",
                    "Are there any specific must-have features or preferred brands?",
                ],
            )

        # Detect category
        detected_category = request.category
        if not detected_category:
            for cat in KNOWN_CATEGORIES:
                if cat.lower() in lower_q:
                    detected_category = cat
                    break
            # Common synonyms
            if not detected_category:
                if any(w in lower_q for w in ["headphone", "earphone", "audio", "earbuds", "speaker"]):
                    detected_category = "Audio"
                elif any(w in lower_q for w in ["laptop", "notebook", "macbook", "computer"]):
                    detected_category = "Laptops"
                elif any(w in lower_q for w in ["keyboard", "keys", "typing"]):
                    detected_category = "Keyboards"
                elif any(w in lower_q for w in ["monitor", "display", "screen"]):
                    detected_category = "Monitors"
                elif any(w in lower_q for w in ["mouse", "charger", "cable", "dock", "stand"]):
                    detected_category = "Accessories"

        # Detect budget from query if not explicitly set
        budget_minor = request.budget_minor
        if budget_minor is None:
            # Match patterns like "$200", "200 dollars", "under 150", "budget of 300"
            budget_match = re.search(r"\$\s*(\d+(?:\.\d{1,2})?)", query)
            if not budget_match:
                budget_match = re.search(r"(?:under|budget|max|below)\s+(\d+(?:\.\d{1,2})?)", lower_q)
            if budget_match:
                try:
                    amount_float = float(budget_match.group(1))
                    budget_minor = int(amount_float * 100)
                except ValueError:
                    pass

        # Extract features
        features = list(request.required_features)
        for kw in COMMON_FEATURE_KEYWORDS:
            if kw in lower_q and kw not in features:
                features.append(kw)

        # If no category and no features and query is short, flag ambiguous
        if not detected_category and not features and budget_minor is None:
            return ShoppingIntent(
                raw_query=query,
                intent_type="clarification_needed",
                constraints=ShoppingConstraint(
                    category=None,
                    budget_minor=None,
                    currency=request.currency,
                ),
                ambiguity_detected=True,
                clarification_questions=[
                    "Could you specify the product category you are searching for?",
                    "What features or budget limits would you like to set?",
                ],
            )

        intent_type = "comparison" if "compare" in lower_q or "versus" in lower_q or "vs" in lower_q else "recommendation"

        return ShoppingIntent(
            raw_query=query,
            intent_type=intent_type,
            constraints=ShoppingConstraint(
                category=detected_category,
                budget_minor=budget_minor,
                currency=request.currency,
                required_features=features,
                preferences=list(request.preferences),
            ),
            ambiguity_detected=False,
            clarification_questions=[],
        )

    async def generate_explanation(
        self,
        product: dict[str, Any],
        intent: ShoppingIntent,
    ) -> str:
        name = product.get("name", "Product")
        brand = product.get("brand") or "Catalog brand"
        category = product.get("category", "")
        price_minor = product.get("price_minor", 0)
        price_str = f"${price_minor / 100:.2f}"
        rating = product.get("rating")
        rating_str = f"{rating}/5" if rating else "Unrated"

        meta = product.get("metadata_json") or {}
        specs_parts = [f"{k}: {v}" for k, v in meta.items() if isinstance(v, (str, int, float))]
        specs_str = ", ".join(specs_parts[:3]) if specs_parts else "standard specifications"

        sources = product.get("sources") or []
        source_evidence_str = ""
        if sources:
            s0 = sources[0]
            s_name = s0.get("source_name", "Catalog Source")
            source_evidence_str = f" Backed by source evidence from {s_name}."

        return (
            f"{name} by {brand} ({category}) is available at {price_str} with {rating_str} rating. "
            f"Key specifications include {specs_str}.{source_evidence_str}"
        )


class GeminiLLMProvider:
    """Live provider boundary calling Google Gemini API."""

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash", base_url: str = "") -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = (
            base_url.rstrip("/")
            if base_url
            else "https://generativelanguage.googleapis.com/v1beta"
        )

    async def parse_intent(self, request: ShoppingAgentRequest) -> ShoppingIntent:
        """Call Gemini API to extract structured intent from query."""
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        prompt = (
            f"You are PayPilot Shopping Assistant. Extract structured shopping constraints from this user query:\n"
            f"Query: {request.query}\n"
            f"Known categories: {KNOWN_CATEGORIES}\n"
            f"Return JSON strictly with fields: category (str or null), budget_minor (int cents or null), "
            f"required_features (list[str]), preferences (list[str]), is_ambiguous (bool), clarification_questions (list[str])."
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"response_mime_type": "application/json"},
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                        import json

                        parsed = json.loads(text)
                        is_amb = parsed.get("is_ambiguous", False)
                        return ShoppingIntent(
                            raw_query=request.query,
                            intent_type="clarification_needed" if is_amb else "recommendation",
                            constraints=ShoppingConstraint(
                                category=parsed.get("category") or request.category,
                                budget_minor=parsed.get("budget_minor") or request.budget_minor,
                                currency=request.currency,
                                required_features=parsed.get("required_features") or request.required_features,
                                preferences=parsed.get("preferences") or request.preferences,
                            ),
                            ambiguity_detected=is_amb,
                            clarification_questions=parsed.get("clarification_questions", []),
                        )
        except Exception as exc:
            logger.warning("Gemini intent parsing failed, falling back to deterministic extraction: %s", exc)

        # Fallback to offline deterministic parsing if live call fails
        mock = MockLLMProvider()
        return await mock.parse_intent(request)

    async def generate_explanation(
        self,
        product: dict[str, Any],
        intent: ShoppingIntent,
    ) -> str:
        # Fall back to grounded evidence builder to guarantee zero hallucinations
        mock = MockLLMProvider()
        return await mock.generate_explanation(product, intent)


def get_llm_provider(settings: Settings | None = None) -> LLMProviderProtocol:
    """Factory function providing the configured LLM provider instance."""
    if settings is None:
        settings = get_settings()

    provider = (settings.llm_provider or "").lower().strip()

    if not provider or provider in ("", "none", "unconfigured", "disabled"):
        return UnconfiguredLLMProvider()

    if provider == "mock":
        return MockLLMProvider()

    if provider == "gemini":
        if not settings.llm_api_key or not settings.llm_api_key.strip():
            logger.warning("LLM provider 'gemini' requested but LLM_API_KEY is not set.")
            return UnconfiguredLLMProvider()
        return GeminiLLMProvider(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_base_url,
        )

    raise LLMProviderNotConfigured(f"Unknown or unsupported LLM provider '{provider}'.")

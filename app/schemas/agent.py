"""
Typed schemas for the AI Shopping Agent and Decision Layer.

Defines schemas for:
- Shopping constraints (category, budget, currency, features, preferences)
- Parsed shopping intent and ambiguity detection
- Grounded product recommendations with catalog source evidence
- Deterministic product comparisons and budget optimization summaries
- Shopping agent request and response envelopes
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ShoppingConstraint(BaseModel):
    """Parsed shopping constraints governing hard filters and ranking."""

    category: str | None = Field(
        default=None,
        description="Target catalog category (e.g., 'Audio', 'Laptops', 'Keyboards').",
    )
    budget_minor: int | None = Field(
        default=None,
        ge=0,
        description="Maximum spending budget in minor units (e.g., cents for USD).",
    )
    currency: str = Field(
        default="USD",
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code.",
    )
    required_features: list[str] = Field(
        default_factory=list,
        description="Must-have specifications or features (e.g., 'noise-canceling', 'Bluetooth 5.2').",
    )
    preferences: list[str] = Field(
        default_factory=list,
        description="Nice-to-have user preferences (e.g., 'lightweight', 'long battery').",
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of recommendations to return.",
    )


class ShoppingIntent(BaseModel):
    """Structured representation of shopper intent parsed by the LLM boundary."""

    raw_query: str = Field(description="The original user query text.")
    intent_type: str = Field(
        default="recommendation",
        description="Intent type: 'recommendation', 'search', 'comparison', 'clarification_needed'.",
    )
    constraints: ShoppingConstraint = Field(
        description="Deterministic constraints extracted from query and input.",
    )
    ambiguity_detected: bool = Field(
        default=False,
        description="True if query is ambiguous, contradictory, or missing critical info.",
    )
    clarification_questions: list[str] = Field(
        default_factory=list,
        description="Questions to ask the shopper when constraints cannot be resolved.",
    )


class ProductRecommendation(BaseModel):
    """A recommended product grounded in verified catalog data and source evidence."""

    product_id: UUID = Field(description="Unique product identifier.")
    sku: str = Field(description="Product SKU.")
    name: str = Field(description="Product name.")
    brand: str | None = Field(default=None, description="Product brand.")
    category: str = Field(description="Product category.")
    price_minor: int = Field(description="Product price in minor units.")
    currency: str = Field(description="Currency code.")
    available_stock: int = Field(description="Current in-stock quantity.")
    rating: float | None = Field(default=None, description="Product rating (0.0 - 5.0).")
    match_score: float = Field(
        description="Deterministic match score between 0.0 and 1.0 calculated by backend.",
    )
    explanation: str = Field(
        description="Explanation strictly synthesized from catalog specifications and source claims.",
    )
    matched_features: list[str] = Field(
        default_factory=list,
        description="Subset of user constraints satisfied by this product.",
    )
    source_evidence: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Catalog source evidence records backing claims.",
    )


class ProductComparisonItem(BaseModel):
    """Side-by-side comparison item between ranked products."""

    product_id: UUID = Field(description="Product UUID.")
    name: str = Field(description="Product name.")
    price_minor: int = Field(description="Price in minor units.")
    currency: str = Field(description="Currency code.")
    score: float = Field(description="Match / ranking score.")
    pros: list[str] = Field(
        default_factory=list,
        description="Strengths grounded in product specs.",
    )
    cons: list[str] = Field(
        default_factory=list,
        description="Tradeoffs or unfulfilled preferences.",
    )
    matched_features: list[str] = Field(default_factory=list)
    missing_features: list[str] = Field(default_factory=list)


class BudgetOptimizationSummary(BaseModel):
    """Deterministic budget calculation and allocation summary."""

    budget_minor: int | None = Field(
        default=None,
        description="Shopper budget in minor units.",
    )
    currency: str = Field(default="USD")
    allocated_minor: int = Field(
        default=0,
        description="Total cost of recommended items in minor units.",
    )
    remaining_minor: int = Field(
        default=0,
        description="Remaining unallocated budget.",
    )
    fits_within_budget: bool = Field(
        default=True,
        description="True if recommendations fit strictly within the budget ceiling.",
    )
    recommended_item_count: int = Field(
        default=0,
        description="Number of items included in budget allocation.",
    )


class ShoppingAgentRequest(BaseModel):
    """Shopper natural language request to the AI Shopping Agent."""

    query: str = Field(
        min_length=1,
        max_length=1000,
        description="Natural language shopping request or query.",
    )
    category: str | None = Field(
        default=None,
        description="Optional category hint or constraint override.",
    )
    budget_minor: int | None = Field(
        default=None,
        ge=0,
        description="Optional budget ceiling in minor currency units (e.g., 20000 = $200.00).",
    )
    currency: str = Field(
        default="USD",
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code.",
    )
    required_features: list[str] = Field(
        default_factory=list,
        description="Optional list of explicit required features.",
    )
    preferences: list[str] = Field(
        default_factory=list,
        description="Optional list of user preferences.",
    )


class ShoppingAgentResponse(BaseModel):
    """Full decision-layer response returned to the shopper."""

    intent: ShoppingIntent = Field(description="Parsed intent and extracted constraints.")
    recommendations: list[ProductRecommendation] = Field(
        default_factory=list,
        description="Ranked product recommendations with source evidence.",
    )
    comparison: list[ProductComparisonItem] = Field(
        default_factory=list,
        description="Deterministic side-by-side comparison of candidate products.",
    )
    budget_summary: BudgetOptimizationSummary | None = Field(
        default=None,
        description="Budget allocation and knapsack results.",
    )
    clarification_questions: list[str] = Field(
        default_factory=list,
        description="Clarification questions if query was ambiguous or unresolvable.",
    )

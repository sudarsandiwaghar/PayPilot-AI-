"""
Deterministic Decision Engine and Shopping Agent Pipeline.

Enforces:
1. Hard filtering via database constraints (active, in-stock, category, budget ceiling, currency).
2. Deterministic scoring, ranking, and tie-breaking in backend Python code.
3. Grounded explanations synthesized strictly from verified catalog data and source evidence.
4. Ambiguity handling and clarification question emission when constraints are unclear.
5. Knapsack budget allocation.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.schemas.agent import (
    BudgetOptimizationSummary,
    ProductComparisonItem,
    ProductRecommendation,
    ShoppingAgentRequest,
    ShoppingAgentResponse,
    ShoppingIntent,
)
from app.services.agent.llm_provider import LLMProviderProtocol
from app.services.agent.tools import optimize_budget

logger = logging.getLogger("paypilot.decision_engine")


def _feature_in_text(feature: str, text: str, meta: dict[str, Any] | None) -> bool:
    """Check if a feature keyword or phrase appears in product text or metadata."""
    feat_lower = feature.lower().strip()
    if feat_lower in text:
        return True
    if meta:
        meta_str = json.dumps(meta).lower()
        if feat_lower in meta_str:
            return True
        # Check specific key aliases
        for k, v in meta.items():
            if feat_lower in k.lower() or feat_lower in str(v).lower():
                return True
    return False


class DecisionEngine:
    """Engine executing deterministic filtering, ranking, and grounded explanations."""

    def __init__(self, llm_provider: LLMProviderProtocol) -> None:
        self.llm_provider = llm_provider

    async def process_shopping_request(
        self,
        db: AsyncSession,
        request: ShoppingAgentRequest,
    ) -> ShoppingAgentResponse:
        """Process shopper request through the complete decision pipeline."""
        # 1. Parse intent via LLM boundary
        intent: ShoppingIntent = await self.llm_provider.parse_intent(request)

        # 2. Check for ambiguity / clarification needed
        if intent.ambiguity_detected or intent.intent_type == "clarification_needed":
            logger.info("Shopping request marked ambiguous. Emitting clarification questions.")
            return ShoppingAgentResponse(
                intent=intent,
                recommendations=[],
                comparison=[],
                budget_summary=None,
                clarification_questions=intent.clarification_questions
                or [
                    "Could you clarify the specific product type or features you need?",
                    "What is your target budget for this item?",
                ],
            )

        constraints = intent.constraints

        # 3. Hard database filtering
        stmt = (
            select(Product)
            .options(selectinload(Product.sources))
            .where(Product.is_active.is_(True))
            .where(Product.stock_qty > 0)
            .where(Product.currency == constraints.currency)
        )

        if constraints.category:
            stmt = stmt.where(Product.category.ilike(constraints.category))

        # Strict hard ceiling: no product exceeding budget is considered
        if constraints.budget_minor is not None:
            stmt = stmt.where(Product.price_minor <= constraints.budget_minor)

        result = await db.execute(stmt)
        candidates = list(result.scalars().all())

        if not candidates:
            logger.info("No catalog products passed hard constraints for intent: %s", constraints)
            return ShoppingAgentResponse(
                intent=intent,
                recommendations=[],
                comparison=[],
                budget_summary=BudgetOptimizationSummary(
                    budget_minor=constraints.budget_minor,
                    currency=constraints.currency,
                    allocated_minor=0,
                    remaining_minor=constraints.budget_minor or 0,
                    fits_within_budget=True,
                    recommended_item_count=0,
                )
                if constraints.budget_minor is not None
                else None,
                clarification_questions=[
                    f"No matching in-stock products found under the current constraints. "
                    f"Would you like to expand your budget beyond ${constraints.budget_minor/100:.2f} or explore other categories?"
                ]
                if constraints.budget_minor
                else ["No products matched the given category or specifications."],
            )

        # 4. Deterministic scoring and ranking
        scored_items: list[tuple[float, Product, list[str], list[str]]] = []

        for prod in candidates:
            prod_text = f"{prod.name} {prod.description or ''} {prod.brand or ''}".lower()
            meta = prod.metadata_json or {}

            # Check required features
            matched_req: list[str] = []
            for rf in constraints.required_features:
                if _feature_in_text(rf, prod_text, meta):
                    matched_req.append(rf)

            # Check preferences
            matched_pref: list[str] = []
            for pref in constraints.preferences:
                if _feature_in_text(pref, prod_text, meta):
                    matched_pref.append(pref)

            # Hard filter on required features if specified
            if constraints.required_features and len(matched_req) < len(constraints.required_features):
                # If strict features required, prioritize those with higher match
                req_ratio = len(matched_req) / len(constraints.required_features)
            else:
                req_ratio = 1.0

            pref_ratio = (
                len(matched_pref) / len(constraints.preferences)
                if constraints.preferences
                else 1.0
            )

            rating_ratio = float(prod.rating or 3.5) / 5.0

            # Price efficiency score: closer to budget without exceeding
            if constraints.budget_minor and constraints.budget_minor > 0:
                price_ratio = prod.price_minor / constraints.budget_minor
            else:
                price_ratio = 0.5

            # Deterministic composite score
            score = round(
                0.4 * req_ratio + 0.3 * rating_ratio + 0.2 * pref_ratio + 0.1 * price_ratio,
                3,
            )

            scored_items.append((score, prod, matched_req, matched_pref))

        # Deterministic sort: highest score, then lowest price, then product UUID
        scored_items.sort(key=lambda x: (-x[0], x[1].price_minor, str(x[1].id)))

        top_candidates = scored_items[: constraints.max_results]

        # 5. Build Recommendations with Grounded Explanations
        recommendations: list[ProductRecommendation] = []
        comparison_items: list[ProductComparisonItem] = []
        raw_product_dicts: list[dict[str, Any]] = []

        for score, prod, matched_req, matched_pref in top_candidates:
            sources_list = [
                {
                    "source_id": str(s.id),
                    "source_name": s.source_name,
                    "source_type": s.source_type,
                    "source_url": s.source_url,
                    "price_minor": s.price_minor,
                    "is_demo_data": s.is_demo_data,
                    "verified_at": s.verified_at.isoformat() if s.verified_at else None,
                }
                for s in (prod.sources or [])
            ]

            prod_dict = {
                "id": str(prod.id),
                "sku": prod.sku,
                "name": prod.name,
                "brand": prod.brand,
                "category": prod.category,
                "price_minor": prod.price_minor,
                "currency": prod.currency,
                "rating": float(prod.rating) if prod.rating else None,
                "metadata_json": prod.metadata_json or {},
                "sources": sources_list,
            }
            raw_product_dicts.append(prod_dict)

            # Generate grounded explanation via boundary
            explanation = await self.llm_provider.generate_explanation(prod_dict, intent)

            rec = ProductRecommendation(
                product_id=prod.id,
                sku=prod.sku,
                name=prod.name,
                brand=prod.brand,
                category=prod.category,
                price_minor=prod.price_minor,
                currency=prod.currency,
                available_stock=prod.stock_qty,
                rating=float(prod.rating) if prod.rating else None,
                match_score=score,
                explanation=explanation,
                matched_features=matched_req + matched_pref,
                source_evidence=sources_list,
            )
            recommendations.append(rec)

            # Build comparison item
            pros = []
            cons = []
            if prod.rating and prod.rating >= 4.5:
                pros.append(f"High catalog rating: {prod.rating}/5")
            if prod.stock_qty > 15:
                pros.append(f"Ample stock ({prod.stock_qty} units available)")
            if matched_req:
                pros.append(f"Satisfies required features: {', '.join(matched_req)}")

            if constraints.budget_minor:
                saved = constraints.budget_minor - prod.price_minor
                if saved > 0:
                    pros.append(f"${saved / 100:.2f} under budget ceiling")

            missing_req = [rf for rf in constraints.required_features if rf not in matched_req]
            if missing_req:
                cons.append(f"Missing required specifications: {', '.join(missing_req)}")

            comparison_items.append(
                ProductComparisonItem(
                    product_id=prod.id,
                    name=prod.name,
                    price_minor=prod.price_minor,
                    currency=prod.currency,
                    score=score,
                    pros=pros or ["Complies with category and pricing constraints."],
                    cons=cons or ["Standard catalog product."],
                    matched_features=matched_req + matched_pref,
                    missing_features=missing_req,
                )
            )

        # 6. Budget optimization calculation
        budget_summary = None
        if constraints.budget_minor is not None:
            opt_result = optimize_budget(
                products=raw_product_dicts,
                budget_minor=constraints.budget_minor,
            )
            budget_summary = BudgetOptimizationSummary(
                budget_minor=constraints.budget_minor,
                currency=constraints.currency,
                allocated_minor=opt_result["allocated_minor"],
                remaining_minor=opt_result["remaining_minor"],
                fits_within_budget=opt_result["fits_within_budget"],
                recommended_item_count=len(opt_result["selected_products"]),
            )

        return ShoppingAgentResponse(
            intent=intent,
            recommendations=recommendations,
            comparison=comparison_items,
            budget_summary=budget_summary,
            clarification_questions=[],
        )

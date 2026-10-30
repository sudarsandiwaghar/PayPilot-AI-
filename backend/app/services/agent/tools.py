"""
Allowlisted read-only tools exposed to the PayPilot Shopping Agent.

CRITICAL SECURITY CONSTRAINT:
The shopping agent only has access to read-only discovery, inspection,
comparison, and mathematical budget optimization tools.
It is strictly prohibited from creating orders, initiating payments,
capturing transactions, or bypassing shopper checkout confirmation.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.utils.exceptions import ProductNotFound, ToolExecutionForbidden

logger = logging.getLogger("paypilot.agent_tools")

# Strict Allowlist of permitted read-only tools
ALLOWLISTED_TOOLS: frozenset[str] = frozenset({
    "search_products",
    "get_product_detail",
    "compare_products",
    "optimize_budget",
})


def _serialize_product(p: Product) -> dict[str, Any]:
    """Helper to convert product model and sources to dictionary."""
    sources_data = []
    for s in (p.sources or []):
        sources_data.append({
            "source_id": str(s.id),
            "source_type": s.source_type,
            "source_name": s.source_name,
            "source_url": s.source_url,
            "price_minor": s.price_minor,
            "currency": s.currency,
            "is_demo_data": s.is_demo_data,
            "verified_at": s.verified_at.isoformat() if s.verified_at else None,
        })

    return {
        "id": str(p.id),
        "product_id": str(p.id),
        "sku": p.sku,
        "name": p.name,
        "description": p.description or "",
        "category": p.category,
        "brand": p.brand,
        "price_minor": p.price_minor,
        "currency": p.currency,
        "stock_qty": p.stock_qty,
        "rating": float(p.rating) if p.rating is not None else None,
        "image_url": p.image_url,
        "is_active": p.is_active,
        "is_demo_data": p.is_demo_data,
        "metadata_json": p.metadata_json or {},
        "sources": sources_data,
    }


async def search_products(
    db: AsyncSession,
    category: str | None = None,
    min_price_minor: int | None = None,
    max_price_minor: int | None = None,
    query: str | None = None,
    in_stock_only: bool = True,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Tool: Search and filter catalog products read-only."""
    stmt = (
        select(Product)
        .options(selectinload(Product.sources))
        .where(Product.is_active.is_(True))
    )

    if category:
        stmt = stmt.where(Product.category.ilike(category))

    if min_price_minor is not None:
        stmt = stmt.where(Product.price_minor >= min_price_minor)

    if max_price_minor is not None:
        stmt = stmt.where(Product.price_minor <= max_price_minor)

    if in_stock_only:
        stmt = stmt.where(Product.stock_qty > 0)

    if query:
        term = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(term),
                Product.description.ilike(term),
                Product.brand.ilike(term),
            )
        )

    stmt = stmt.order_by(Product.rating.desc().nullslast(), Product.price_minor.asc()).limit(limit)
    res = await db.execute(stmt)
    products = list(res.scalars().all())
    return [_serialize_product(p) for p in products]


async def get_product_detail(
    db: AsyncSession,
    product_id: UUID | str,
) -> dict[str, Any]:
    """Tool: Get full product details and source evidence."""
    if isinstance(product_id, str):
        try:
            pid = UUID(product_id)
        except ValueError:
            raise ProductNotFound(str(product_id)) from None
    else:
        pid = product_id

    stmt = (
        select(Product)
        .options(selectinload(Product.sources))
        .where(Product.id == pid, Product.is_active.is_(True))
    )
    product = (await db.execute(stmt)).scalar_one_or_none()
    if not product:
        raise ProductNotFound(str(product_id))

    return _serialize_product(product)


async def compare_products(
    db: AsyncSession,
    product_ids: list[UUID | str],
) -> list[dict[str, Any]]:
    """Tool: Generate side-by-side comparison for a set of products."""
    results = []
    for pid in product_ids:
        try:
            prod = await get_product_detail(db, pid)
            results.append(prod)
        except ProductNotFound:
            continue

    comparisons = []
    for p in results:
        meta = p.get("metadata_json") or {}
        pros = []
        cons = []

        rating = p.get("rating")
        if rating and rating >= 4.5:
            pros.append(f"Highly rated ({rating}/5)")
        elif rating and rating < 4.0:
            cons.append(f"Lower customer rating ({rating}/5)")

        if meta.get("battery_hours") and meta["battery_hours"] >= 20:
            pros.append(f"Long battery life ({meta['battery_hours']} hours)")

        if p.get("stock_qty", 0) > 10:
            pros.append("In high stock")
        elif p.get("stock_qty", 0) < 5:
            cons.append("Limited stock remaining")

        comparisons.append({
            "product_id": p["id"],
            "name": p["name"],
            "price_minor": p["price_minor"],
            "currency": p["currency"],
            "rating": rating,
            "pros": pros or ["Meets baseline specifications"],
            "cons": cons or ["Standard product profile"],
            "metadata_json": meta,
        })

    return comparisons


def optimize_budget(
    products: list[dict[str, Any]],
    budget_minor: int,
) -> dict[str, Any]:
    """Tool: Pure deterministic knapsack budget calculation."""
    if budget_minor <= 0:
        return {
            "budget_minor": budget_minor,
            "allocated_minor": 0,
            "remaining_minor": 0,
            "fits_within_budget": True,
            "selected_products": [],
        }

    # Sort candidates by price ascending
    candidates = sorted(
        [p for p in products if p.get("price_minor", 0) <= budget_minor],
        key=lambda x: (x.get("price_minor", 0), -(x.get("rating") or 0)),
    )

    selected = []
    total_spent = 0
    for cand in candidates:
        price = cand.get("price_minor", 0)
        if total_spent + price <= budget_minor:
            selected.append(cand)
            total_spent += price

    return {
        "budget_minor": budget_minor,
        "allocated_minor": total_spent,
        "remaining_minor": budget_minor - total_spent,
        "fits_within_budget": total_spent <= budget_minor,
        "selected_products": selected,
    }


async def execute_tool(
    tool_name: str,
    args: dict[str, Any],
    db: AsyncSession,
) -> Any:
    """Execute an agent tool with strict allowlist enforcement.

    Raises:
        ToolExecutionForbidden: If the tool name is not in ALLOWLISTED_TOOLS.
    """
    if tool_name not in ALLOWLISTED_TOOLS:
        logger.warning("Agent attempted to execute forbidden or unknown tool: '%s'", tool_name)
        raise ToolExecutionForbidden(tool_name)

    if tool_name == "search_products":
        return await search_products(
            db=db,
            category=args.get("category"),
            min_price_minor=args.get("min_price_minor"),
            max_price_minor=args.get("max_price_minor"),
            query=args.get("query"),
            in_stock_only=args.get("in_stock_only", True),
            limit=args.get("limit", 10),
        )
    elif tool_name == "get_product_detail":
        return await get_product_detail(db=db, product_id=args["product_id"])
    elif tool_name == "compare_products":
        return await compare_products(db=db, product_ids=args["product_ids"])
    elif tool_name == "optimize_budget":
        return optimize_budget(
            products=args["products"],
            budget_minor=args["budget_minor"],
        )
    raise ToolExecutionForbidden(tool_name)

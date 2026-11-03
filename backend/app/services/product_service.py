"""
Product catalog service.

Provides pure business logic for filtering, searching, sorting, and retrieving
products. No HTTP/FastAPI awareness.
"""

from __future__ import annotations

import math
from uuid import UUID

from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.schemas.product import ProductFilterParams
from app.utils.exceptions import ProductNotFound


# Category and concept synonyms mapping common shopper terms to catalog categories
CATEGORY_SYNONYMS: dict[str, list[str]] = {
    "electronic": ["Audio", "Wearables", "Computing", "Photography", "Gaming"],
    "electronics": ["Audio", "Wearables", "Computing", "Photography", "Gaming"],
    "gadget": ["Audio", "Wearables", "Computing", "Photography", "Gaming"],
    "gadgets": ["Audio", "Wearables", "Computing", "Photography", "Gaming"],
    "tech": ["Audio", "Wearables", "Computing", "Photography", "Gaming"],
    "technology": ["Audio", "Wearables", "Computing", "Photography", "Gaming"],
    "computer": ["Computing"],
    "computers": ["Computing"],
    "pc": ["Computing"],
    "laptop": ["Computing"],
    "laptops": ["Computing"],
    "notebook": ["Computing"],
    "notebooks": ["Computing"],
    "audio": ["Audio"],
    "headphone": ["Audio"],
    "headphones": ["Audio"],
    "earphone": ["Audio"],
    "earphones": ["Audio"],
    "earbud": ["Audio"],
    "earbuds": ["Audio"],
    "speaker": ["Audio"],
    "speakers": ["Audio"],
    "sound": ["Audio"],
    "music": ["Audio"],
    "wearable": ["Wearables"],
    "wearables": ["Wearables"],
    "watch": ["Wearables"],
    "watches": ["Wearables"],
    "smartwatch": ["Wearables"],
    "smartwatches": ["Wearables"],
    "fitness": ["Wearables"],
    "camera": ["Photography"],
    "cameras": ["Photography"],
    "photo": ["Photography"],
    "photography": ["Photography"],
    "drone": ["Photography"],
    "drones": ["Photography"],
    "game": ["Gaming"],
    "games": ["Gaming"],
    "gaming": ["Gaming"],
    "console": ["Gaming"],
    "consoles": ["Gaming"],
    "monitor": ["Home Office"],
    "monitors": ["Home Office"],
    "display": ["Home Office"],
    "displays": ["Home Office"],
    "screen": ["Home Office"],
    "screens": ["Home Office"],
    "mouse": ["Home Office"],
    "mice": ["Home Office"],
    "keyboard": ["Home Office"],
    "keyboards": ["Home Office"],
    "office": ["Home Office"],
    "chair": ["Home Office"],
    "seating": ["Home Office"],
}


def get_term_variants(term: str) -> set[str]:
    """Generate search variants for a term (singular/plural, common inflections)."""
    t = term.lower().strip()
    if not t:
        return set()
    variants = {t}

    if t.endswith("ies") and len(t) > 4:
        variants.add(t[:-3] + "y")
    elif t.endswith("es") and len(t) > 3:
        variants.add(t[:-2])
    elif t.endswith("s") and not t.endswith("ss") and len(t) > 2:
        variants.add(t[:-1])
    else:
        variants.add(t + "s")
        if t.endswith(("ch", "sh", "x", "s", "z")):
            variants.add(t + "es")

    if t.endswith("ics"):
        variants.add(t[:-1])
    elif t.endswith("ic"):
        variants.add(t + "s")

    return variants


class ProductService:
    """Service handling product catalog operations."""

    @staticmethod
    async def list_products(
        db: AsyncSession,
        params: ProductFilterParams,
    ) -> tuple[list[Product], int, int]:
        """List products matching the filter criteria with pagination.

        Returns:
            (items, total_count, total_pages)
        """
        stmt = select(Product).where(Product.is_active.is_(True))

        if params.q:
            raw_q = params.q.strip()
            tokens = [tok for tok in raw_q.split() if tok]
            if tokens:
                token_clauses = []
                for token in tokens:
                    variants = get_term_variants(token)
                    variant_clauses = []

                    # 1. Search text across name, description, brand, category, and metadata_json (specifications/tags)
                    for v in variants:
                        v_pattern = f"%{v}%"
                        variant_clauses.extend([
                            Product.name.ilike(v_pattern),
                            Product.description.ilike(v_pattern),
                            Product.brand.ilike(v_pattern),
                            Product.category.ilike(v_pattern),
                            and_(
                                Product.metadata_json.is_not(None),
                                func.cast(Product.metadata_json, String).ilike(v_pattern),
                            ),
                        ])

                    # 2. Check concept/category synonyms and sensible variants
                    for v in variants:
                        if v in ("electronic", "electronics"):
                            variant_clauses.append(
                                or_(
                                    Product.category.in_(["Audio", "Wearables", "Computing", "Photography", "Gaming"]),
                                    and_(Product.category == "Home Office", Product.sku != "HO-HM-AERON"),
                                )
                            )
                        elif v in CATEGORY_SYNONYMS:
                            variant_clauses.append(Product.category.in_(CATEGORY_SYNONYMS[v]))

                    token_clauses.append(or_(*variant_clauses))

                stmt = stmt.where(and_(*token_clauses))

        if params.category:
            stmt = stmt.where(Product.category == params.category)

        if params.brand:
            stmt = stmt.where(Product.brand == params.brand)

        if params.min_price_minor is not None:
            stmt = stmt.where(Product.price_minor >= params.min_price_minor)

        if params.max_price_minor is not None:
            stmt = stmt.where(Product.price_minor <= params.max_price_minor)

        if params.min_rating is not None:
            stmt = stmt.where(Product.rating >= params.min_rating)

        if params.in_stock_only:
            stmt = stmt.where(Product.stock_qty > 0)

        # Count total matches
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar_one()

        # Sort order
        if params.sort_by == "price_asc":
            stmt = stmt.order_by(Product.price_minor.asc())
        elif params.sort_by == "price_desc":
            stmt = stmt.order_by(Product.price_minor.desc())
        elif params.sort_by == "name":
            stmt = stmt.order_by(Product.name.asc())
        else:  # "rating" default
            stmt = stmt.order_by(Product.rating.desc().nullslast(), Product.name.asc())

        # Pagination
        offset = (params.page - 1) * params.page_size
        stmt = stmt.offset(offset).limit(params.page_size)

        result = await db.execute(stmt)
        items = list(result.scalars().all())
        total_pages = math.ceil(total / params.page_size) if total > 0 else 1

        return items, total, total_pages

    @staticmethod
    async def get_product_by_id(db: AsyncSession, product_id: UUID) -> Product:
        """Retrieve a product by its UUID with source evidence.

        Raises:
            ProductNotFound: If no active product exists with this ID.
        """
        stmt = (
            select(Product)
            .options(selectinload(Product.sources))
            .where(Product.id == product_id, Product.is_active.is_(True))
        )
        result = await db.execute(stmt)
        product = result.scalar_one_or_none()

        if product is None:
            raise ProductNotFound(str(product_id))

        return product

    @staticmethod
    async def get_categories(db: AsyncSession) -> list[str]:
        """Return distinct active categories in alphabetical order."""
        stmt = (
            select(Product.category)
            .where(Product.is_active.is_(True))
            .distinct()
            .order_by(Product.category.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

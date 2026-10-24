"""
Product catalog service.

Provides pure business logic for filtering, searching, sorting, and retrieving
products. No HTTP/FastAPI awareness.
"""

from __future__ import annotations

import math
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.schemas.product import ProductFilterParams
from app.utils.exceptions import ProductNotFound


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
            query_str = f"%{params.q.strip()}%"
            stmt = stmt.where(
                or_(
                    Product.name.ilike(query_str),
                    Product.description.ilike(query_str),
                    Product.brand.ilike(query_str),
                )
            )

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

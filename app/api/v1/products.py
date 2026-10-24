"""
Product catalog API endpoints (v1).

Public endpoints for browsing, searching, and inspecting products.
All responses follow the standard `ApiResponse` envelope.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.product import ProductDetail, ProductFilterParams, ProductListItem
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["Products"])


def _build_meta(request: Request) -> dict:
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get(
    "",
    response_model=ApiResponse[PaginatedResponse[ProductListItem]],
    summary="List and filter products",
    description="Browse products with filtering by category, brand, price range, rating, stock, and search query.",
)
async def list_products(
    request: Request,
    q: str | None = Query(default=None, description="Full-text search query across name/description/brand"),
    category: str | None = Query(default=None, description="Filter by category"),
    brand: str | None = Query(default=None, description="Filter by brand"),
    min_price: int | None = Query(default=None, ge=0, description="Minimum price in minor units"),
    max_price: int | None = Query(default=None, ge=0, description="Maximum price in minor units"),
    min_rating: float | None = Query(default=None, ge=0.0, le=5.0, description="Minimum rating"),
    in_stock: bool = Query(default=False, description="Filter in-stock products only"),
    sort_by: str = Query(
        default="rating",
        pattern=r"^(price_asc|price_desc|rating|name)$",
        description="Sort ordering",
    ),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[ProductListItem]]:
    params = ProductFilterParams(
        q=q,
        category=category,
        brand=brand,
        min_price_minor=min_price,
        max_price_minor=max_price,
        min_rating=min_rating,
        in_stock_only=in_stock,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )
    items, total, total_pages = await ProductService.list_products(db, params)

    paginated_data = PaginatedResponse[ProductListItem](
        items=[ProductListItem.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )

    return ApiResponse(
        data=paginated_data,
        meta=_build_meta(request),
    )


@router.get(
    "/categories",
    response_model=ApiResponse[list[str]],
    summary="List product categories",
    description="Retrieve all unique active product categories.",
)
async def list_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[str]]:
    categories = await ProductService.get_categories(db)
    return ApiResponse(
        data=categories,
        meta=_build_meta(request),
    )


@router.get(
    "/{product_id}",
    response_model=ApiResponse[ProductDetail],
    summary="Get product detail",
    description="Retrieve full details for a product, including source evidence and claims.",
)
async def get_product(
    request: Request,
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProductDetail]:
    product = await ProductService.get_product_by_id(db, product_id)
    return ApiResponse(
        data=ProductDetail.model_validate(product),
        meta=_build_meta(request),
    )

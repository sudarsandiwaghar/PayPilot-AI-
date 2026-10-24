"""
Integration tests for Product catalog endpoints.

Tests list, search, filter, sort, pagination, categories, detail,
and demo-data provenance attributes.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_products_returns_paginated_catalog(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products")
    assert response.status_code == 200
    payload = response.json()

    assert "data" in payload
    assert "meta" in payload
    assert "request_id" in payload["meta"]
    assert payload["errors"] == []

    data = payload["data"]
    assert data["total"] == 20
    assert len(data["items"]) == 20
    assert data["page"] == 1
    assert data["page_size"] == 20

    # Verify minor units and provenance on first item
    first_item = data["items"][0]
    assert "price_minor" in first_item
    assert first_item["price_minor"] > 0
    assert first_item["currency"] == "USD"
    assert first_item["is_demo_data"] is True


@pytest.mark.asyncio
async def test_filter_by_category(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products?category=Audio")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] > 0
    for item in data["items"]:
        assert item["category"] == "Audio"


@pytest.mark.asyncio
async def test_filter_by_brand(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products?brand=Sony")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] >= 2
    for item in data["items"]:
        assert item["brand"] == "Sony"


@pytest.mark.asyncio
async def test_filter_by_price_range(client: AsyncClient) -> None:
    min_p = 10000  # $100
    max_p = 50000  # $500
    response = await client.get(f"/api/v1/products?min_price={min_p}&max_price={max_p}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] > 0
    for item in data["items"]:
        assert min_p <= item["price_minor"] <= max_p


@pytest.mark.asyncio
async def test_search_query(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products?q=noise-canceling")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] >= 1
    assert any("Sony" in item["name"] for item in data["items"])


@pytest.mark.asyncio
async def test_sort_order(client: AsyncClient) -> None:
    # Ascending
    resp_asc = await client.get("/api/v1/products?sort_by=price_asc")
    prices_asc = [item["price_minor"] for item in resp_asc.json()["data"]["items"]]
    assert prices_asc == sorted(prices_asc)

    # Descending
    resp_desc = await client.get("/api/v1/products?sort_by=price_desc")
    prices_desc = [item["price_minor"] for item in resp_desc.json()["data"]["items"]]
    assert prices_desc == sorted(prices_desc, reverse=True)


@pytest.mark.asyncio
async def test_list_categories(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products/categories")
    assert response.status_code == 200
    payload = response.json()
    categories = payload["data"]
    assert len(categories) >= 4
    assert "Audio" in categories
    assert "Computing" in categories
    assert "Home Office" in categories
    assert categories == sorted(categories)


@pytest.mark.asyncio
async def test_get_product_detail_success(client: AsyncClient) -> None:
    # First get a product ID
    list_resp = await client.get("/api/v1/products?page_size=1")
    product_id = list_resp.json()["data"]["items"][0]["id"]

    response = await client.get(f"/api/v1/products/{product_id}")
    assert response.status_code == 200
    product = response.json()["data"]
    assert product["id"] == product_id
    assert "sources" in product
    assert len(product["sources"]) >= 1

    # Verify source provenance
    for source in product["sources"]:
        assert source["is_demo_data"] is True
        assert source["verified_at"] is None  # explicitly unverified demo data
        assert "source_name" in source


@pytest.mark.asyncio
async def test_get_product_detail_not_found(client: AsyncClient) -> None:
    non_existent_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/v1/products/{non_existent_id}")
    assert response.status_code == 404
    payload = response.json()
    assert payload["data"] is None
    assert len(payload["errors"]) == 1
    assert payload["errors"][0]["code"] == "PRODUCT_NOT_FOUND"

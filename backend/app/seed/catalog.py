"""
Demo product catalog seed script.

Seeds ~20 realistic products across 5 categories with source evidence claims.
Idempotent: skips products that already exist by SKU.
Explicit provenance: all seeded products and sources are marked with
`is_demo_data=True` and `verified_at=None`.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory
from app.models.product import Product, ProductSource

DEMO_PRODUCTS = [
    # ── Category: Audio ──────────────────────────────────────────────────
    {
        "sku": "AUD-SONY-XM5",
        "name": "Sony WH-1000XM5 Noise-Canceling Headphones",
        "description": "Industry-leading noise cancellation with two processors and 8 microphones. Up to 30-hour battery life with quick charging.",
        "category": "Audio",
        "brand": "Sony",
        "price_minor": 39999,
        "stock_qty": 25,
        "image_url": "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600",
        "rating": Decimal("4.8"),
        "metadata_json": {
            "color": "Silver",
            "connectivity": "Bluetooth 5.2",
            "battery_hours": 30,
            "weight_grams": 250,
        },
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Sony Official",
                "source_url": "https://demo.paypilot.ai/sources/sony-xm5",
                "price_minor": 39999,
            },
            {
                "source_type": "retailer",
                "source_name": "TechMart Demo",
                "source_url": "https://demo.paypilot.ai/sources/techmart-sony-xm5",
                "price_minor": 37999,
            },
        ],
    },
    {
        "sku": "AUD-BOSE-QC45",
        "name": "Bose QuietComfort 45 Bluetooth Wireless Headphones",
        "description": "Iconic quiet, comfort, and sound. TriPort acoustic architecture offers depth and fullness.",
        "category": "Audio",
        "brand": "Bose",
        "price_minor": 32900,
        "stock_qty": 18,
        "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
        "rating": Decimal("4.6"),
        "metadata_json": {"color": "Triple Black", "battery_hours": 24},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Bose Demo Portal",
                "source_url": "https://demo.paypilot.ai/sources/bose-qc45",
                "price_minor": 32900,
            }
        ],
    },
    {
        "sku": "AUD-APL-APP2",
        "name": "Apple AirPods Pro (2nd Generation)",
        "description": "Active Noise Cancellation up to 2x more than previous generation. Transparency mode and Personalized Spatial Audio.",
        "category": "Audio",
        "brand": "Apple",
        "price_minor": 24900,
        "stock_qty": 40,
        "image_url": "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600",
        "rating": Decimal("4.7"),
        "metadata_json": {"chip": "H2", "charging_case": "USB-C", "sweat_resistant": True},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Apple Demo Catalog",
                "source_url": "https://demo.paypilot.ai/sources/apple-app2",
                "price_minor": 24900,
            }
        ],
    },
    {
        "sku": "AUD-SONOS-MOVE2",
        "name": "Sonos Move 2 Portable Smart Speaker",
        "description": "Upgraded stereo sound with up to 24 hours of playback. Weatherproof design with Wi-Fi and Bluetooth.",
        "category": "Audio",
        "brand": "Sonos",
        "price_minor": 44900,
        "stock_qty": 12,
        "image_url": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600",
        "rating": Decimal("4.5"),
        "metadata_json": {"water_resistance": "IP56", "battery_hours": 24},
        "sources": [
            {
                "source_type": "retailer",
                "source_name": "AudioStore Demo",
                "source_url": None,
                "price_minor": 44900,
            }
        ],
    },
    # ── Category: Wearables ──────────────────────────────────────────────
    {
        "sku": "WEAR-APL-W9",
        "name": "Apple Watch Series 9 GPS 45mm",
        "description": "S9 SiP enables a super-bright display and a magical double tap gesture to interact without touching the screen.",
        "category": "Wearables",
        "brand": "Apple",
        "price_minor": 42900,
        "stock_qty": 30,
        "image_url": "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600",
        "rating": Decimal("4.8"),
        "metadata_json": {"case_size": "45mm", "connectivity": "GPS"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Apple Demo",
                "source_url": "https://demo.paypilot.ai/sources/apple-watch-s9",
                "price_minor": 42900,
            }
        ],
    },
    {
        "sku": "WEAR-GAR-EPIX2",
        "name": "Garmin Epix Pro (Gen 2) Sapphire Edition",
        "description": "High-performance smartwatch featuring stunning AMOLED display, built-in flashlight, and advanced training metrics.",
        "category": "Wearables",
        "brand": "Garmin",
        "price_minor": 89999,
        "stock_qty": 8,
        "image_url": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600",
        "rating": Decimal("4.9"),
        "metadata_json": {"lens": "Sapphire Crystal", "battery_days": 16},
        "sources": [
            {
                "source_type": "retailer",
                "source_name": "OutdoorGear Demo",
                "source_url": "https://demo.paypilot.ai/sources/garmin-epix",
                "price_minor": 89999,
            }
        ],
    },
    {
        "sku": "WEAR-SAM-GW6",
        "name": "Samsung Galaxy Watch 6 Classic 47mm",
        "description": "Rotating bezel returns for easy navigation. Advanced sleep coaching and ECG heart monitoring.",
        "category": "Wearables",
        "brand": "Samsung",
        "price_minor": 39999,
        "stock_qty": 20,
        "image_url": "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600",
        "rating": Decimal("4.4"),
        "metadata_json": {"bezel": "Rotating", "connectivity": "Bluetooth/Wi-Fi"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Samsung Demo",
                "source_url": "https://demo.paypilot.ai/sources/galaxy-watch-6",
                "price_minor": 39999,
            }
        ],
    },
    {
        "sku": "WEAR-OURA-GEN3",
        "name": "Oura Ring Gen 3 Heritage Horizon",
        "description": "Discreet, elegant titanium ring that tracks sleep, readiness, and daily activity 24/7.",
        "category": "Wearables",
        "brand": "Oura",
        "price_minor": 29900,
        "stock_qty": 15,
        "image_url": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600",
        "rating": Decimal("4.5"),
        "metadata_json": {"finish": "Stealth Black", "material": "Titanium"},
        "sources": [
            {
                "source_type": "review_site",
                "source_name": "TechReview Demo",
                "source_url": "https://demo.paypilot.ai/sources/oura-gen3-review",
                "price_minor": 29900,
            }
        ],
    },
    # ── Category: Home Office ───────────────────────────────────────────
    {
        "sku": "HO-LOGI-MXM3S",
        "name": "Logitech MX Master 3S Performance Wireless Mouse",
        "description": "Quiet clicks, 8K DPI track-on-glass sensor, and MagSpeed electromagnetic scrolling.",
        "category": "Home Office",
        "brand": "Logitech",
        "price_minor": 9999,
        "stock_qty": 50,
        "image_url": "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600",
        "rating": Decimal("4.9"),
        "metadata_json": {"dpi": 8000, "sensor": "Darkfield", "connectivity": "Logi Bolt / BT"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Logitech Official Demo",
                "source_url": "https://demo.paypilot.ai/sources/logitech-mxm3s",
                "price_minor": 9999,
            }
        ],
    },
    {
        "sku": "HO-LOGI-MXKEYS",
        "name": "Logitech MX Keys S Wireless Illuminated Keyboard",
        "description": "Fluid typing with spherically dished keys. Smart illumination adapts to ambient lighting conditions.",
        "category": "Home Office",
        "brand": "Logitech",
        "price_minor": 10999,
        "stock_qty": 35,
        "image_url": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600",
        "rating": Decimal("4.7"),
        "metadata_json": {"layout": "Full Size", "backlight": "Smart White LED"},
        "sources": [
            {
                "source_type": "retailer",
                "source_name": "OfficeDepot Demo",
                "source_url": "https://demo.paypilot.ai/sources/logitech-mxkeys",
                "price_minor": 10999,
            }
        ],
    },
    {
        "sku": "HO-DELL-U2723QE",
        "name": "Dell UltraSharp 27 4K USB-C Hub Monitor (U2723QE)",
        "description": "Brilliant color and contrast with IPS Black technology. 90W power delivery via single USB-C cable.",
        "category": "Home Office",
        "brand": "Dell",
        "price_minor": 57999,
        "stock_qty": 14,
        "image_url": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600",
        "rating": Decimal("4.8"),
        "metadata_json": {"resolution": "3840x2160", "panel": "IPS Black", "refresh_rate": "60Hz"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Dell Demo Catalog",
                "source_url": "https://demo.paypilot.ai/sources/dell-u2723qe",
                "price_minor": 57999,
            }
        ],
    },
    {
        "sku": "HO-HM-AERON",
        "name": "Herman Miller Aeron Ergonomic Office Chair",
        "description": "The benchmark for ergonomic seating. Pellicle suspension distributes weight evenly to eliminate pressure points.",
        "category": "Home Office",
        "brand": "Herman Miller",
        "price_minor": 169500,
        "stock_qty": 6,
        "image_url": "https://images.unsplash.com/photo-1580481077195-731da89f3044?w=600",
        "rating": Decimal("4.9"),
        "metadata_json": {"size": "B (Medium)", "lumbar_support": "PostureFit SL"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Herman Miller Demo",
                "source_url": "https://demo.paypilot.ai/sources/herman-miller-aeron",
                "price_minor": 169500,
            }
        ],
    },
    # ── Category: Computing ─────────────────────────────────────────────
    {
        "sku": "COMP-APL-MBP14",
        "name": "Apple MacBook Pro 14-inch M3 Pro (18GB, 512GB SSD)",
        "description": "Blazing fast M3 Pro chip with Liquid Retina XDR display, up to 18 hours of battery life, and pro ports.",
        "category": "Computing",
        "brand": "Apple",
        "price_minor": 199900,
        "stock_qty": 10,
        "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600",
        "rating": Decimal("4.9"),
        "metadata_json": {"cpu": "M3 Pro", "ram_gb": 18, "ssd_gb": 512, "screen": "14.2 inch XDR"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Apple Demo",
                "source_url": "https://demo.paypilot.ai/sources/apple-mbp-14",
                "price_minor": 199900,
            }
        ],
    },
    {
        "sku": "COMP-DELL-XPS13",
        "name": "Dell XPS 13 Plus Laptop (Intel Core i7, 16GB, 1TB SSD)",
        "description": "Futuristic minimalist design with zero-lattice keyboard, capacitive touch function row, and seamless glass touchpad.",
        "category": "Computing",
        "brand": "Dell",
        "price_minor": 149999,
        "stock_qty": 12,
        "image_url": "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600",
        "rating": Decimal("4.3"),
        "metadata_json": {"cpu": "Intel Core i7-1360P", "ram_gb": 16, "weight_kg": 1.24},
        "sources": [
            {
                "source_type": "retailer",
                "source_name": "PCWorld Demo",
                "source_url": "https://demo.paypilot.ai/sources/dell-xps-13",
                "price_minor": 149999,
            }
        ],
    },
    {
        "sku": "COMP-LEN-X1C",
        "name": "Lenovo ThinkPad X1 Carbon Gen 11 (32GB, 1TB SSD)",
        "description": "Ultralight enterprise workhorse engineered on Intel Evo platform with MIL-SPEC durability.",
        "category": "Computing",
        "brand": "Lenovo",
        "price_minor": 174900,
        "stock_qty": 9,
        "image_url": "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600",
        "rating": Decimal("4.7"),
        "metadata_json": {"chassis": "Carbon Fiber", "security": "dTPM 2.0 / Fingerprint"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Lenovo Demo Portal",
                "source_url": "https://demo.paypilot.ai/sources/thinkpad-x1c",
                "price_minor": 174900,
            }
        ],
    },
    # ── Category: Photography ───────────────────────────────────────────
    {
        "sku": "PHOTO-SONY-A7IV",
        "name": "Sony Alpha 7 IV Full-Frame Mirrorless Camera (Body Only)",
        "description": "33MP Exmor R CMOS sensor, 4K 60p recording, and real-time eye autofocus for humans, animals, and birds.",
        "category": "Photography",
        "brand": "Sony",
        "price_minor": 249800,
        "stock_qty": 7,
        "image_url": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600",
        "rating": Decimal("4.8"),
        "metadata_json": {"sensor_mp": 33, "mount": "Sony E-mount", "video": "4K 60p 10-bit 4:2:2"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Sony Imaging Demo",
                "source_url": "https://demo.paypilot.ai/sources/sony-a7iv",
                "price_minor": 249800,
            }
        ],
    },
    {
        "sku": "PHOTO-FUJI-XT5",
        "name": "Fujifilm X-T5 Mirrorless Digital Camera with 18-55mm Lens",
        "description": "Classic dial-based design with 40.2MP X-Trans CMOS 5 HR sensor and 7 stops of in-body image stabilization.",
        "category": "Photography",
        "brand": "Fujifilm",
        "price_minor": 209900,
        "stock_qty": 11,
        "image_url": "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600",
        "rating": Decimal("4.8"),
        "metadata_json": {"sensor_mp": 40.2, "stabilization": "7-stop IBIS", "film_simulations": 19},
        "sources": [
            {
                "source_type": "retailer",
                "source_name": "CameraDepot Demo",
                "source_url": "https://demo.paypilot.ai/sources/fuji-xt5",
                "price_minor": 209900,
            }
        ],
    },
    {
        "sku": "PHOTO-DJI-MINI4",
        "name": "DJI Mini 4 Pro Drone with RC 2 Controller",
        "description": "Sub-249g ultra-light camera drone with omnidirectional obstacle sensing and 4K/60fps HDR true vertical shooting.",
        "category": "Photography",
        "brand": "DJI",
        "price_minor": 95900,
        "stock_qty": 22,
        "image_url": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=600",
        "rating": Decimal("4.7"),
        "metadata_json": {"weight_grams": 249, "flight_time_min": 34, "transmission_km": 20},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "DJI Official Demo",
                "source_url": "https://demo.paypilot.ai/sources/dji-mini-4",
                "price_minor": 95900,
            }
        ],
    },
    # ── Category: Gaming ────────────────────────────────────────────────
    {
        "sku": "GAME-VALVE-SD",
        "name": "Valve Steam Deck OLED 512GB Handheld Gaming Console",
        "description": "Brilliant 7.4-inch 90Hz HDR OLED screen with longer battery life, faster Wi-Fi 6E, and full Steam library compatibility.",
        "category": "Gaming",
        "brand": "Valve",
        "price_minor": 54900,
        "stock_qty": 25,
        "image_url": "https://images.unsplash.com/photo-1612287233207-61c02e1b4b9b?w=600",
        "rating": Decimal("4.9"),
        "metadata_json": {"display": "7.4 inch 90Hz OLED", "storage_gb": 512, "os": "SteamOS"},
        "sources": [
            {
                "source_type": "manufacturer",
                "source_name": "Valve Store Demo",
                "source_url": "https://demo.paypilot.ai/sources/steam-deck-oled",
                "price_minor": 54900,
            }
        ],
    },
    {
        "sku": "GAME-SONY-PS5S",
        "name": "Sony PlayStation 5 Slim Digital Edition",
        "description": "Slim design with 1TB SSD storage, ultra-high speed I/O, ray tracing, and 3D Audio immersion.",
        "category": "Gaming",
        "brand": "Sony",
        "price_minor": 44999,
        "stock_qty": 16,
        "image_url": "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600",
        "rating": Decimal("4.8"),
        "metadata_json": {"edition": "Digital", "storage_tb": 1, "output": "Up to 120fps @ 4K"},
        "sources": [
            {
                "source_type": "retailer",
                "source_name": "GameZone Demo",
                "source_url": "https://demo.paypilot.ai/sources/ps5-slim",
                "price_minor": 44999,
            }
        ],
    },
]


async def seed_catalog(session: AsyncSession) -> int:
    """Populate demo products and sources idempotently.

    Returns:
        Number of new products inserted.
    """
    settings = get_settings()
    currency = settings.default_currency
    inserted_count = 0

    for item in DEMO_PRODUCTS:
        stmt = select(Product).where(Product.sku == item["sku"])
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            continue

        product = Product(
            sku=item["sku"],
            name=item["name"],
            description=item.get("description"),
            category=item["category"],
            brand=item.get("brand"),
            price_minor=item["price_minor"],
            currency=currency,
            stock_qty=item["stock_qty"],
            image_url=item.get("image_url"),
            rating=item.get("rating"),
            is_active=True,
            is_demo_data=True,
            metadata_json=item.get("metadata_json"),
        )
        session.add(product)
        await session.flush()  # populate product.id for sources

        for src in item.get("sources", []):
            source = ProductSource(
                product_id=product.id,
                source_type=src["source_type"],
                source_name=src["source_name"],
                source_url=src.get("source_url"),
                price_minor=src.get("price_minor"),
                currency=currency,
                is_demo_data=True,
                verified_at=None,
            )
            session.add(source)

        inserted_count += 1

    await session.commit()
    return inserted_count


async def main() -> None:
    print("Seeding demo catalog...")
    async with async_session_factory() as session:
        count = await seed_catalog(session)
        print(f"Catalog seeding complete. {count} new products seeded.")


if __name__ == "__main__":
    asyncio.run(main())

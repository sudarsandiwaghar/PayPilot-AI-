"""
Live End-to-End Shopper Journey Integration Check.

Exercises against the running backend server:
1. create session (POST /api/v1/sessions)
2. session recovery (GET /api/v1/sessions/{session_id})
3. browse catalog (GET /api/v1/products?in_stock=true)
4. get AI recommendation (POST /api/v1/sessions/{session_id}/agent/recommend)
5. add to cart (POST /api/v1/sessions/{session_id}/cart/items)
6. checkout preview (POST /api/v1/sessions/{session_id}/checkout/preview)
7. checkout confirm (POST /api/v1/sessions/{session_id}/checkout/confirm)
8. view order details (GET /api/v1/orders/{order_id})
"""

import json
import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:8000"


def http_request(path: str, method: str = "GET", data: dict = None, token: str = None) -> dict:
    url = f"{BASE_URL}{path}"
    headers = {
        "Content-Type": "application/json",
        "X-Request-ID": "test-e2e-shopper",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content)
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        print(f"HTTP Error {e.code} on {method} {path}: {err_content}")
        raise


def run_e2e_check():
    print("=" * 60)
    print("Starting PayPilot E2E Shopper Journey Integration Check")
    print(f"Target: {BASE_URL}")
    print("=" * 60)

    # 1. Health check
    print("\n[Step 0] Verifying Backend Health...")
    health = http_request("/api/v1/health")
    assert health["status"] == "ok", f"Health check failed: {health}"
    print(f"  -> Health OK: version={health.get('version')}")

    # 2. Create shopping session
    print("\n[Step 1] Creating Anonymous Shopping Session...")
    session_res = http_request("/api/v1/sessions", method="POST", data={"metadata_json": {"client": "e2e-tester"}})
    session_data = session_res["data"]
    session_id = session_data["session_id"]
    access_token = session_data["access_token"]
    assert session_id and access_token, "Missing session_id or access_token"
    print(f"  -> Session created: id={session_id}")
    print(f"  -> Bearer token issued: {access_token[:10]}... (retained in-memory)")

    # 3. Session recovery check (tab refresh simulation)
    print("\n[Step 2] Testing Session Recovery (Tab Refresh Simulation)...")
    recovered = http_request(f"/api/v1/sessions/{session_id}", method="GET", token=access_token)
    assert recovered["data"]["status"] == "active"
    print(f"  -> Session recovered successfully: status={recovered['data']['status']}")

    # 4. Browse products catalog
    print("\n[Step 3] Browsing Product Catalog (In-Stock Products)...")
    catalog_res = http_request("/api/v1/products?in_stock=true&category=Audio&page_size=5")
    products = catalog_res["data"]["items"]
    assert len(products) > 0, "No products found in seeded catalog"
    print(f"  -> Retrieved {len(products)} audio products (total in DB: {catalog_res['data']['total']})")
    first_product = products[0]
    print(f"  -> Selected product for test: '{first_product['name']}' (price: {first_product['price_minor']} minor units {first_product['currency']})")

    # 5. Protected AI Shopping Agent decision layer query
    print("\n[Step 4] Querying Protected AI Shopping Agent Decision Layer...")
    agent_query = {
        "query": "High-fidelity noise canceling headphones for travel under $400",
        "category": "Audio",
        "budget_minor": 40000,
        "currency": "USD"
    }
    agent_res = http_request(
        f"/api/v1/sessions/{session_id}/agent/recommend",
        method="POST",
        data=agent_query,
        token=access_token
    )
    agent_data = agent_res["data"]
    recs = agent_data["recommendations"]
    print(f"  -> Extracted intent type: {agent_data['intent']['intent_type']}")
    print(f"  -> Detected constraints: category={agent_data['intent']['constraints']['category']}, budget={agent_data['intent']['constraints']['budget_minor']}")
    print(f"  -> Recommendations count: {len(recs)}")
    assert len(recs) > 0, "Agent returned 0 recommendations"
    top_rec = recs[0]
    print(f"  -> Top recommendation: '{top_rec['name']}' (Match Score: {top_rec['match_score']}, Evidence claims: {len(top_rec['source_evidence'])})")

    # 6. Add selected product to cart
    print(f"\n[Step 5] Adding Product '{top_rec['name']}' to Cart...")
    cart_res = http_request(
        f"/api/v1/sessions/{session_id}/cart/items",
        method="POST",
        data={"product_id": top_rec["product_id"], "quantity": 1},
        token=access_token
    )
    cart_data = cart_res["data"]
    assert len(cart_data["items"]) == 1, "Cart item count mismatch"
    assert cart_data["items"][0]["product_id"] == top_rec["product_id"]
    print(f"  -> Cart updated: v{cart_data['version']}, item_count={cart_data['item_count']}")
    print(f"  -> Authoritative server subtotal: {cart_data['subtotal_minor']} {cart_data['currency']}")

    # 7. Request Checkout Preview (HMAC token binding)
    print("\n[Step 6] Requesting Checkout Preview & HMAC Token Binding...")
    preview_res = http_request(
        f"/api/v1/sessions/{session_id}/checkout/preview",
        method="POST",
        token=access_token
    )
    preview_data = preview_res["data"]
    preview_token = preview_data["preview_token"]
    assert preview_token, "Missing HMAC preview_token"
    assert len(preview_data["order_summary"]) == 1
    print(f"  -> Preview Token generated: {preview_token[:16]}...{preview_token[-10:]}")
    print(f"  -> Server-calculated total: {preview_data['total_minor']} {preview_data['currency']} (subtotal={preview_data['subtotal_minor']}, tax={preview_data['tax_minor']})")
    print(f"  -> Stock warnings: {len(preview_data['stock_warnings'])}, Price changes: {len(preview_data['price_changes'])}")

    # 8. Confirm Checkout (Explicit Shopper Confirmation)
    print("\n[Step 7] Confirming Checkout with Bound Preview Token...")
    confirm_res = http_request(
        f"/api/v1/sessions/{session_id}/checkout/confirm",
        method="POST",
        data={"preview_token": preview_token},
        token=access_token
    )
    order_data = confirm_res["data"]
    order_id = order_data["id"]
    order_number = order_data["order_number"]
    assert order_id and order_number, "Missing order id or order_number"
    assert order_data["status"] == "pending_payment"
    assert order_data["confirmed_by_shopper"] is True
    print(f"  -> Order placed: #{order_number} (id: {order_id})")
    print(f"  -> Order status: {order_data['status']}")
    print(f"  -> Confirmed by shopper: {order_data['confirmed_by_shopper']}")
    print(f"  -> Stock reserved until: {order_data['stock_reserved_until']}")

    # 9. View Order Details
    print(f"\n[Step 8] Viewing Order Details for #{order_number}...")
    order_detail_res = http_request(
        f"/api/v1/orders/{order_id}",
        method="GET",
        token=access_token
    )
    detail_data = order_detail_res["data"]
    assert detail_data["id"] == order_id
    assert detail_data["total_minor"] == preview_data["total_minor"]
    assert len(detail_data["items"]) == 1
    item = detail_data["items"][0]
    print(f"  -> Verified order detail: total={detail_data['total_minor']} {detail_data['currency']}")
    print(f"  -> Line item: '{item['product_name']}' qty={item['quantity']} unit_price={item['unit_price_minor']}")

    # 10. Create Payment Attempt (Idempotent, Bearer Protected)
    print(f"\n[Step 9] Creating Payment Attempt for Order #{order_number}...")
    pay_res = http_request(
        f"/api/v1/orders/{order_id}/payments",
        method="POST",
        token=access_token
    )
    pay_data = pay_res["data"]
    attempt_id = pay_data["attempt_id"]
    approval_url = pay_data["approval_url"]
    assert attempt_id, "Missing attempt_id"
    assert approval_url, "Missing approval_url"
    print(f"  -> Payment attempt created: id={attempt_id}, number={pay_data['attempt_number']}")
    print(f"  -> Approval URL: {approval_url[:40]}...")
    print(f"  -> PayPal Order ID: {pay_data['paypal_order_id']}")

    # 11. Backend Capture Verification Gate (Never display success on redirect)
    print("\n[Step 10] Calling Backend Capture Verification Endpoint...")
    cap_res = http_request(
        f"/api/v1/orders/{order_id}/payments/{attempt_id}/capture",
        method="POST",
        token=access_token
    )
    cap_data = cap_res["data"]
    assert cap_data["status"] == "captured"
    assert cap_data["captured_at"] is not None
    print(f"  -> Capture verified by backend: status={cap_data['status']}, captured_at={cap_data['captured_at']}")

    # 12. Re-verify Order Status is now PAID
    print("\n[Step 11] Verifying Final Order Transition to 'paid'...")
    final_order = http_request(
        f"/api/v1/orders/{order_id}",
        method="GET",
        token=access_token
    )
    assert final_order["data"]["status"] == "paid"
    print(f"  -> Order #{order_number} verified PAID in backend database!")

    print("\n" + "=" * 60)
    print("ALL 11 ENDPOINTS & ACTIONS IN FULL SHOPPER FLOW VERIFIED!")
    print("=" * 60)


if __name__ == "__main__":
    run_e2e_check()

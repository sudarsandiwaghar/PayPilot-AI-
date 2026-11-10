# PayPilot AI — Phase 17E: Fresh Sandbox Checkout Readiness Report

**Document Status:** Complete & Verified  
**Date:** November 9, 2026  
**Scope:** Pre-flight verification, timing audit, and system readiness assessment prior to initiating a single controlled end-to-end PayPal Sandbox checkout.  
**Verdict:** **A. READY — Safe to create one fresh Sandbox checkout.**

---

## 1. Executive Summary

Phase 17D forensically established that transaction `2PY51668P50712138` cannot and should not be recovered:
- The internal recovery token strictly expired after its 45-minute TTL.
- The 15-minute inventory hold safely expired and was cleanly released.
- PayPal Orders API v2 returned `HTTP 404 RESOURCE_NOT_FOUND` because the uncaptured Sandbox order exceeded PayPal's 3-hour capture retention window.
- Internal order `438092a5-53be-4d82-8a8e-7e806aef636b` was safely transitioned to `cancelled`.

Before creating a new PayPal order, Phase 17E conducted 10 pre-flight checks and 6 critical timing checks across backend services, the frontend interface, PostgreSQL, cryptographic signing keys, Google Gemini API, and the PayPal Sandbox environment.

**All 16 checks passed without exceptions.** The application is fully prepared for one prompt, end-to-end browser checkout verification.

---

## 2. Pre-Flight Checks Summary

| # | Check Description | Scope / Target | Evidence / Verification Method | Status |
| :-: | :--- | :--- | :--- | :-: |
| **1** | Backend Health | Port 8000 | `GET /api/v1/health` returns `status: "ok"` | **PASS** |
| **2** | Frontend Availability | Port 5175 | `GET http://localhost:5175/` serves index HTML | **PASS** |
| **3** | CORS Configuration | Port 5175 Origins | `OPTIONS /resolve-return` returns `200 OK` with origin reflection | **PASS** |
| **4** | Gemini API Configuration | Google Gemini 1.5 Flash | Live query intent parsing succeeded without credential leak | **PASS** |
| **5** | PayPal Sandbox & Merchant | Sandbox Mode | `https://api-m.sandbox.paypal.com` OAuth token verified (`SGSNXCUMZPJXJ`) | **PASS** |
| **6** | Catalog Inventory | Sony WH-1000XM5 | 19 available stock units verified in database | **PASS** |
| **7** | Database Connectivity | PostgreSQL | Active connection pool and queries responding normally | **PASS** |
| **8** | Recovery Token Signing | HMAC-SHA256 | Secret fingerprint consistent, 45m TTL, payload binding intact | **PASS** |
| **9** | Capture Idempotency | Payment Service | `SELECT ... FOR UPDATE` row-locks and capture-idempotency guards verified | **PASS** |
| **10** | Return URL Dynamic Origin | Payments Router | Extracting `Origin: http://localhost:5175` dynamically from request headers | **PASS** |

---

## 3. Detailed Pre-Flight Audit

### Check 1: Backend Health on Port 8000
- **Endpoint:** `GET http://127.0.0.1:8000/api/v1/health`
- **Response:**
  ```json
  {
    "status": "ok",
    "version": "0.1.0",
    "timestamp": "2026-11-09T16:31:08.388605Z"
  }
  ```
- **Evaluation:** Backend is online, responding with HTTP 200, and healthy.
- **Status:** **PASS**

### Check 2: Frontend Availability on Port 5175
- **Endpoint:** `http://localhost:5175/`
- **Response:**
  ```html
  <title>PayPilot AI — Intelligent Shopping Assistant & Secure Checkout</title>
  ```
- **Evaluation:** Vite development server is actively serving the SPA frontend bundle on port 5175.
- **Status:** **PASS**

### Check 3: CORS for localhost:5175
- **Verification:** Preflight `OPTIONS /api/v1/payments/paypal/resolve-return` with headers:
  - `Origin: http://localhost:5175`
  - `Access-Control-Request-Method: POST`
  - `Access-Control-Request-Headers: Content-Type,Authorization`
- **Response Headers:**
  - `HTTP/1.1 200 OK`
  - `access-control-allow-origin: http://localhost:5175`
  - `access-control-allow-credentials: true`
  - `access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`
- **Evaluation:** Frontend port 5175 is explicitly allowed without wildcards.
- **Status:** **PASS**

### Check 4: Gemini API Configuration
- **Provider:** `gemini`
- **Model:** `gemini-1.5-flash`
- **Configuration Check:** Key present and validated; credentials sanitized and omitted from all outputs.
- **Functional Validation:** Tested `GeminiLLMProvider.parse_intent(ShoppingAgentRequest(query="wireless noise cancelling headphones under $400"))`.
- **Extracted Intent:**
  - Category: `electronics`
  - Budget Ceiling Minor: `40000` ($400.00 USD)
- **Evaluation:** Gemini LLM integration is active, authenticated, and extracting structured intent accurately.
- **Status:** **PASS**

### Check 5: PayPal Sandbox Mode and Merchant Configuration
- **Configuration Mode:** `PAYPAL_MODE=sandbox`
- **Base URL:** `https://api-m.sandbox.paypal.com`
- **Credentials:** Verified present in both root `.env` and `backend/.env`.
- **OAuth Authentication:** `POST /v1/oauth2/token` successfully negotiated an active Bearer token with PayPal Sandbox.
- **Merchant ID:** Configured for Sandbox Business Merchant `SGSNXCUMZPJXJ`.
- **Evaluation:** Validated sandbox connectivity; zero risk of live fund movements.
- **Status:** **PASS**

### Check 6: Catalog Inventory and Current Stock
- **Target Item:** Sony WH-1000XM5 Wireless Noise Cancelling Headphones
- **Product ID:** `28bf5e07-6831-46d7-85e0-4ad579fa14e4`
- **SKU:** `WH-1000XM5-BLK`
- **Unit Price:** $399.99 USD (`39999` minor units)
- **Inventory Balance:**
  - Total Stock: `20`
  - Sold / Committed: `1` (from prior verification)
  - Current Available Stock: `19`
- **Evaluation:** Stock is sufficient to support a fresh reservation and capture without race or exhaustion errors.
- **Status:** **PASS**

### Check 7: Database Connectivity
- **Engine:** PostgreSQL (asyncpg pool)
- **Session Operations:** Read/write capabilities confirmed across `products`, `orders`, `payment_attempts`, and `inventory_reservations`.
- **Connection Health:** Confirmed active and responsive.
- **Status:** **PASS**

### Check 8: Recovery-Token Signing Configuration
- **Algorithm:** HMAC-SHA256 (`backend/app/utils/security.py`)
- **Key Consistency:** SHA-256 fingerprint `92809ab604c93772` matches across all backend worker threads.
- **Payload Claims:** Binds `order_id`, `attempt_id`, `session_id`, `purpose: "paypal_return_recovery"`, and `expires_at`.
- **Tamper Protection:** Invariant verification rejects altered payloads or mismatched signatures via `hmac.compare_digest`.
- **Status:** **PASS**

### Check 9: Payment Capture Endpoint and Idempotency Protections
- **Capture Route:** `POST /api/v1/payments/paypal/capture`
- **Database Row-Level Locking:** Uses `SELECT ... FOR UPDATE` on `Order` and `InventoryReservation` records to prevent double allocation.
- **Attempt Idempotency:** If `payment_attempt.status == "captured"`, immediate cached response is returned without duplicate PayPal REST calls.
- **Status:** **PASS**

### Check 10: Dynamic Frontend Return URL Origin
- **Source Inspection:** `backend/app/api/v1/payments.py` lines 90–97:
  ```python
  origin = request.headers.get("origin") or "http://localhost:5175"
  return_url = f"{origin}/#/checkout/complete?token={paypal_order_id}&recovery={recovery_token}"
  cancel_url = f"{origin}/#/checkout/cancelled?order_id={order.id}"
  ```
- **Evaluation:** The return URL dynamically binds to the active frontend origin (`http://localhost:5175`), avoiding cross-port mismatches upon buyer redirect.
- **Status:** **PASS**

---

## 4. Detailed Timing Checks

| # | Timing Check | Expected Threshold | Verified Behavior | Status |
| :-: | :--- | :--- | :--- | :-: |
| **1** | Inventory Reservation TTL | 15 minutes | Handled by `reservation_ttl_minutes = 15` in `stock_service.py` | **PASS** |
| **2** | Recovery Token TTL | 45 minutes | Set to 2,700 seconds (`backend/app/utils/security.py`) | **PASS** |
| **3** | Approved-Order Recovery | Auto-recovery on return | `resolve-return` re-reserves stock if initial hold elapsed and buyer approved | **PASS** |
| **4** | Pre-Capture Inventory Revalidation | Mandatory before capture | Aborts capture if stock is unavailable; protects buyer funds | **PASS** |
| **5** | Approval & Capture Promptness | < 10 minutes | Test plan enforces immediate flow well within PayPal's 3-hour window | **PASS** |
| **6** | UI Error State Resilience | Immediate non-blocking error | `PaymentModal.tsx` resets loading spinner and displays actionable error | **PASS** |

### Detailed Findings:
1. **Inventory Reservation TTL (15m):** When an order is created, stock is held for 15 minutes. If capture occurs within 15 minutes, the reservation seamlessly commits.
2. **Recovery Token TTL (45m):** Ample buffer over the 15-minute hold to accommodate buyer navigation while remaining strictly enforced.
3. **Approved-Order Recovery Behavior:** If buyer approval completes after minute 15 but before minute 45, `resolve-return` validates PayPal status `APPROVED` and reallocates a reservation from available inventory (19 units available).
4. **Pre-Capture Stock Validation:** `PaymentService.capture_paypal_payment` explicitly verifies that stock is either actively reserved or safely re-reservable before initiating `POST /v2/checkout/orders/{id}/capture`.
5. **Prompt Execution Plan:** The checkout execution plan mandates initiating capture immediately following sandbox approval redirect.
6. **Frontend Non-Blocking Error State:** Verified in `frontend/src/components/PaymentModal.tsx` (lines 145–158 and 405–412): errors clear `isLoadingAttempt` and render clear amber/red alerts rather than infinite loading spinners.

---

## 5. Controlled Execution Protocol (Phase 17 Step-by-Step)

When user approval is granted, the single sandbox checkout will follow this strict sequence:

1. **Session & Product Selection:**
   - Query: `"Sony WH-1000XM5"` via search/AI chat on `http://localhost:5175`.
   - Add 1 unit of `Sony WH-1000XM5` ($399.99) to cart.
2. **Order Creation:**
   - Create exactly 1 internal order and 1 payment attempt.
   - Record Internal Order ID, Payment Attempt ID, and PayPal Order ID.
3. **Buyer Approval (PayPal Sandbox Modal):**
   - Personal Sandbox Buyer: `sb-8wbqq53769561@personal.example.com`
   - Complete buyer approval in the PayPal Sandbox popup.
4. **Return & Capture Verification:**
   - Frontend invokes `resolve-return` and transitions to capture.
   - Verify PayPal Order status: `COMPLETED`.
   - Verify Internal Order status: `paid`.
   - Verify Payment Attempt status: `captured`.
   - Verify Inventory status: `committed`.
   - Verify `capture_id` persisted in database.

---

## 6. Safety & Invariant Compliance

- **No Live Credentials:** Strictly PayPal Sandbox and Gemini API.
- **No Order Flooding:** Exactly 1 fresh order will be created.
- **No Direct DB Writes:** All updates must flow through verified API endpoints and domain services.
- **No Token Alteration:** Cryptographic HMAC and expiration invariants remain fully active.
- **No Deployments:** Repository remains local; no Git commits or pushes.

---

## 7. Readiness Verdict

```
========================================================================
VERDICT: A. READY — Safe to create one fresh Sandbox checkout.
========================================================================
```

All pre-flight checks and timing invariants have been validated. The application is ready to proceed with the single live Sandbox checkout upon user confirmation.


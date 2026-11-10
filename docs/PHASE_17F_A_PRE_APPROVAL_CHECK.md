# PayPilot AI — Phase 17F-A: Pre-Approval Order & Inventory Audit

**Document Status:** Complete & Verified  
**Date:** November 10, 2026  
**Scope:** Read-only inspection of internal order, payment attempt, stock reservation, catalog inventory, and PayPal Sandbox order status prior to buyer approval.  
**Verdict:** **B. NOT SAFE — reservation expired or another invariant failed.**

---

## 1. Executive Summary

A read-only forensic inspection was conducted on transaction `55a0f6d8-5249-467f-b09d-9c6c140b6be2` before opening or approving the PayPal Sandbox checkout.

### Audit Findings:
1. **Timestamp Audit:**
   - Current UTC Timestamp: `2026-11-10T02:38:41.157849+00:00`
   - Order Creation Time: `2026-11-10T02:04:02.613889+00:00`
   - Initial Reservation Expiry: `2026-11-10T02:19:02.716381+00:00`
   - **Elapsed Post-Expiry:** ~19.6 minutes (1,178.4 seconds past deadline).
2. **Stock Reservation State:** Marked **`released`**. The periodic background stock sweep worker automatically reclaimed the expired hold.
3. **Internal Order State:** Transitioned from `payment_processing` to **`cancelled`** by the stock sweep worker upon reservation release.
4. **Payment Attempt State:** Status is **`created`**. No capture ID exists; no capture has occurred.
5. **Catalog Inventory:** 19 units of Sony WH-1000XM5 (`AUD-SONY-XM5`) remain available in stock at $399.99 USD.
6. **PayPal Sandbox Orders API v2:** Order `5MJ46009RH7807830` is **`CREATED`** (unapproved, uncaptured), amount `$399.99 USD`, intent `CAPTURE`, merchant `SGSNXCUMZPJXJ`.
7. **No Capture Verified:** Confirmed via both internal database and PayPal REST API.

---

## 2. Invariant Verification Matrix

| # | Inspection Item | Authoritative Value / State | Invariant Condition | Status |
| :-: | :--- | :--- | :--- | :-: |
| **1** | Current UTC Time | `2026-11-10T02:38:41.157849+00:00` | System time retrieved | **PASS** |
| **2** | Internal Order Status | `cancelled` | Active `pending`/`payment_processing` | **FAIL** |
| **3** | Payment Attempt Status | `created` (no capture) | Uncaptured pending attempt | **PASS** |
| **4** | Stock Reservation Status | `released` (Expired: `02:19:02 UTC`) | Active `held` reservation | **FAIL** |
| **5** | Available Catalog Stock | 19 units available ($399.99 USD) | Stock available for reservation | **PASS** |
| **6** | PayPal Sandbox Order Status | `CREATED` (`5MJ46009RH7807830`) | Valid `CREATED` order in PayPal | **PASS** |
| **7** | No Capture Invariant | 0 captures, `capture_id: None` | Zero funds captured | **PASS** |

---

## 3. Detailed Forensic Inspection

### A. Database Records
- **Order ID:** `55a0f6d8-5249-467f-b09d-9c6c140b6be2`
  - Created: `2026-11-10T02:04:02.613889+00:00`
  - Status: `cancelled`
  - Reason: 15-minute stock hold elapsed without buyer return.
- **Payment Attempt ID:** `e0487cc2-a0f9-48e1-9383-c87c6bd26e86`
  - Status: `created`
  - PayPal Order ID: `5MJ46009RH7807830`
  - PayPal Capture ID: `None`
- **Stock Reservation:**
  - Status: `released`
  - Quantity: 1 unit
  - Target SKU: `AUD-SONY-XM5`
  - Expiry: `2026-11-10T02:19:02.716381+00:00`

### B. Authoritative PayPal Sandbox REST API
- **Endpoint:** `GET https://api-m.sandbox.paypal.com/v2/checkout/orders/5MJ46009RH7807830`
- **HTTP Status:** `200 OK`
- **Order Status:** `CREATED`
- **Intent:** `CAPTURE`
- **Amount:** `399.99 USD`
- **Merchant ID:** `SGSNXCUMZPJXJ`
- **Captures List:** Empty (`[]`)

---

## 4. Reusability vs. Abandonment Assessment

### Option 1: Reuse via Domain Re-Reservation Workflow
- **Mechanism:** In `backend/app/services/payment_service.py` (`resolve_paypal_return`), PayPilot AI implements an approved recovery path:
  ```python
  if is_expired and attempt.status != "captured":
      re_reserved = await StockService.re_reserve_stock_for_order(db=db, order_id=order.id)
      if re_reserved:
          order.status = "payment_processing"
  ```
- **Feasibility:** Because 19 units are in stock, `StockService.re_reserve_stock_for_order` will succeed upon return.
- **Critical Timing Constraint:** The HMAC recovery token embedded in the buyer return URL has a 45-minute TTL:
  - Token issued: `2026-11-10T02:04:02.613889+00:00`
  - Token expires: `2026-11-10T02:49:02.613889+00:00`
  - Time remaining: **~10 minutes**.
  - If approval and return take longer than 10 minutes, the token will be rejected (`401 Invalid or expired checkout recovery token`).

### Option 2: Clean Abandonment & Fresh Order Creation (Recommended)
- **Mechanism:** Abandon `55a0f6d8-5249-467f-b09d-9c6c140b6be2` and create one fresh checkout order.
- **Advantages:**
  - Resets the 15-minute reservation timer to a fresh full window.
  - Resets the 45-minute recovery token to a fresh full window.
  - Zero risk of a token-expiration collision during manual sandbox login.
  - Ensures clean end-to-end verification under optimal operational conditions.

---

## 5. Strict Payment Restrictions Compliance

- [x] Read-only checks conducted exclusively.
- [x] No PayPal checkout opened or approved.
- [x] No second order created yet.
- [x] No payment capture attempted.
- [x] No manual modification of database records or stock levels.
- [x] No reservation extended outside authorized domain services.

---

## 6. Final Verdict

```
========================================================================
VERDICT: B. NOT SAFE — reservation expired or another invariant failed.
========================================================================
```

The initial 15-minute inventory reservation expired at `02:19:02 UTC` and was cleanly released to `released`, transitioning the internal order to `cancelled`. It is not safe to approve under an assumed active hold.


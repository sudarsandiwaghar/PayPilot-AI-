# PayPilot AI — Phase 14E: Fresh PayPal Sandbox Checkout Report

**Document:** `docs/PHASE_14E_FRESH_CHECKOUT_REPORT.md`  
**Date:** November 8, 2026  
**Environment:** PayPal Sandbox (`PAYPAL_MODE=sandbox`)  
**Product Selected:** Sony WH-1000XM5 Noise-Canceling Headphones  
**Amount & Currency:** $399.99 USD (39,999 minor units)  

---

## 1. Pre-Flight Verification Results

All pre-flight checks passed before generating the new checkout:

| Check | Result | Evidence / Details |
| :--- | :--- | :--- |
| **Backend Health** | **PASSED** | HTTP 200 OK (`http://127.0.0.1:8000/api/v1/health`), version `0.1.0` |
| **Frontend Health** | **PASSED** | HTTP 200 OK (`http://127.0.0.1:5173/`), Title: *PayPilot AI — Intelligent Shopping Assistant & Secure Checkout* |
| **PayPal Environment** | **PASSED** | Mode: `sandbox`, Currency: `USD`, `is_demo: false` |
| **Merchant Config** | **PASSED** | Merchant ID: `SGSNXCUMZPJXJ`, Email: `sb-brkzq53656154@business.example.com` |
| **Catalog Availability** | **PASSED** | Product `28bf5e07-6831-46d7-85e0-4ad579fa14e4` (Sony WH-1000XM5): Active with 19 available units |
| **Previous Order Expiry** | **PASSED** | Order `c8cb81c4-b2bc-46ef-906b-79109cd6f16c` confirmed `cancelled`; stock reservation `released` |
| **System Active Holds** | **PASSED** | 0 orphan or active held reservations existed prior to fresh run |

---

## 2. Fresh Order Identifiers & Live Parameters

| Parameter | Fresh Value | Verification Source |
| :--- | :--- | :--- |
| **Internal Order ID** | `74b302bc-488f-4c85-a78a-bfe34629a3dc` | PostgreSQL `orders.id` |
| **Payment Attempt ID** | `325a33c7-43dc-4377-9d7a-01d2b0ba41c9` | PostgreSQL `payment_attempts.id` |
| **Attempt Number** | `1` | Fresh first attempt |
| **PayPal Order ID** | `59H813025R965550N` | PayPal Orders API v2 (`id`) |
| **Amount & Currency** | **$399.99 USD** | Verified across Preview HMAC, DB, and PayPal API |
| **Internal Status** | `payment_processing` | PostgreSQL `orders.status` |
| **Payment Attempt Status** | `created` | PostgreSQL `payment_attempts.status` |
| **Stock Reservation Status** | `held` (1x Sony WH-1000XM5) | PostgreSQL `stock_reservations.status` |
| **Reservation Expiry (UTC)** | `2026-11-08T14:03:42Z` | UTC timestamp |
| **Reservation Expiry (IST)** | **07:33:42 PM IST (08-Nov-2026)** | Local Indian Standard Time (+05:30) |

---

## 3. Direct PayPal REST API v2 Verification

Direct query executed to `https://api.sandbox.paypal.com/v2/checkout/orders/59H813025R965550N`:

```json
{
  "id": "59H813025R965550N",
  "status": "CREATED",
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "74b302bc-488f-4c85-a78a-bfe34629a3dc",
      "amount": {
        "currency_code": "USD",
        "value": "399.99"
      },
      "payee": {
        "email_address": "sb-brkzq53656154@business.example.com",
        "merchant_id": "SGSNXCUMZPJXJ"
      }
    }
  ],
  "links": [
    {
      "href": "https://www.sandbox.paypal.com/checkoutnow?token=59H813025R965550N",
      "rel": "approve",
      "method": "GET"
    }
  ]
}
```

- **Status:** Authoritatively verified as `CREATED`.
- **Intent:** Confirmed as `CAPTURE`.
- **Merchant Alignment:** Confirmed matching US Sandbox Business seller (`SGSNXCUMZPJXJ`).
- **Return URL Configuration:** Configured to `http://localhost:5173/#/checkout/complete`.

---

## 4. Buyer Approval URL

👉 **[Approve PayPal Sandbox Order (59H813025R965550N)](https://www.sandbox.paypal.com/checkoutnow?token=59H813025R965550N)**

```text
https://www.sandbox.paypal.com/checkoutnow?token=59H813025R965550N
```

---

## 5. Next Step

Awaiting manual buyer approval confirmation via Incognito/Private browser window before executing capture.


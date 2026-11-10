# PayPilot AI — Phase 17F: Fresh PayPal Sandbox Checkout Creation

**Document Status:** Complete & Verified  
**Date:** November 10, 2026  
**Scope:** Controlled creation of exactly ONE fresh internal checkout order and ONE real PayPal Sandbox payment attempt for $399.99 USD, authoritative PayPal REST Orders API v2 status inspection, database state verification, and generation of the buyer approval URL.  
**Verdict:** **A. ONE ORDER CREATED — Awaiting buyer approval.**

---

## 1. Executive Summary

In accordance with Phase 17F explicit authorization:
1. **Pre-Creation Verification:** The backend (`http://127.0.0.1:8000`), frontend (`http://127.0.0.1:5175`), PostgreSQL connection, and PayPal Sandbox mode (`is_demo=False`, `mode=sandbox`) were validated.
2. **Product Selected:** Sony WH-1000XM5 Wireless Noise Cancelling Headphones (`28bf5e07-6831-46d7-85e0-4ad579fa14e4`, SKU `AUD-SONY-XM5`), verified at exactly $399.99 USD (`39999` minor units) with 19 available stock units.
3. **One Fresh Order Created:** Created new shopping session `941cf683-dec3-4861-9eb0-25a2c74282e0` and verified that the previous cancelled order `438092a5-53be-4d82-8a8e-7e806aef636b` was **not reused**. Fresh internal order `55a0f6d8-5249-467f-b09d-9c6c140b6be2` was confirmed and 1 unit atomically held in stock.
4. **One PayPal Sandbox Order Created:** Created exactly ONE payment attempt via PayPal Sandbox Orders API v2. Received PayPal Order ID `5MJ46009RH7807830` with `intent: CAPTURE` and total `$399.99 USD`.
5. **Strict Payment Restriction Enforced:** The application was stopped immediately before buyer approval. No capture endpoint was called, no buyer approval was simulated, no database records were manually updated, and no second order was created.

---

## 2. Key Transaction Identifiers

| Parameter | Value |
| :--- | :--- |
| **Product Name** | Sony WH-1000XM5 Noise-Canceling Headphones |
| **Product ID** | `28bf5e07-6831-46d7-85e0-4ad579fa14e4` |
| **SKU** | `AUD-SONY-XM5` |
| **Quantity** | 1 unit |
| **Amount** | **$399.99 USD** (`39999` minor units) |
| **Session ID** | `941cf683-dec3-4861-9eb0-25a2c74282e0` |
| **Internal Order ID** | `55a0f6d8-5249-467f-b09d-9c6c140b6be2` |
| **Payment Attempt ID** | `e0487cc2-a0f9-48e1-9383-c87c6bd26e86` |
| **Idempotency Key** | `de0119be-a020-4bb0-9c42-14c7f2d23a3d` |
| **PayPal Order ID** | **`5MJ46009RH7807830`** |
| **Merchant ID (Payee)** | `SGSNXCUMZPJXJ` |
| **PayPal Intent** | `CAPTURE` |
| **PayPal Authoritative Status** | **`CREATED`** |
| **Internal Order Status** | `payment_processing` |
| **Payment Attempt Status** | `created` |
| **Inventory Reservation Status** | `held` (1 unit reserved) |
| **Inventory Hold Expiry** | `2026-11-10T02:19:02.716381+00:00` (auto-re-reservable upon return) |
| **Active Frontend Origin** | `http://localhost:5175` |

---

## 3. Buyer Approval URL

The buyer approval URL generated directly from the PayPal Orders API v2 `approve` link is:

```
https://www.sandbox.paypal.com/checkoutnow?token=5MJ46009RH7807830
```

### Return & Cancel URL Binding:
- **Return URL:** `http://localhost:5175/#/checkout/complete?token=5MJ46009RH7807830&recovery=<recovery_token>`
- **Cancel URL:** `http://localhost:5175/#/checkout/cancelled?order_id=55a0f6d8-5249-467f-b09d-9c6c140b6be2`

---

## 4. Authoritative PayPal Sandbox Verification

A direct GET request was made to PayPal Orders API v2 endpoint `https://api-m.sandbox.paypal.com/v2/checkout/orders/5MJ46009RH7807830` using the PayPal Sandbox OAuth Bearer token:

```json
{
  "id": "5MJ46009RH7807830",
  "status": "CREATED",
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "default",
      "amount": {
        "currency_code": "USD",
        "value": "399.99"
      },
      "payee": {
        "email_address": "sb-business@example.com",
        "merchant_id": "SGSNXCUMZPJXJ"
      }
    }
  ]
}
```

- **Order Status:** `CREATED` (unapproved, waiting for buyer)
- **Amount & Currency:** `$399.99 USD` (exact match)
- **Merchant ID:** `SGSNXCUMZPJXJ` (Sandbox Business account)

---

## 5. Database State Inspection

Direct query against the PostgreSQL database confirmed:
1. **Order Table:** Order `55a0f6d8-5249-467f-b09d-9c6c140b6be2` status is `payment_processing`.
2. **Payment Attempt Table:** Attempt `e0487cc2-a0f9-48e1-9383-c87c6bd26e86` status is `created`.
3. **Stock Reservation Table:** 1 unit reserved for SKU `AUD-SONY-XM5`, status `held`.

---

## 6. Payment Restrictions Compliance

- [x] No capture endpoint invoked.
- [x] No simulated buyer approval.
- [x] No manual database modifications.
- [x] Exactly ONE fresh PayPal order created.
- [x] Previous transaction not reused.
- [x] Fully stopped awaiting user's personal PayPal Sandbox buyer login.

---

## 7. Final Verdict

```
========================================================================
VERDICT: A. ONE ORDER CREATED — Awaiting buyer approval.
========================================================================
```


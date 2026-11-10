# PayPilot AI — Phase 17D: Recovery Token Expiration & Transaction Investigation

**Document Status:** Complete & Verified  
**Date:** November 9, 2026  
**Scope:** Investigation of the `"Invalid or expired checkout recovery token"` error, cryptographic token validation, signing-secret consistency audit, database state inspection, and PayPal Orders API v2 authoritative status verification.

---

## 1. Executive Summary

Following resolution of the frontend port 5175 CORS configuration, the browser reached `/#/checkout/complete` and invoked `POST /api/v1/payments/paypal/resolve-return`. The endpoint rejected the recovery token with:
`"PayPal capture failed: Invalid or expired checkout recovery token."`

A read-only forensic analysis was performed across cryptographic claims, timestamps, signing keys, PostgreSQL records, and the PayPal REST API.

### Key Findings
1. **Token Rejection Cause:** The recovery token was **cryptographically valid and correctly signed**, but was **strictly expired**.
   - **Issued At:** `2026-11-09T07:39:50.892592+00:00`
   - **Configured TTL:** 45 minutes
   - **Token Expiry:** `2026-11-09T08:24:50.892592+00:00`
   - **Resolution Attempt Time:** `~2026-11-09T14:38:15+00:00` (~6.2 hours after expiry).
2. **Signing Secret Consistency:** Verified consistent across all backend instances and restarts (`SHA-256 fingerprint: 92809ab604c93772`). Recomputing HMAC over the token payload confirmed signature match.
3. **Database State:** The original 15-minute inventory hold expired at `07:54:50 UTC`. The automatic stock sweep worker safely marked the reservation `released` and transitioned the internal order to `cancelled`. Catalog inventory for the Sony WH-1000XM5 remains abundant (19 units available).
4. **PayPal Authoritative Status:**
   - At `13:04 UTC`: Order `2PY51668P50712138` was verified as **`APPROVED`** by buyer John Doe (`sb-8wbqq53769561@personal.example.com`, Payer ID `6LM88786AU6CQ`).
   - At `14:39 UTC` (~7 hours post-creation): PayPal Sandbox returned **`HTTP 404 RESOURCE_NOT_FOUND` (`INVALID_RESOURCE_ID`)**. PayPal Orders API v2 enforces a strict 3-hour capture window on approved orders; expired sandbox orders are purged and cannot be captured.
5. **Verdict:** **B. Approved PayPal order, but inventory or authorization prevents capture.**

---

## 2. Cryptographic Token Forensic Analysis

### A. Token Claims & Payload Verification
The token payload was extracted and validated against internal database identifiers:

| Claim | Payload Value | Expected Value | Match |
| :--- | :--- | :--- | :---: |
| **`purpose`** | `"paypal_return_recovery"` | `"paypal_return_recovery"` | **YES** |
| **`order_id`** | `"438092a5-53be-4d82-8a8e-7e806aef636b"` | Order ID | **YES** |
| **`attempt_id`** | `"138bcef2-bea7-4763-8540-cbb0cb0f61e7"` | Attempt ID | **YES** |
| **`session_id`** | `"b6df5a99-f75a-4c95-a0b4-fa54b1c54a17"` | Session ID | **YES** |
| **`expires_at`** | `"2026-11-09T08:24:50.892592+00:00"` | `issued_at + 45m` | **YES** |

### B. HMAC Signature Verification
- Method: `security.decode_recovery_token_signature(secret_key, token)`
- Recomputed HMAC: Matches presented signature using `hmac.compare_digest`.
- Conclusion: The token was **not tampered with, not corrupted, and not mismatched**.

### C. Expiry Evaluation
```python
expires_at = datetime.fromisoformat("2026-11-09T08:24:50.892592+00:00")
now = datetime.fromisoformat("2026-11-09T14:38:15.352328+00:00")
is_expired = now > expires_at  # True (22,404.5 seconds / 6.22 hours overdue)
```
Line 272 of `backend/app/utils/security.py` rejected the token solely because `now > expires_at`.

---

## 3. Signing Secret Consistency Audit

To verify that backend restarts did not rotate or alter the signing key:
- Both `.env` and `backend/.env` contain identical `APP_SECRET_KEY` definitions.
- Non-reversible SHA-256 fingerprint: `92809ab604c93772`.
- Loaded `settings.app_secret_key` fingerprint before restart: `92809ab604c93772`.
- Loaded `settings.app_secret_key` fingerprint after restart: `92809ab604c93772`.
- Conclusion: **The signing secret remained 100% consistent across all processes and restarts.**

---

## 4. Current Transaction & Inventory States (Read-Only)

### A. Internal Order
- **Order ID:** `438092a5-53be-4d82-8a8e-7e806aef636b`
- **Order Number:** `PP-20261109-704A8661`
- **Status:** `cancelled`
- **Total:** $399.99 USD
- **Created At:** `2026-11-09T07:39:50.572288+00:00`
- **Stock Reserved Until:** `2026-11-09T07:54:50.619785+00:00` (Expired & released)

### B. Payment Attempt
- **Attempt ID:** `138bcef2-bea7-4763-8540-cbb0cb0f61e7`
- **PayPal Order ID:** `2PY51668P50712138`
- **Status:** `created`
- **Created At:** `2026-11-09T07:39:50.892592+00:00`
- **Failure Reason:** None

### C. Stock Reservation & Catalog Stock
- **Reservation ID:** `861d24b9-03e9-4586-8ea0-ca128fb4196b`
- **Status:** `released` (released back to catalog stock at `07:54:50 UTC` by background sweep worker)
- **Catalog Stock Available:** 19 units of Sony WH-1000XM5 currently available in database.

---

## 5. Authoritative PayPal Sandbox API Verification

Authoritative queries against `https://api-m.sandbox.paypal.com/v2/checkout/orders/2PY51668P50712138`:

1. **At `13:04 UTC` (Verified State):**
   - Status: `APPROVED`
   - Payer: John Doe (`sb-8wbqq53769561@personal.example.com`, Payer ID: `6LM88786AU6CQ`)
   - Amount: $399.99 USD
   - Links: `[capture]: https://api.sandbox.paypal.com/v2/checkout/orders/2PY51668P50712138/capture`
2. **At `14:39 UTC` (~7 hours post-creation):**
   - Response Code: `HTTP 404 Not Found`
   - Payload:
     ```json
     {
       "name": "RESOURCE_NOT_FOUND",
       "details": [
         {
           "issue": "INVALID_RESOURCE_ID",
           "description": "Specified resource ID does not exist. Please check the resource ID and try again."
         }
       ],
       "message": "The specified resource does not exist.",
       "debug_id": "f58961762c8fd"
     }
     ```
   - **Root Cause:** In the PayPal Orders API v2 specification, orders created with `intent: CAPTURE` must be captured within 3 hours of buyer approval. When the 3-hour window expires without capture, the PayPal Sandbox engine purges the ephemeral order record, causing subsequent lookups and capture attempts to fail with `RESOURCE_NOT_FOUND`.

---

## 6. Recovery Evaluation & Recommendation

### Can `2PY51668P50712138` be captured now?
**No.** Because PayPal's authoritative API has already purged the resource (`404 RESOURCE_NOT_FOUND`), sending a capture request to PayPal would immediately fail. No money was transferred or captured from the buyer's account.

### Safest Recovery Path
1. **Clean Slate for Shopper:** The session cart is intact. The shopper can initiate a fresh checkout attempt with an active 15-minute inventory reservation.
2. **Immediate Return Flow:** In a fresh checkout, completing approval and returning to PayPilot AI immediately (within 45 minutes) will allow `resolve-return` to re-hydrate the session and capture the payment while both the token and the PayPal order are valid.

---

## 7. Final Verdict

### **VERDICT: B. Approved PayPal order, but inventory or authorization prevents capture.**

**Justification:** The buyer completed approval in PayPal Sandbox, but the transaction exceeded both PayPilot AI's 45-minute recovery token TTL and PayPal Sandbox's 3-hour capture retention window. PayPal's platform has purged the order resource, safely preventing capture without financial loss.


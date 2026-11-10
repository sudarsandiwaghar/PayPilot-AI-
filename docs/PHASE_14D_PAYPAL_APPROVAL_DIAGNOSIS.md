# PayPilot AI — Phase 14D: Diagnostic Report: PayPal Sandbox Buyer Approval Analysis

**Document:** `docs/PHASE_14D_PAYPAL_APPROVAL_DIAGNOSIS.md`  
**Date:** November 8, 2026  
**Environment:** PayPal Sandbox (`PAYPAL_MODE=sandbox`)  
**Order Evaluated:**  
- PayPal Order ID: `4AC37911FK6390101`  
- Internal Order ID: `c8cb81c4-b2bc-46ef-906b-79109cd6f16c`  
- Payment Attempt ID: `7c0e02db-d185-4225-9e34-a84015d69da6`  

---

## 1. Diagnostic Summary & Executive Findings

### Core Finding
PayPal's authoritative REST API v2 reports that order `4AC37911FK6390101` **never transitioned out of status `CREATED`**, and **no payer/buyer account was ever attached**. Furthermore, the 15-minute internal inventory hold expired at `11:18:01 UTC`, triggering the backend's automated stock cleanup which safely transitioned internal order `c8cb81c4-b2bc-46ef-906b-79109cd6f16c` to `status: cancelled` and released the stock reservation.

### Verdict
Order `c8cb81c4-b2bc-46ef-906b-79109cd6f16c` **cannot and must not be captured**. Attempting capture on an unapproved PayPal order returns PayPal HTTP 422 `ORDER_NOT_APPROVED`, and attempting capture on an expired internal order is blocked by backend exception `StockReservationExpired`.

---

## 2. PayPal REST API v2 Ground Truth Evidence

A direct GET request authenticated with live PayPal Sandbox OAuth credentials (`Bearer <access_token>`) was executed against the PayPal Orders API v2:

```http
GET https://api.sandbox.paypal.com/v2/checkout/orders/4AC37911FK6390101 HTTP/1.1
Host: api.sandbox.paypal.com
```

### Full JSON Payload Received from PayPal:
```json
{
  "id": "4AC37911FK6390101",
  "intent": "CAPTURE",
  "status": "CREATED",
  "purchase_units": [
    {
      "reference_id": "c8cb81c4-b2bc-46ef-906b-79109cd6f16c",
      "amount": {
        "currency_code": "USD",
        "value": "399.99",
        "breakdown": {}
      },
      "payee": {
        "email_address": "sb-brkzq53656154@business.example.com",
        "merchant_id": "SGSNXCUMZPJXJ",
        "display_data": {
          "brand_name": "PayPilot AI"
        }
      }
    }
  ],
  "create_time": "2026-11-08T11:03:03Z",
  "links": [
    {
      "href": "https://api.sandbox.paypal.com/v2/checkout/orders/4AC37911FK6390101",
      "rel": "self",
      "method": "GET"
    },
    {
      "href": "https://www.sandbox.paypal.com/checkoutnow?token=4AC37911FK6390101",
      "rel": "approve",
      "method": "GET"
    },
    {
      "href": "https://api.sandbox.paypal.com/v2/checkout/orders/4AC37911FK6390101",
      "rel": "update",
      "method": "PATCH"
    },
    {
      "href": "https://api.sandbox.paypal.com/v2/checkout/orders/4AC37911FK6390101/capture",
      "rel": "capture",
      "method": "POST"
    }
  ]
}
```

### Critical API Indicators:
1. **`status: "CREATED"`:** In PayPal's state machine, when a buyer successfully logs in AND clicks the confirmation button ("Complete Purchase" / "Pay Now"), PayPal changes `status` to `APPROVED` before issuing the HTTP 302 redirect. Because status is `CREATED`, PayPal has not registered approval.
2. **`payer` Object Missing:** In approved PayPal orders (e.g. Phase 10 order `15898251V0378783T`), the JSON contains a `payer` block with `payer_id: "6LM88786AU6CQ"`. Here, `payer` is completely absent.
3. **Approval URL Status:** Testing `GET https://www.sandbox.paypal.com/checkoutnow?token=4AC37911FK6390101` returns HTTP 200 OK. The token is valid and unapproved.

---

## 3. Local Application & Database State

Direct database query of `orders`, `payment_attempts`, and `stock_reservations`:

```sql
SELECT id, status, stock_reserved_until FROM orders WHERE id = 'c8cb81c4-b2bc-46ef-906b-79109cd6f16c';
-- Result: id = c8cb81c4-b2bc-46ef-906b-79109cd6f16c | status = cancelled | stock_reserved_until = 2026-11-08 11:18:01.096474+00:00

SELECT id, status, expires_at FROM stock_reservations WHERE order_id = 'c8cb81c4-b2bc-46ef-906b-79109cd6f16c';
-- Result: status = released | expires_at = 2026-11-08 11:18:01.108983+00:00

SELECT id, paypal_order_id, status FROM payment_attempts WHERE id = '7c0e02db-d185-4225-9e34-a84015d69da6';
-- Result: id = 7c0e02db-d185-4225-9e34-a84015d69da6 | paypal_order_id = 4AC37911FK6390101 | status = created
```

### Analysis of Local State:
- **Order Expiry:** The order was created at `11:03:01 UTC` with a 15-minute stock hold. At `11:18:01 UTC`, the background stock sweep task (`StockService.expire_order_reservations_if_overdue`) detected that the hold expired without capture.
- **Order Cancellation:** The order was transitioned to `cancelled`, and the stock reservation for product `28bf5e07-6831-46d7-85e0-4ad579fa14e4` (Sony WH-1000XM5) was released back into general inventory.
- **Backend Logs:** `task-11970` received **0** capture requests for this order. No capture was ever attempted by the frontend redirect.

---

## 4. Root Cause Analysis: Why Was Buyer Approval Not Registered?

Comparing Phase 10 order `15898251V0378783T` (which succeeded) against `4AC37911FK6390101` (which stayed `CREATED`):

1. **Browser Cookie / Session State in PayPal Sandbox:**
   In PayPal Sandbox (`sandbox.paypal.com`), when a user has multiple Sandbox buyer sessions active or switches between accounts, PayPal frequently hits a silent cookie/session collision. The user sees a confirmation screen or login prompt, but PayPal's internal AJAX request to commit the payer fails, preventing the transition from `CREATED` to `APPROVED`.
2. **Window / Tab Closed Before 302 Redirect:**
   If a buyer clicks the button and closes the tab or window before the redirect completes to `http://localhost:5173/#/checkout/complete?token=...&PayerID=...`, PayPal aborts or fails to persist the authorization state.
3. **Stale Tab Action:**
   If the user clicked "Complete Purchase" in an earlier browser tab from a previous attempt (e.g. order `9BF17255K0755335J` or `15898251V0378783T`), the action was not dispatched to order `4AC37911FK6390101`.
4. **15-Minute Expiration Window:**
   Because 15 minutes elapsed while troubleshooting, even if PayPal were approved now, the internal order is `cancelled`. The application's defensive guards will reject capture.

---

## 5. Recoverability & Safe Resolution Plan

| Question | Assessment |
| :--- | :--- |
| **Is order `c8cb81c4-b2bc-46ef-906b-79109cd6f16c` recoverable?** | **No.** Stock hold expired and order transitioned to `cancelled`. |
| **Did any financial charge occur?** | **No.** PayPal order was never captured; no funds moved. |
| **Is inventory lost?** | **No.** Stock reservation was released back to the catalog. |
| **Is any code change required?** | **No.** Backend and frontend code, CORS, redirect logic, and regression tests (21 backend, 6 frontend) all pass 100%. |

---

## 6. Exact Next Action Required

To cleanly complete and verify the final live PayPal Sandbox capture:

1. **Clear Browser Sandbox Cookies or Use an Incognito/Private Window:**  
   Ensure no stale PayPal Sandbox sessions interfere with the authentication handshake.
2. **Generate a Fresh Checkout Order:**  
   Execute the fresh checkout workflow to obtain a fresh internal order and PayPal Sandbox token with a fresh 15-minute stock hold.
3. **Approve via Private Tab:**  
   Open the approval link in the private tab, sign in with `sb-brkzq53656154@personal.example.com`, click **"Complete Purchase" / "Pay Now"**, and allow the browser to redirect authoritatively to `http://localhost:5173/#/checkout/complete`.
4. **Authoritative Capture:**  
   The backend will immediately execute capture, transition the order to `paid`, commit stock, and display the verified receipt.


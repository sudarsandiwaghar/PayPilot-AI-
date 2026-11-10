# PayPilot AI — Phase 14F: Order Recovery & Redirect Diagnosis Report

**Document:** `docs/PHASE_14F_ORDER_RECOVERY_DIAGNOSIS.md`  
**Date & Time:** November 8, 2026 — 07:25 PM IST  
**Environment:** PayPal Sandbox (`PAYPAL_MODE=sandbox`)  
**Target Transaction:**  
- **Internal Order ID:** `74b302bc-488f-4c85-a78a-bfe34629a3dc`  
- **Payment Attempt ID:** `325a33c7-43dc-4377-9d7a-01d2b0ba41c9`  
- **PayPal Order ID:** `59H813025R965550N`  
- **Payer ID:** `6LM88786AU6CQ` (John Doe, `sb-8wbqq53769561@personal.example.com`)  
- **Product:** Sony WH-1000XM5 Noise-Canceling Headphones ($399.99 USD)  

---

## 1. PayPal REST API Ground Truth

Direct authenticated query to `GET https://api.sandbox.paypal.com/v2/checkout/orders/59H813025R965550N`:

```json
{
  "id": "59H813025R965550N",
  "intent": "CAPTURE",
  "status": "APPROVED",
  "payment_source": {
    "paypal": {
      "email_address": "sb-8wbqq53769561@personal.example.com",
      "account_id": "6LM88786AU6CQ",
      "account_status": "VERIFIED",
      "name": {
        "given_name": "John",
        "surname": "Doe"
      }
    }
  },
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
  "payer": {
    "name": {
      "given_name": "John",
      "surname": "Doe"
    },
    "email_address": "sb-8wbqq53769561@personal.example.com",
    "payer_id": "6LM88786AU6CQ"
  },
  "links": [
    {
      "href": "https://api.sandbox.paypal.com/v2/checkout/orders/59H813025R965550N/capture",
      "rel": "capture",
      "method": "POST"
    }
  ]
}
```

### Key Verification Points:
- **Order Status:** **`APPROVED`** (Authoritative PayPal confirmation).
- **Buyer Payer ID:** `6LM88786AU6CQ`.
- **Amount & Merchant:** $399.99 USD to seller `SGSNXCUMZPJXJ`.
- **Capture Link Available:** `rel: "capture"` is active and awaiting server-side POST capture.
- **Buyer Approval Verdict:** **Buyer approval SUCCEEDED 100% on PayPal Sandbox.**

---

## 2. Internal Database Ground Truth

Direct query executed against PostgreSQL (`orders`, `payment_attempts`, `stock_reservations`):

```sql
SELECT id, session_id, status, total_minor, stock_reserved_until 
FROM orders 
WHERE id = '74b302bc-488f-4c85-a78a-bfe34629a3dc';
```
- **Order ID:** `74b302bc-488f-4c85-a78a-bfe34629a3dc`
- **Session ID:** `faaa95ea-f7e6-4c42-b744-18ada375fdf9`
- **Order Status:** `payment_processing`
- **Stock Reserved Until:** `2026-11-08 14:03:42 UTC` (`07:33:42 PM IST`)
- **Hold Expiry Status:** **ACTIVE (NOT EXPIRED)**.

```sql
SELECT id, status, paypal_order_id, paypal_capture_id 
FROM payment_attempts 
WHERE id = '325a33c7-43dc-4377-9d7a-01d2b0ba41c9';
```
- **Payment Attempt Status:** `created`
- **PayPal Order ID:** `59H813025R965550N`
- **PayPal Capture ID:** `None` (Awaiting authoritative capture).

```sql
SELECT id, product_id, status, expires_at 
FROM stock_reservations 
WHERE order_id = '74b302bc-488f-4c85-a78a-bfe34629a3dc';
```
- **Stock Reservation Status:** `held` (1 unit locked for Sony WH-1000XM5).
- **Recoverability Verdict:** **The internal order is 100% ACTIVE, VALID, and RECOVERABLE.**

---

## 3. Exact Failing Condition in the Frontend

In the user's screenshot, the browser displays:
> *"Restoring Checkout Order... Verifying PayPal approval details and synchronizing order status with backend gateway."*  
> **"No active shopping order found matching the returned PayPal payment."**

### Code Trace:
In `frontend/src/context/SessionContext.tsx` (lines 163–173):
```typescript
const restoreCheckoutOrder = useCallback(
  async (paypalToken?: string): Promise<{ order: OrderData; attempt: PaymentAttemptData } | null> => {
    const storedOrderId =
      sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID) ||
      localStorage.getItem(STORAGE_ACTIVE_ORDER_ID)
    const currentToken =
      token ||
      sessionStorage.getItem(STORAGE_ACCESS_TOKEN) ||
      localStorage.getItem(STORAGE_ACCESS_TOKEN)

    if (!storedOrderId || !currentToken) {
      return null  // <--- FAILS HERE: storedOrderId is NULL
    }
    // ...
  }
)
```

In `frontend/src/components/PaymentModal.tsx` (lines 298–326):
```typescript
if ((!currentOrder || !currentAttempt) && !isRecoveringRef.current) {
  isRecoveringRef.current = true
  const recovered = await restoreCheckoutOrder(tokenParam || undefined)
  if (recovered) {
    currentOrder = recovered.order
    currentAttempt = recovered.attempt
  }
}

if (!currentOrder || !currentAttempt) {
  if (!payerId) return
  setError('No active shopping order found matching the returned PayPal payment.') // <--- TRIGGERED HERE
  return
}
```

---

## 4. Root Cause Analysis Supported by Evidence

1. **Storage Disconnection Across Contexts:**
   - Order `74b302bc-488f-4c85-a78a-bfe34629a3dc` was generated under shopping session `faaa95ea-f7e6-4c42-b744-18ada375fdf9`.
   - The user opened the approval URL in an **Incognito / Private browser window**.
   - An Incognito window has completely isolated, blank `sessionStorage` and `localStorage`.
   - When PayPal redirected back to `http://localhost:5173/#/checkout/complete?token=59H813025R965550N&PayerID=6LM88786AU6CQ` inside that Incognito window, `sessionStorage.getItem('paypilot_active_order_id')` was `null`.
2. **Session Ownership Isolation:**
   - On page mount in the Incognito window, `SessionContext` created a new anonymous session.
   - Even if the browser knew the order ID, the new anonymous session cannot access an order owned by `faaa95ea-f7e6-4c42-b744-18ada375fdf9` due to backend `verify_order_access` security enforcement.
3. **Premature Local Error without API Query:**
   - Because `storedOrderId` was `null`, `restoreCheckoutOrder` returned `null` synchronously without querying the backend.
   - `PaymentModal.tsx` rendered the fallback error banner: *"No active shopping order found matching the returned PayPal payment."*

---

## 5. Status & Decision Matrix

| Question | Assessment | Evidence |
| :--- | :--- | :--- |
| **Did PayPal buyer approval succeed?** | **YES** | PayPal REST API reports status `APPROVED` with Payer `6LM88786AU6CQ`. |
| **Is the internal order valid?** | **YES** | Status is `payment_processing`, total is $399.99 USD. |
| **Is the stock reservation held?** | **YES** | Status is `held`, hold active until `07:33:42 PM IST`. |
| **Did any duplicate capture occur?** | **NO** | `paypal_capture_id` is `None`. |
| **Is the order recoverable?** | **YES** | Order is fully intact and awaiting capture. |

---

## 6. Smallest Safe Resolution

### Option A: Authoritative Backend Capture (Immediate & Safest)
Because buyer approval is authoritatively verified on PayPal (`APPROVED`), the authenticated backend capture endpoint can be called using the session access token that owns order `74b302bc-488f-4c85-a78a-bfe34629a3dc`:
```http
POST /api/v1/orders/74b302bc-488f-4c85-a78a-bfe34629a3dc/payments/325a33c7-43dc-4377-9d7a-01d2b0ba41c9/capture
Authorization: Bearer <session_token>
```
- Captures the PayPal Sandbox payment.
- Verifies capture status is `COMPLETED`.
- Transitions order `74b302bc-488f-4c85-a78a-bfe34629a3dc` to `paid`.
- Commits the reserved inventory.

### Option B: Frontend Recovery Enhancement
In `SessionContext.tsx`:
If `storedOrderId` is missing from `sessionStorage`, but a `paypalToken` query param is present on the return URL, allow `restoreCheckoutOrder` to query orders or lookup the order associated with the token if the user has authenticated access.

---

## 7. Next Step & Required User Approval

Before taking any action:
> **Do you approve executing the authoritative backend capture for approved order `74b302bc-488f-4c85-a78a-bfe34629a3dc` (PayPal Order `59H813025R965550N`, $399.99 USD)?**

Reply **"approve capture"** to execute the capture, commit inventory, transition the order to `paid`, and generate the final Phase 14 completion verification report.


# Devpost Submission Pack — PayPilot AI

**PayPal AI Hackathon Submission**  
**Submission Date:** November 10, 2026  
**Repository:** [https://github.com/sudarsandiwaghar/PayPilot-AI-](https://github.com/sudarsandiwaghar/PayPilot-AI-)  
**License:** Open-Source MIT License ([`LICENSE`](file:///c:/Users/sudar/Documents/Paypilot%20AI/LICENSE))  

---

## 1. Project Overview & Elevator Pitch

### Project Title
**PayPilot AI** — Autonomous Shopping Assistant with Constraint-Bound Decision Layer & Secure PayPal Sandbox Checkout

### Tagline
Budget-aware AI shopping assistant with grounded catalog discovery and cryptographically verified, human-in-the-loop PayPal checkout.

### Category Tracks
- **AI Agents & Conversational Commerce**
- **FinTech / PayPal Developer Platform Integration**

### Elevator Pitch
Online shoppers face a dilemma: conversational AI makes discovering products intuitive, but typical LLMs hallucinate prices, invent phantom discounts, and lack safeguards against accidental or unauthorized purchases. 

**PayPilot AI** bridges this trust gap. It pairs a live Google Gemini AI model for natural-language understanding with a deterministic backend decision engine, pessimistic PostgreSQL row locks (`SELECT FOR UPDATE`), 15-minute temporary stock reservations, and official PayPal Developer Platform Standard Checkout (Orders API v2). Shoppers search in conversational English, receive recommendations grounded strictly in catalog evidence, compare products side-by-side, and complete purchases through a two-stage cryptographic checkout where every dollar and stock unit is verified server-side before buyer authorization and authoritative capture.

---

## 2. Devpost Submission Fields

### Problem Statement
Generative AI chatbots are rapidly entering modern retail, but standard conversational interfaces introduce severe hazards when handling real transactions:
1. **Price & Inventory Hallucinations:** Generative models easily hallucinate discounts, quote incorrect prices, or promise out-of-stock items.
2. **Autonomous Overreach:** Allowing autonomous AI agents to initiate transactions without explicit human approval risks accidental orders, liability, and loss of consumer trust.
3. **Checkout Race Conditions & Tampering:** Client-side pricing calculations are vulnerable to tampering, while delays between recommendation and payment often cause inventory overselling and unexpected payment capture failures.

### Solution: The PayPilot AI Approach
PayPilot AI treats the LLM strictly as an **intent extraction and natural-language synthesis layer**, surrounding it with hard, deterministic financial and database boundaries:
- **Strictly Grounded AI:** The Google Gemini AI model extracts structured constraints (`category`, `budget_ceiling`, `required_features`, `preferences`).
- **Deterministic Filtering & Knapsack Optimization:** Candidate products are strictly queried from PostgreSQL; budgets are calculated via a deterministic greedy knapsack optimizer in Python.
- **Two-Stage Cryptographic Checkout:**
  - *Stage 1 (Preview):* Issues a tamper-evident HMAC-SHA256 signed preview token binding cart version, item fingerprint, prices, and a 10-minute expiry timestamp.
  - *Stage 2 (Confirmation):* Re-verifies the signature and cart fingerprint, acquires pessimistic row-level database locks (`SELECT ... FOR UPDATE`), and places a 15-minute temporary inventory reservation.
- **Human-in-the-Loop PayPal Checkout:** Creates an official PayPal Orders API v2 order (`intent: CAPTURE`). The user personally authorizes the purchase in the secure PayPal Sandbox modal.
- **Authoritative Server-Side Capture:** The backend re-verifies inventory availability before calling PayPal's capture endpoint, permanently committing the stock and persisting the authoritative `paypal_capture_id`.

---

## 3. Technical Architecture & Implementation

### A. How Google Gemini AI is Used
- **Provider:** `GeminiLLMProvider` using Google Gemini 1.5 Flash via REST (`https://generativelanguage.googleapis.com/v1beta`).
- **Structured Pydantic Extraction:** Translates free-form shopper queries into typed `ShoppingIntent` objects containing explicit category, budget ceiling, required features, preferences, excluded features, and ranking priorities.
- **Grounded Explanations:** Explanations strictly cite catalog specifications and verified source claims (`ProductSource`), preventing any synthetic or hallucinated product attributes.
- **Strict Boundary Security:** Product descriptions and catalog data never control agent tool execution; only read-only allowlisted catalog tools are accessible.
- **Deterministic Fallback:** An offline deterministic provider (`MockLLMProvider`) is included, enabling full test-suite execution with zero network dependency.

### B. How PayPal Developer Sandbox is Integrated
- **Integration Standard:** Official PayPal Developer Platform Standard Checkout via Orders API v2.
- **Order Creation:** `POST /v2/checkout/orders` with `intent: "CAPTURE"`, itemized purchase units, and dynamic origin-based return/cancel URLs.
- **Buyer Authorization Experience:** Official PayPal Sandbox popup/modal (`https://www.sandbox.paypal.com/checkoutnow?token={id}`) using US Sandbox Buyer account (`sb-8wbqq53769561@personal.example.com`).
- **Authoritative Capture:** `POST /v2/checkout/orders/{id}/capture` executed strictly on the backend after verified buyer approval.
- **Persistence & Idempotency:** The authoritative `paypal_capture_id` is stored in PostgreSQL with a unique database index, and each attempt carries a unique idempotency key to prevent double charges upon network retries.
- **Checkout State Recovery:** HMAC-signed 45-minute recovery tokens allow shoppers in cold tabs or private windows to return, automatically re-reserve stock if the initial 15-minute hold elapsed, and safely capture payment.

### C. Database & Security Information
- **Database Engine:** PostgreSQL (tested on PostgreSQL 16 & Neon Serverless) with asynchronous SQLAlchemy 2.0 and asyncpg connection pooling.
- **Concurrency Protection:** Row-level locks (`SELECT ... FOR UPDATE`) prevent two concurrent shoppers from purchasing the final available unit.
- **Secret Redaction:** Active logging filters (`SecretFilter`) automatically redact credentials, PayPal secrets, and Gemini keys from exception logs.
- **Zero Client Secrets:** Client bundles contain zero API keys, secrets, or privileged credentials.

---

## 4. Technology Stack & "Built With" Tags

- **Frontend:** React 19, TypeScript 6.0, Vite 8.3, Lucide React, CSS3 Design Tokens
- **Backend:** Python 3.12+ (tested on Python 3.14), FastAPI 0.115, Pydantic v2, Uvicorn, Starlette
- **Database & Migrations:** PostgreSQL 16, SQLAlchemy 2.0 (asyncio), asyncpg, Alembic
- **AI & LLM:** Google Gemini 1.5 Flash (`GeminiLLMProvider`), Pydantic Schema Parsing
- **Payments:** PayPal Developer Platform Standard Checkout, Orders API v2 (`intent: CAPTURE`)
- **Security:** HMAC-SHA256, CSPRNG Session Tokens, SHA-256 Hashing, Pessimistic Row Locking
- **Quality & Tests:** Pytest (124/124 tests pass), Oxlint (0 warnings), Node.js test runner (7/7 tests pass)
- **License:** Open-Source MIT License

---

## 5. Concise Demo Walkthrough for Judges (2–3 Minutes)

### Step 1: Open the Application
- Open `http://localhost:5173` (or port `5175`).
- The application automatically establishes a secure anonymous session with a signed Bearer token.
- Browse the 20 seeded catalog products across Audio, Computing, Wearables, and Home Office.

### Step 2: Live AI Conversational Search
- Click the **Chat** tab or input bar.
- Type: `"Find wireless noise cancelling headphones under $400 for travel"`.
- **Observe:** The Google Gemini AI model extracts:
  - `category = "Audio"`
  - `budget_ceiling = $400.00`
  - `required_features = ["noise-canceling", "wireless"]`
- The decision engine applies database filters and Knapsack ranking, returning top matches (e.g., Sony WH-1000XM5 and Bose QuietComfort 45) with grounded specification citations.

### Step 3: Product Comparison & Cart
- Click **Compare** to view side-by-side specifications, pros, cons, and ratings.
- Click **Add to Cart** on the Sony WH-1000XM5 ($399.99).
- Open the Cart Drawer and click **Review Checkout Preview**.
- Notice the HMAC-SHA256 signed checkout preview locking the cart total server-side.

### Step 4: Two-Stage Checkout & PayPal Sandbox
- Check **Confirm Order & Reserve Stock**.
- The backend acquires a row lock, creates the internal order, and places a 15-minute stock hold.
- Click **Confirm & Pay with PayPal**.
- The backend calls PayPal Orders API v2 and returns the official PayPal Sandbox approval modal.

### Step 5: Buyer Approval & Server Capture
- Log in to PayPal Sandbox with the test buyer credentials:
  - **Email:** `sb-8wbqq53769561@personal.example.com`
- Authorize the $399.99 payment in the PayPal Sandbox popup.
- Return to PayPilot AI. The application verifies authoritative status `APPROVED`, revalidates inventory, and triggers server-side capture.
- The order transitions to **PAID**, the reservation is committed to stock, and the unique `paypal_capture_id` is displayed on the verified receipt.

---

## 6. Screenshots & Video Scene List

### Required Screenshots
1. **`01_product_catalog.png`:** The responsive product grid showing 20 seeded catalog items with price tags, stock badges, and category tabs.
2. **`02_gemini_ai_recommendations.png`:** The Conversational Chat interface showing user's natural language request, Gemini's extracted constraints, and grounded recommendations.
3. **`03_product_comparison.png`:** Side-by-side specification comparison matrix with match scores and catalog evidence.
4. **`04_checkout_preview_modal.png`:** The two-stage checkout modal with itemized breakdown, tax calculation, and HMAC-signed preview notice.
5. **`05_paypal_sandbox_approval.png`:** The official PayPal Sandbox buyer approval modal showing merchant `SGSNXCUMZPJXJ` and $399.99 USD amount.
6. **`06_verified_order_receipt.png`:** Final receipt screen showing Order ID, PayPal Order ID, Authoritative Capture ID, and PAID status.

### Demo Video Scenes (2–3 Minutes)
- **Scene 1 (0:00 – 0:40):** Problem explanation & live Gemini AI conversational search.
- **Scene 2 (0:40 – 1:15):** Grounded product comparison & sticky cart management.
- **Scene 3 (1:15 – 1:55):** Two-stage cryptographic checkout, HMAC preview, and stock reservation.
- **Scene 4 (1:55 – 2:30):** PayPal Sandbox buyer authorization and authoritative server-side capture.
- **Scene 5 (2:30 – 2:50):** Order receipt, capture ID verification, and order history audit trail.

---

## 7. Commands to Launch for Judges

### Backend (Terminal 1)
```bash
# Activate virtual environment
.venv\Scripts\Activate.ps1    # On Windows
# source .venv/bin/activate   # On Linux/macOS

# Start FastAPI backend server
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

### Frontend (Terminal 2)
```bash
cd frontend
npm run dev
# Live at http://localhost:5173 (or http://localhost:5175)
```

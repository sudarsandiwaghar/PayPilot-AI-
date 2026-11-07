# PayPilot AI — Autonomous Shopping Agent & Secure PayPal Checkout

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](./LICENSE)
[![Python: 3.12+](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.3-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6.svg)](https://www.typescriptlang.org/)
[![PayPal](https://img.shields.io/badge/PayPal_Developer-Orders_API_v2-003087.svg)](https://developer.paypal.com/)
[![Tests: 114 Passed](https://img.shields.io/badge/Tests-114%20Passed%20(100%25)-success.svg)](./backend/tests)

**PayPilot AI** is an intelligent, autonomous shopping assistant and secure e-commerce application built for the **PayPal AI Hackathon**.

It transforms unstructured, natural-language shopping requests into verified, constraint-bound purchase journeys. Combining a real Google Gemini AI model, deterministic backend decision algorithms, concurrency-controlled temporary stock reservations, and official PayPal Developer Platform Standard Checkout (Orders API v2), PayPilot AI ensures shoppers discover the best products within budget while retaining absolute human-in-the-loop payment authorization.

---

## 🌟 Hackathon Eligibility & Compliance Highlights

| Hackathon Requirement | PayPilot AI Implementation Status | Verification Evidence |
| :--- | :--- | :--- |
| **1. PayPal Developer Platform Sandbox** | **VERIFIED & COMPLIANT**<br>Official Orders API v2 (`POST /v2/checkout/orders` with `intent: CAPTURE`, `POST /v2/checkout/orders/{id}/capture`). Authoritative capture ID (`paypal_capture_id`) persisted to database. Idempotent server-side capture prevents duplicate charges. Route aliases exposed at `POST /api/payments/paypal/orders` and `POST /api/payments/paypal/orders/{order_id}/capture`. | [`backend/app/services/payment_service.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/backend/app/services/payment_service.py)<br>[`backend/tests/test_payments.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/backend/tests/test_payments.py) (19/19 tests pass) |
| **2. Actual AI Tool / Model Integration** | **VERIFIED & COMPLIANT**<br>Live Google Gemini API provider (`GeminiLLMProvider`) parsing natural language into typed `LLMStructuredIntentExtract` schemas. Extracts category, budget ceiling, required features, preferences, excluded features, brand preferences, and ranking priorities. Strict error handling with retry limits; never returns fake hardcoded text. Grounded explanations strictly cite catalog specs and source claims. | [`backend/app/services/agent/llm_provider.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/backend/app/services/agent/llm_provider.py)<br>[`backend/tests/test_agent.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/backend/tests/test_agent.py) (14/14 tests pass) |
| **3. Detectable Open-Source License** | **VERIFIED & COMPLIANT**<br>Standard Open-Source MIT License located at repository root (`LICENSE`). Detectable by GitHub License API. | [`LICENSE`](file:///c:/Users/sudar/Documents/Paypilot%20AI/LICENSE) (MIT, Copyright (c) 2026 Sudarsan) |
| **4. Functional Application (Not a Mockup)** | **VERIFIED & COMPLIANT**<br>Complete, executable end-to-end user workflow: natural-language query &rarr; real AI constraint parsing &rarr; database filtering &amp; Knapsack budget optimizer &rarr; cart &rarr; signed preview checkout &rarr; PayPal Sandbox order creation &rarr; buyer approval &rarr; server-side capture &rarr; inventory commit &rarr; verified order receipt. | Full-stack application verified locally &amp; automated test suite (114/114 passing tests). |
| **5. Setup & Execution Instructions** | **VERIFIED & COMPLIANT**<br>Complete instructions for judges to configure PayPal Sandbox credentials, Gemini API key, database migrations, and start both frontend and backend. | This README &amp; [`.env.example`](file:///c:/Users/sudar/Documents/Paypilot%20AI/.env.example). |

---

## 🏛️ System Architecture

```
                                  [ Shopper / Judge Browser ]
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     │                                                 │
          [ React 19 Frontend (Vite) ]                     [ PayPal Sandbox ]
          - Purple Design System (#321064)                 - Buyer Login Experience
          - Catalog & Comparison Views                     - Buyer Approval Screen
          - Conversational Chat View                       - Token Issuance
          - PayPal Modal Checkout Flow                                 │
                     │                                                 │
                     ▼                                                 │
       [ FastAPI Backend Application ]                                 │
       - Bearer Token Session Ownership                                │
       - HMAC-SHA256 Signed Checkout Preview                           │
       - Pessimistic Row Locking & 15m Holds                           │
       - Server-Side Price & Total Calculation                         │
                     │                                                 │
        ┌────────────┴────────────┐                                    │
        │                         │                                    │
        ▼                         ▼                                    ▼
[ Google Gemini AI ]    [ PostgreSQL (Neon / Local) ]      [ PayPal REST API v2 ]
- Intent Parsing        - 20 Seeded Verified Products      - POST /v1/oauth2/token
- Schema Validation     - Temporary Stock Holds            - POST /v2/checkout/orders
- Grounded Explanations - Idempotent Payment Records       - POST /v2/.../capture
- Strict Fallbacks      - Structured Audit Trail           - Authoritative Capture ID
```

---

## 💻 Technology Stack

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | React, TypeScript, Vite | React 19, TS 6.0, Vite 8.3 | High-performance, reactive shopper UI with canonical purple theme |
| **Backend API** | FastAPI, Uvicorn, Pydantic | FastAPI 0.115, Pydantic v2 | High-throughput async REST API with automatic OpenAPI docs |
| **Database ORM** | SQLAlchemy, asyncpg, Alembic | SQLAlchemy 2.0 (asyncio) | Non-blocking database access, connection pooling, migrations |
| **Database** | PostgreSQL | 16+ / Neon Serverless | Relational storage with row-level locks and ACID guarantees |
| **Payment Gateway** | PayPal Developer Platform | Orders API v2 | Sandbox checkout, buyer authorization, authoritative capture |
| **AI Model Provider**| Google Gemini | `gemini-flash-lite-latest` / REST | Natural language understanding, constraint extraction |
| **Icons & Style** | Lucide React, CSS Variables | Lucide 1.60 | Accessible WCAG AA design system |

---

## 🚀 Quickstart & Setup Guide for Judges

Follow these steps to run PayPilot AI locally in under 5 minutes.

### 1. Prerequisites

- **Node.js**: v18+ (tested on Node v20+)
- **Python**: 3.12+ (tested on Python 3.12 - 3.14)
- **PostgreSQL**: 16+ (or free serverless database on [Neon.tech](https://neon.tech))
- **Git**

---

### 2. Clone Repository & Environment Setup

```bash
git clone https://github.com/sudarsandiwaghar/PayPilot-AI-.git
cd PayPilot-AI-
```

Create your backend environment configuration:
```bash
cp .env.example .env
```

Open `.env` and configure your credentials:

```ini
# ── Application ───────────────────────────────────────────
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
APP_SECRET_KEY=at-least-16-character-secret-key-for-hmac-tokens

# ── Database ──────────────────────────────────────────────
# Local PostgreSQL or Neon Serverless connection URL:
DATABASE_URL=postgresql+asyncpg://paypilot:your_password@localhost:5432/paypilot_dev

# ── PayPal Sandbox Credentials (Free at developer.paypal.com)
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret_here
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com

# ── AI Shopping Agent / Gemini Configuration ──────────────
LLM_PROVIDER=gemini
LLM_API_KEY=your_gemini_api_key_here
LLM_MODEL=gemini-flash-lite-latest
```

> [!TIP]
> **No PayPal or Gemini keys right now?**
> PayPilot AI runs completely offline in test mode:
> Set `PAYPAL_MODE=mock` and `LLM_PROVIDER=mock`. You can still test the entire application, catalog search, comparison, and cart flows with deterministic offline fixtures!

---

### 3. How to Obtain Free PayPal Sandbox Credentials

1. Go to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Log in with your standard PayPal account.
3. In the left navigation, click **Testing Tools &rarr; Sandbox Accounts**:
   - Ensure your **Business (Merchant)** and **Personal (Buyer)** accounts are registered under **United States** (to process standard USD checkout without cross-border currency restrictions).
4. Under **Apps & Credentials**, select the **Sandbox** tab.
5. Click **Create App** (associated with your US Sandbox Business account).
6. Copy the generated **Client ID** and **Secret** into your `.env` file (`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`).
7. Use the US Sandbox **Personal (Buyer)** account email and password during checkout approval.

---

### 4. How to Obtain a Free Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** &rarr; **Create API key**.
3. Copy the key into `.env` as `LLM_API_KEY`.

---

### 5. Backend Setup & Database Migrations

In the repository root or `backend` folder:

```bash
# 1. Create and activate virtual environment
python -m venv .venv

# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

# 2. Install dependencies
pip install -e "backend[dev]"

# 3. Run Alembic database migrations
cd backend
alembic upgrade head

# 4. Seed the demo catalog with 20 real products and verified evidence
python -m app.seed.catalog

# 5. Start the FastAPI backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will be live at: **`http://localhost:8000`**  
Interactive API Docs (Swagger): **`http://localhost:8000/docs`**

---

### 6. Frontend Setup & Launch

Open a second terminal window in the root directory:

```bash
cd frontend

# 1. Install frontend packages
npm install

# 2. Start Vite development server
npm run dev
```

Frontend will be live at: **`http://localhost:5173`**

---

## 🧪 Automated Testing & Verification

Run the comprehensive test suite (114 automated tests covering AI schema extraction, PayPal sandbox orders, capture idempotency, stock reservations, and security):

```bash
# From repository root:
pytest backend/tests -v
```

All 114 tests execute against in-memory SQLite/async database fixtures with zero external network dependencies:
- **`test_agent.py`**: Validates Gemini schema extraction, Pydantic validation, error bubbling, tool allowlisting.
- **`test_payments.py`**: Validates PayPal Sandbox order creation, buyer approval, server-side capture, `paypal_capture_id` storage, duplicate capture idempotency, and cancellation.
- **`test_checkout.py`**: Validates HMAC-SHA256 preview tokens and tamper prevention.
- **`test_stock.py` & `test_stock_expiry_flows.py`**: Validates 15-minute stock hold guarantees and concurrency.

To build the frontend for production:
```bash
cd frontend
npm run build
```

---

## 🛍️ Judge Walkthrough: End-to-End Demo Journey

1. **Open the Application**: Navigate to `http://localhost:5173`. A secure anonymous session token is automatically minted and stored in session memory.
2. **Ask the AI Shopping Assistant**:
   - Click on the **Chat** tab or input bar.
   - Enter: *"Find Sony or Bose noise-canceling headphones with long battery life under $350"*.
   - **Observe**: The AI model extracts structured constraints (`category="Audio"`, `max_budget=350`, `required_features=["noise-canceling"]`, `preferences=["long battery life"]`, `brand_preferences=["Sony", "Bose"]`).
3. **Review Grounded Recommendations**:
   - The decision engine applies hard database filters (`price <= $350`, `in_stock > 0`) and calculates deterministic match scores.
   - Explanations cite verified catalog specifications and authentic source references.
4. **Compare Products**:
   - Click **Compare** to inspect side-by-side pros, cons, and specifications without marketing fluff.
5. **Add to Cart & Checkout Preview**:
   - Add your preferred item to cart. Open the Cart Drawer and click **Proceed to Checkout**.
   - Notice the signed preview total computed strictly server-side.
6. **Initiate PayPal Sandbox Checkout**:
   - Click **Confirm & Pay with PayPal**.
   - The backend calls PayPal Orders API v2 (`POST /v2/checkout/orders` with `intent: CAPTURE`) and returns an authoritative `approval_url`.
   - Temporary stock reservation is locked in the database for 15 minutes.
7. **Approve via PayPal Sandbox**:
   - Click **Approve on PayPal Sandbox** to open the official PayPal Sandbox experience.
   - Log in with your Sandbox buyer credentials and authorize the transaction.
8. **Authoritative Server Capture**:
   - Return to the PayPilot tab and click **Verify & Capture PayPal Payment**.
   - The backend executes `POST /v2/checkout/orders/{id}/capture` to capture funds.
   - The backend receives the authoritative `COMPLETED` capture status and stores the unique `paypal_capture_id`.
   - Inventory reservation is atomically committed.
9. **Order Receipt & History**:
   - View the verified order receipt showing Order ID, PayPal Order ID, PayPal Capture ID, and status **PAID**.
   - Click **Orders & Spend History** to verify persistence across shopping sessions.

---

## 🔒 Security & Concurrency Architecture

- **No Secret Leakage**: `PAYPAL_CLIENT_SECRET` and `LLM_API_KEY` reside strictly on the server in `.env`. Error handlers actively redact secrets from exception strings before logging.
- **Pessimistic Inventory Locking**: `SELECT ... FOR UPDATE` row locks guarantee that two concurrent shoppers cannot purchase the last remaining item.
- **Server-Side Pricing**: Order line items and totals are strictly recalculated from verified database catalog records; client-submitted totals are ignored.
- **Prompt Injection Defense**: Product descriptions never control agent tool execution; only read-only allowlisted catalog tools are accessible.
- **Idempotency Safeguards**: Each payment attempt carries a unique idempotency key preventing duplicate charges upon network retries.

---

## 📄 License & Credits

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

- **Developer:** Sudarsan ([@sudarsandiwaghar](https://github.com/sudarsandiwaghar))
- **Hackathon:** Built with ❤️ for the **PayPal AI Hackathon 2026**


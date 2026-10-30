# PayPilot AI — Source-Backed Architecture Readiness Audit

**Audit Date:** October 25, 2026  
**Auditor:** Antigravity AI  
**Scope:** Full repository source code audit (`frontend/`, `app/`, `alembic/`, `tests/`, deployment blueprints).  
**Source Baseline:** Git commit [`0104dc74709065cab77c76f8ec2cca380c0d7359`](https://github.com/sudarsandiwaghar/PayPilot-AI-/commit/0104dc74709065cab77c76f8ec2cca380c0d7359) with completed tool registry reconciliation, Orders & Spend history frontend flow, and AI model boundary secret safety.

---

## 1. Executive Verdict & Staging Separation

### **Overall Status: READY FOR NO-COST MOCK / DEMO STAGING DEPLOYMENT**

To ensure clear, unambiguous operational planning, **blockers for immediate no-cost mock staging** are strictly separated from **future requirements for live third-party integrations**:

```
┌──────────────────────────────────────────────────────────┐
│      IMMEDIATE NO-COST MOCK / DEMO STAGING               │
│  Status: READY (Pending only Render Blueprint Apply)     │
├──────────────────────────────────────────────────────────┤
│ • Defaults: PAYPAL_MODE=mock, LLM_PROVIDER=mock          │
│ • Zero external paid accounts, credit cards, or keys     │
│ • Neon Free PostgreSQL connectivity: UNVERIFIED         │
│   (Becomes VERIFIED upon passing /api/v1/health/ready)   │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼ (Future Phases Only)
┌──────────────────────────────────────────────────────────┐
│          FUTURE LIVE EXTERNAL INTEGRATIONS               │
│  Status: PARTIAL / UNVERIFIED (Not Staging Blockers)     │
├──────────────────────────────────────────────────────────┤
│ • PayPal Sandbox / Live REST API credentials             │
│ • Google Gemini Live Generative Language API key         │
│ • Real-time merchant catalog crawling adapters           │
└──────────────────────────────────────────────────────────┘
```

### High-Level Subsystem Status Summary

| Area | Status | Verified Flow / Implementation Evidence |
| :--- | :---: | :--- |
| **1. Frontend UI** | **COMPLETE** | 7-page flow styled with Superdesign Warm Mocha & Ivory (`#59402F` / `#F1EBE5`): Dashboard (`DashboardView.tsx`), AI Shopping Chat (`AgentChatView.tsx`), Search Results (`CatalogView.tsx`), Comparison Matrix (`ProductComparisonView.tsx`), Cart Drawer (`CartDrawer.tsx`), Checkout Review & Confirmation (`CheckoutModal.tsx`, `PaymentModal.tsx`), and Orders & Session Spend History (`OrdersHistoryView.tsx`). Verified via browser smoke flow and build tests. |
| **2. Backend API** | **COMPLETE** | FastAPI gateway, Pydantic v2 schemas, RFC-compliant error envelope, SHA-256 session token hashing, HMAC-SHA256 checkout tokens, row-level locking (`SELECT FOR UPDATE`), background stock sweeper. Verified via 103 passing pytest tests. |
| **3. AI Agent Layer** | **COMPLETE (Mock) / UNVERIFIED (Live)** | Canonical tool registry (`ALLOWED_TOOLS`), read-only allowlist enforcement, deterministic scoring and knapsack budget allocation, ambiguity detection. `MockLLMProvider` verified offline with zero credentials; `GeminiLLMProvider` verified for header-based auth, fallback, and secret redaction; live Gemini API call remains UNVERIFIED. |
| **4. Product Intelligence** | **COMPLETE (Seeded) / DEFERRED (Live Adapters)** | Seeded catalog with source evidence models (`ProductSource`), hard SQL constraint filters, deterministic ranking formula, and pure knapsack budget optimization. External web crawling is explicitly omitted for no-cost staging; risks and requirements documented below. |
| **5. Payment Gateway** | **COMPLETE (Mock) / UNVERIFIED (Live)** | Tamper-proof HMAC preview tokens, stock reservation hold state machine, synthetic buyer approval simulation, and demo payment capture verified via automated tests and live browser execution. PayPal Sandbox/Live code is scaffolded but UNVERIFIED against real PayPal endpoints. |
| **6. Data & Operations** | **COMPLETE (Local) / UNVERIFIED (Cloud Neon)** | PostgreSQL schema, Alembic migrations, append-only audit ledger, structured JSON logging with secret scrubbing, liveness probe (`/health`), and readiness probe (`/health/ready`). Local PostgreSQL verified; live Neon cloud database connectivity remains UNVERIFIED until deployed. |

---

## 2. Baseline Architecture Diagram Comparison

The original PayPilot architecture diagram defined the following functional layout:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             PRESENTATION LAYER                             │
│  [Shopping Dashboard]  [AI Shopping Chat]  [Cart & Checkout Review]        │
│  [Orders & Budget History]  [Product Results & Comparison Modal]           │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
┌─────────────────────────────────────▼──────────────────────────────────────┐
│                            API & APPLICATION GATEWAY                       │
│  [Input Validation]  [Session Auth]  [AI Shopping Agent Orchestrator]      │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼───────────────────────────┐
         ▼                            ▼                           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  AI AGENT LAYER  │        │PRODUCT INTEL ENG │        │ CHECKOUT/PAYMENT │
│ [Intent Parsing] │        │[Approved Sources]│        │[HMAC Preview]    │
│ [Bounded Plan]   │        │[Normalizer]      │        │[Stock Hold 15m]  │
│ [Safety Policy]  │        │[Hard Filters]    │        │[Explicit Confirm]│
│ [Tool Registry]  │        │[Determ. Ranking] │        │[PayPal Lifecycle]│
│ [Model Provider] │        │[Budget Knapsack] │        │[Mock / Sandbox]  │
└──────────────────┘        └──────────────────┘        └──────────────────┘
         │                            │                           │
         └────────────────────────────┼───────────────────────────┘
                                      │
┌─────────────────────────────────────▼──────────────────────────────────────┐
│                          DATA & OPERATIONS LAYER                           │
│  [PostgreSQL DB]  [Audit Ledger]  [Render + Neon Blueprint]  [Health/Logs] │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Verification Matrix

Every component is classified as:
- **`COMPLETE`**: Fully implemented and verified via automated tests or runnable browser smoke flows (never based solely on code presence).
- **`PARTIAL`**: Core implementation exists, but specific features or integrations are missing or bounded.
- **`UNVERIFIED`**: Code is implemented, but live network connectivity against external third parties has not been performed.
- **`DEFERRED`**: Intentionally excluded from no-cost mock staging to avoid external accounts, crawler risks, or paid billing.

| Component | Status | Key Source Files / Symbols | Verified By | Implementation Reality & Verified Boundary |
| :--- | :---: | :--- | :--- | :--- |
| **1.1 Shopping Dashboard** | `COMPLETE` | [`frontend/src/components/DashboardView.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/DashboardView.tsx) | Browser smoke flow, `tsc -b`, `oxlint` | Central dashboard with dynamic natural-language AI search bar ("Search with AI"), empty initial input, category shelves, top catalog recommendations, and active session spend metrics (subtotal, settled spend per session, order count). |
| **1.2 AI Shopping Search & Assistant** | `COMPLETE` | [`frontend/src/components/AgentChatView.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/AgentChatView.tsx) | Browser smoke flow, `tests/test_agent.py` | Conversational and dynamic AI search results flow: user-entered natural-language request, ambiguity clarification card, grounded recommendations with match scores & catalog source evidence, budget ceiling per query, and direct Add to Cart / Compare actions. |
| **1.3 Product Catalog Explorer** | `COMPLETE` | [`frontend/src/components/CatalogView.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/CatalogView.tsx) | Browser smoke flow, `tsc -b`, `oxlint` | Category filters, sort by rating/price, in-stock toggle, reactive product cards with catalog sources and specs drawer. Single page rendering. |
| **1.4 Product Comparison Matrix** | `COMPLETE` | [`ProductComparisonView.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/ProductComparisonView.tsx), [`ComparisonModal.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/ComparisonModal.tsx) | Browser smoke flow, `tests/test_agent.py` | Side-by-side comparison tray comparing technical specifications, ratings, stock counts, and AI match reasons for up to 4 products with direct Add to Cart. |
| **1.5 Shopping Cart Drawer** | `COMPLETE` | [`frontend/src/components/CartDrawer.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/CartDrawer.tsx) | Browser smoke flow, `tests/test_checkout.py` | Slide-over cart drawer with thumbnail previews, quantity adjustments, line item removal, subtotal, and truthful notice: 15-minute hold upon order confirmation. |
| **1.6 Checkout Review & Confirmation** | `COMPLETE` | [`CheckoutModal.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/CheckoutModal.tsx), [`PaymentModal.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/PaymentModal.tsx) | Browser smoke flow, `tests/test_checkout.py`, `tests/test_payments.py` | HMAC preview token generation with 10-minute expiry countdown (`expires_at`), price/stock revalidation, explicit shopper confirmation checkbox, and two-step synthetic demo payment flow (`PAYPAL_MODE=mock`). |
| **1.7 Orders & Session Spend History** | `COMPLETE (Session)` | [`OrdersHistoryView.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/OrdersHistoryView.tsx), [`app/api/v1/orders.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/api/v1/orders.py) | Browser smoke flow, `tests/test_orders.py` | Dedicated view (`#nav-tab-orders`) displaying session settled spend, placed orders count, itemized receipts, supported status badges (`PAID`, `STOCK RESERVED`, `PROCESSING`, `FAILED`, `CANCELLED`), and architecture data boundary notice. |
| **2.1 API Gateway & Validation** | `COMPLETE` | [`app/main.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/main.py), [`app/schemas/common.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/schemas/common.py) | `tests/test_agent.py::test_request_validation_error_envelope` | Standardized RFC error envelope (`code`, `message`, `field`, `request_id`). Request-ID middleware attaches `X-Request-ID`. |
| **2.2 Auth & Session Management** | `COMPLETE` | [`app/services/session_service.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/session_service.py), [`app/models/session.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/models/session.py) | `tests/test_sessions.py`, `tests/test_security.py` | CSPRNG bearer tokens (`pp_sess_...`); stored strictly as SHA-256 hashes; constant-time comparison via `hmac.compare_digest`. |
| **2.3 Shopping Agent Orchestrator** | `COMPLETE` | [`app/api/v1/agent.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/api/v1/agent.py), [`DecisionEngine`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/decision_engine.py) | `tests/test_agent.py` (11 tests), browser flow | Coordinates LLM boundary, SQL hard filtering, deterministic composite ranking, budget optimization, and audit logging. |
| **3.1 Intent & Constraint Parsing** | `COMPLETE` | [`MockLLMProvider.parse_intent`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/llm_provider.py#L87) | `tests/test_agent.py::test_agent_valid_recommendation_flow` | Extracts category, budget in minor units, required features, and detects query ambiguity without hallucinations. |
| **3.2 Bounded Planning** | `COMPLETE` | [`app/services/agent/decision_engine.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/decision_engine.py) | `tests/test_agent.py` | Fixed, deterministic 6-stage execution pipeline. Does not execute unconstrained autonomous multi-turn loops. |
| **3.3 Safety & Purchase Policy** | `COMPLETE` | [`ALLOWLISTED_TOOLS`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/tools.py#L27), [`Product CheckConstraints`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/models/product.py#L83) | `tests/test_agent.py::test_tool_allowlisting_strict_enforcement` | AI agent has access only to read-only discovery/budget tools; strictly forbidden from creating orders or triggering payments. |
| **3.4 Allowlisted Tool Registry** | `COMPLETE` | [`app/agents/tool_registry.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/agents/tool_registry.py) | `test_tool_registry_reconciliation`, `test_tool_allowlisting_strict_enforcement` | Canonical registry `ALLOWED_TOOLS` maps 4 read-only tools (`search_products`, `get_product_detail`, `compare_products`, `optimize_budget`). Forbidden tools raise 403. |
| **3.5 Model Provider Boundary** | `COMPLETE (Mock) / UNVERIFIED (Live)` | [`app/services/agent/llm_provider.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/llm_provider.py) | `test_gemini_fallback_and_secret_safe_logging`, `test_agent_missing_llm_configuration` | `MockLLMProvider` operates offline with zero API keys. `GeminiLLMProvider` uses `x-goog-api-key` header with automatic fallback and log secret redaction. Live Gemini API call remains UNVERIFIED. |
| **4.1 Product Sources & Adapters** | `COMPLETE (Seeded) / DEFERRED (Live)` | [`ProductSource`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/models/product.py#L93), [`app/seed/catalog.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/seed/catalog.py) | `tests/test_products.py`, seed script execution | 20 seeded demo products with explicit provenance (`is_demo_data=True`). Live scraping/crawling adapters deferred due to legal/operational risks. |
| **4.2 Data Normalization** | `COMPLETE` | [`Product`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/models/product.py#L34), [`app/schemas/product.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/schemas/product.py) | `tests/test_products.py` | Prices stored as integer cents (`price_minor`), currencies in ISO-4217, ratings in Decimal(3,2), technical specs in JSONB. |
| **4.3 Hard-Constraint Filtering** | `COMPLETE` | [`DecisionEngine.process_shopping_request`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/decision_engine.py#L86) | `tests/test_agent.py::test_agent_hard_constraint_enforcement` | Database-level filtering strictly excludes inactive products, out-of-stock items, currency mismatches, and products exceeding the budget ceiling. |
| **4.4 Deterministic Ranking** | `COMPLETE` | [`DecisionEngine`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/decision_engine.py#L128) | `tests/test_agent.py` | Composite formula: $0.4\times\text{req} + 0.3\times\text{rating} + 0.2\times\text{pref} + 0.1\times\text{price}$. Ties broken by price ascending, then UUID ascending. |
| **4.5 Budget Optimization** | `COMPLETE` | [`optimize_budget()`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/tools.py#L186) | `tests/test_agent.py` | Pure deterministic knapsack calculation allocating cart items within `budget_minor`. |
| **4.6 Grounded Explanations** | `COMPLETE` | [`MockLLMProvider.generate_explanation`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/llm_provider.py#L198) | `tests/test_agent.py`, browser flow | Synthesized strictly from verified catalog specifications and linked `ProductSource` claims. Zero hallucinations. |
| **5.1 Price/Stock Revalidation** | `COMPLETE` | [`CheckoutService.confirm_checkout`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/checkout_service.py#L146) | `tests/test_checkout.py`, `tests/test_stock_expiry_flows.py` | Verifies cart item fingerprint against HMAC preview token; acquires row-level locks in ascending order; auto-reclaims expired holds prior to stock check. |
| **5.2 Explicit Shopper Confirmation** | `COMPLETE` | [`confirm_checkout`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/checkout_service.py#L150), `PaymentService` | `tests/test_payments.py::test_unconfirmed_order_cannot_initiate_payment` | Sets `confirmed_by_shopper=True`. Payment creation strictly rejected with 400 if order is unconfirmed. UI requires explicit checkbox confirmation. |
| **5.3 Payment Lifecycle** | `COMPLETE (Mock) / UNVERIFIED (Live)` | [`PaymentService`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/payment_service.py) | `tests/test_payments.py` (17 tests), browser flow | State machine: `created` -> `approved` -> `captured` / `capture_failed`. Mock mode fully verified. Live PayPal REST API credentials UNVERIFIED. |
| **6.1 PostgreSQL & Migrations** | `COMPLETE (Local) / UNVERIFIED (Cloud)` | [`app/models/`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/models/), [`alembic/versions/`](file:///c:/Users/sudar/Documents/Paypilot%20AI/alembic/versions/) | Local Postgres pytest suite (103 tests) | 8 core relational tables with foreign keys, check constraints, and composite indexes. Auto-migrates on startup via `start.sh`. Cloud Neon DB remains UNVERIFIED. |
| **6.2 Audit Ledger & History** | `COMPLETE` | [`AuditEvent`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/models/audit.py), [`AuditService`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/audit_service.py) | `tests/test_audit.py`, `tests/test_payments.py` | Append-only audit table recording checkout confirmations, stock holds, releases, payment attempts, captures, and agent recommendations. |
| **6.3 Observability & Health** | `COMPLETE` | [`app/api/v1/health.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/api/v1/health.py), [`app/utils/logging.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/utils/logging.py) | `tests/test_health.py`, browser runtime probe | Structured JSON logging with automatic secret scrubbing; request ID tracking; liveness probe (`/health`) and readiness probe (`/health/ready`). |
| **6.4 Render + Neon Blueprint** | `PARTIAL` | [`render.yaml`](file:///c:/Users/sudar/Documents/Paypilot%20AI/render.yaml), [`RENDER_NEON_DEPLOYMENT.md`](file:///c:/Users/sudar/Documents/Paypilot%20AI/RENDER_NEON_DEPLOYMENT.md) | Blueprint validator script passed, `tests/test_config.py` passed | Blueprint connects static frontend to public backend URL (`RENDER_EXTERNAL_URL`); 10-minute stock sweep preserves Neon scale-to-zero. Cloud deployment pending. |

---

## 4. In-Depth Subsystem Verifications

### 4.1 Tool Allowlist Reconciliation
- **Baseline Inconsistency:** Prior to this phase, [`app/agents/tool_registry.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/agents/tool_registry.py) was an empty scaffold (`ALLOWED_TOOLS = {}`), while the active allowlist and dispatch was implemented in [`app/services/agent/tools.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/tools.py) (`ALLOWLISTED_TOOLS = frozenset(...)`).
- **Resolution:**
  - `app/agents/tool_registry.py` was populated as the canonical registry mapping the four allowlisted tools (`search_products`, `get_product_detail`, `compare_products`, `optimize_budget`) to callable functions, descriptions, and explicit `read_only: True` flags.
  - Re-exports `ALLOWLISTED_TOOLS` and `execute_tool` from `tool_registry.py` to eliminate architectural drift.
- **Verification Evidence:**
  - `tests/test_agent.py::test_tool_registry_reconciliation` asserts `set(ALLOWED_TOOLS.keys()) == ALLOWLISTED_TOOLS` and verifies all entries are marked `read_only: True`.
  - `tests/test_agent.py::test_tool_allowlisting_strict_enforcement` verifies that executing any unallowlisted tool (e.g., `create_order`, `initiate_payment`, `capture_payment`, `bypass_checkout`, `delete_user`, `update_product_price`, `transfer_funds`, `arbitrary_exec`) immediately raises `ToolExecutionForbidden` (HTTP 403).

### 4.2 Orders & Budget History Implementation
- **API & Data Reality:**
  - Backend `GET /api/v1/sessions/{session_id}/orders` was already implemented and tested (`tests/test_orders.py::test_list_session_orders`).
  - `api.listSessionOrders` was added to `frontend/src/api/client.ts`.
  - [`OrdersHistoryView.tsx`](file:///c:/Users/sudar/Documents/Paypilot%20AI/frontend/src/components/OrdersHistoryView.tsx) was created and integrated into `App.tsx` and `Navbar.tsx` (`#nav-tab-orders`).
- **Budget History Boundary:**
  - *Data Model Limit:* The database models anonymous ephemeral sessions (`ShoppingSession`) and orders (`Order`). There are no user accounts, balance ledgers, monthly budget quotas, or multi-session spending limit tables in the database.
  - *Current Reality:* Session settled spend is computed directly as the sum of `total_minor` across confirmed paid orders in the active session. Budget optimization in shopping queries is evaluated dynamically per request by the knapsack engine within the single-turn query constraint (`ShoppingConstraint.budget_minor`).
  - *User-Facing Transparency:* An explicit "Architecture Data Note: Budget Tracking Boundary" card is displayed on the Orders & Spend view explaining this exact boundary to shoppers.

### 4.3 AI Model Boundary & Secret-Safe Logging
- **Provider Selection:** Defaults safely to `LLM_PROVIDER=mock`. No external API keys or paid accounts are required.
- **Gemini Live Client:** [`GeminiLLMProvider`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/services/agent/llm_provider.py) sends the API key in the `x-goog-api-key` HTTP header rather than in the URL query string (`?key=...`), preventing httpx connection errors or HTTP URL logging from leaking the key.
- **Secret Redaction:** Any exception raised during intent parsing is sanitized to replace any matching API key with `[REDACTED_API_KEY]`.
- **Offline Fallback:** If the live Gemini call fails (due to network timeout, quota exhaustion, or invalid credentials), the engine automatically falls back to `MockLLMProvider` for deterministic intent extraction and grounded specification citations without interrupting the shopper's flow.
- **Verification Evidence:**
  - `tests/test_agent.py::test_gemini_fallback_and_secret_safe_logging` simulates an unreachable endpoint and asserts that intent fallback succeeds and the secret key is completely absent from caplog output.
  - `tests/test_agent.py::test_agent_missing_llm_configuration` verifies that an explicitly empty `llm_provider=""` returns `LLM_PROVIDER_NOT_CONFIGURED` (HTTP 400).

### 4.4 Product Intelligence Claims & Source Adapters
- **Filters & Ranking in Real Request Flow:**
  - *Hard SQL Constraints:* `Product.is_active.is_(True)`, `Product.stock_qty > 0`, `Product.currency == constraints.currency`, `Product.category.ilike(...)`, and `Product.price_minor <= constraints.budget_minor`.
  - *Scoring:* $0.4\times\text{req} + 0.3\times\text{rating} + 0.2\times\text{pref} + 0.1\times\text{price}$.
  - *Knapsack Allocation:* Deterministic greedy knapsack in `optimize_budget()` selecting optimal candidate combinations within `budget_minor`.
  - *Grounded Explanations:* Synthesizes descriptions citing verified catalog specifications and linked `ProductSource.source_name` (e.g., "Sony Official", "Keychron Store").
- **Catalog Provenance:**
  - The catalog is statically populated via [`app/seed/catalog.py`](file:///c:/Users/sudar/Documents/Paypilot%20AI/app/seed/catalog.py) with 20 demo items. Every item and source is explicitly flagged with `is_demo_data=True` and `verified_at=None`.
  - There are NO live web crawlers, background scrapers, or third-party merchant API adapters.
- **Why Web Scraping is Deferred (Operational & Legal Risks):**
  1. *Terms of Service & Legal Risks:* Major e-commerce retailers (Amazon, Best Buy, Walmart) prohibit automated scraping in their Terms of Service.
  2. *Anti-Bot Obstacles:* Cloudflare Bot Management, Akamai, and perimeter CAPTCHAs require residential proxy infrastructure, headless browser farms, and recurring paid CAPTCHA solvers.
  3. *Latency & Jitter:* On-the-fly scraping introduces multi-second delays that break the real-time AI shopping assistant experience.
  4. *Schema Fragility:* Retailer DOM structure changes break scrapers unpredictably without notice.

---

## 5. Verified Browser Smoke Flow

The complete end-to-end shopping lifecycle was executed in a live browser on `http://127.0.0.1:5173/` backed by the running FastAPI backend and PostgreSQL database:

| Step | Action | Observed Result | Evidence |
| :---: | :--- | :--- | :--- |
| **1** | Navigate to `http://127.0.0.1:5173/` | SPA loaded, session pill displayed `Session ff3d6251...` with green active dot. Catalog products loaded. | Verified |
| **2** | Switch to AI Assistant tab | Chat interface rendered with suggested prompt chips and query textarea. | Verified |
| **3** | Submit shopping query | Query: `"Find noise-canceling headphones under $450 with Bluetooth"` submitted. | Verified |
| **4** | Agent recommendation | `MockLLMProvider` parsed intent (Audio, $450 budget, noise-canceling feature). Returned Sony WH-1000XM5 ($399.99, match score 0.94) with grounded explanation. | Verified |
| **5** | Add to cart | Clicked "Add to Cart" on recommendation card. Cart badge updated to `1`. | Verified |
| **6** | Open cart drawer | Drawer slid in showing 1 item: Sony WH-1000XM5, quantity 1, subtotal $399.99. | Verified |
| **7** | Review order preview | Clicked "Review Order". Backend generated HMAC preview token `ey...`. Countdown timer initialized (10:00). Zero stock warnings. | Verified |
| **8** | Confirm & place order | Checked confirmation box and clicked "Confirm & Place Order". Backend locked product row, created order `PP-20261025-AD4B8095`, and reserved stock. | Verified |
| **9** | Payment simulation | Payment modal opened with Demo Mode notice. Clicked "Simulate Approval", then "Authorize & Capture Payment". | Verified |
| **10** | Payment captured | Status transitioned to `CAPTURED`. Demo transaction ID `demo_paypal_...` generated. Stock committed in database. | Verified |
| **11** | View order receipt | Clicked "View Order Receipt". Modal displayed Order `#PP-20261025-AD4B8095`, status `PAID`, itemized total $399.99, and payment attempt audit trail. | `order_receipt_success_1792891006620.png` |
| **12** | Orders & Spend history | Navigated to `#nav-tab-orders`. View displayed: Session Settled Spend = **$399.99**, Session Orders = **1**, placed order card with green `PAID` badge, items table, and Architecture Data Note. | `orders_spend_history_view_1792891069606.png` |

---

## 6. Exact Verification Commands & Results

### 1. Backend Automated Regression Suite
- **Command:** `.venv\Scripts\pytest`
- **Result:** `103 passed in 37.47s` (including all 11 agent tests, 17 payment tests, 10 stock expiry flow tests, and config tests).

### 2. Frontend Linting & Production Build
- **Command:** `cd frontend && npm run lint && npm run build`
- **Result:** 
  - `oxlint`: `Found 0 warnings and 0 errors.`
  - `tsc -b && vite build`: `built in 220ms` with zero TypeScript or bundling errors.

### 3. Backend Health & Readiness Probes
- **Liveness Probe:** `curl http://127.0.0.1:8000/api/v1/health`
  - Response: `{"status":"ok","version":"0.1.0","timestamp":"..."}`
- **Readiness Probe:** `curl http://127.0.0.1:8000/api/v1/health/ready`
  - Response:
    ```json
    {
      "status": "ready",
      "checks": [
        {"name": "postgresql", "status": "ok", "latency_ms": 19.06, "error": null},
        {"name": "paypal", "status": "ok", "latency_ms": 0.0, "error": "Mock mode active — external network check skipped"}
      ]
    }
    ```

---

## 7. Remaining Gaps & Clear Acceptance Criteria

### Remaining Blockers for Real Live Cloud Deployment (No-Cost Staging)
1. **Apply Render Blueprint to Live Neon Database:**
   - *Status:* **`UNVERIFIED`**
   - *Acceptance Criteria:* Apply `render.yaml` in Render Dashboard, input the private Neon Free connection string for `DATABASE_URL`, and verify that `GET https://paypilot-backend.onrender.com/api/v1/health/ready` returns `"status": "ready"` with PostgreSQL check `"status": "ok"`.

### Future Live Provider Integration Requirements (Non-Blockers for Mock Staging)
1. **PayPal Sandbox / Live Credentials:**
   - *Requirements:* Obtain `client_id` and `client_secret` from developer.paypal.com. Configure `PAYPAL_MODE=sandbox`.
   - *Acceptance Criteria:* An authenticated OAuth token request succeeds against `api-m.sandbox.paypal.com`, and a test buyer checkout captures funds in the PayPal Sandbox dashboard.
2. **Google Gemini Live API Key:**
   - *Requirements:* Obtain Gemini API key from Google AI Studio. Configure `LLM_PROVIDER=gemini` and `LLM_API_KEY`.
   - *Acceptance Criteria:* A live shopping query executes without falling back to `MockLLMProvider`, and intent extraction is returned by the Gemini REST endpoint with no key leakage in logs.
3. **Live Product Retailer Feeds:**
   - *Requirements:* Establish official retailer affiliate/product API partnerships (e.g., Best Buy Developer API, eBay Buy API) with structured JSON contracts rather than HTML scraping.
   - *Acceptance Criteria:* An asynchronous catalog sync worker ingests external product catalogs and verifies prices on an hourly schedule.

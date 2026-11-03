# Devpost Submission Pack — PayPilot AI

---

## 1. Project Overview & Elevator Pitch

* **Project Title:** PayPilot AI
* **Tagline:** Budget-aware AI shopping with transparent, safer checkout.
* **Primary Category:** E-Commerce / Artificial Intelligence / FinTech
* **Repository:** [https://github.com/sudarsandiwaghar/PayPilot-AI-](https://github.com/sudarsandiwaghar/PayPilot-AI-)
* **Current Code Baseline:** Commit [`10f3274e3dfda6967442f48d1ab9d829f6a90a58`](https://github.com/sudarsandiwaghar/PayPilot-AI-/commit/10f3274e3dfda6967442f48d1ab9d829f6a90a58)

### Elevator Pitch
PayPilot AI is a budget-aware AI shopping assistant that couples conversational natural-language product discovery with deterministic backend safeguards. Shoppers enter plain-English requests, receive recommendations grounded strictly in the catalog, compare items side-by-side, and proceed through a two-stage checkout protected by HMAC-SHA256 signed preview tokens and temporary inventory holds. By enforcing hard budget constraints, read-only AI tools, and simulated payment lifecycles, PayPilot AI demonstrates how conversational commerce can eliminate price hallucinations, accidental purchases, and inventory overselling.

---

## 2. Built With Tags

> [!NOTE]
> Only technologies verified in the repository are listed below. Unverified third-party services are explicitly labeled.

* **Backend:** Python 3.12+ (tested on 3.14), FastAPI, Pydantic v2, SQLAlchemy (asyncio), asyncpg, Alembic, PostgreSQL 16
* **Frontend:** React 19, TypeScript, Vite, Lucide React, CSS3 Design Tokens
* **Security & Auth:** HMAC-SHA256 Signed Tokens, CSPRNG Bearer Tokens, SHA-256 Hashing, Constant-Time Digest Comparison (`hmac.compare_digest`), Pessimistic Database Locks (`SELECT FOR UPDATE`)
* **Testing & Quality:** Pytest, pytest-asyncio, Node.js Native Test Runner (`node:test`), Oxlint, Headless Chrome DevTools Protocol (CDP)
* **AI Architecture:** Bounded Read-Only Tool Registry, Deterministic Knapsack Budget Optimizer, Composite Ranking Formula, Synthetic Offline Provider (`MockLLMProvider`)
* **Optional / Unverified Live Providers:**
  * *Google Gemini:* Scaffolded in `GeminiLLMProvider` with secret-safe headers (`x-goog-api-key`) and offline fallback; default runs offline with zero external API keys.
  * *PayPal:* Scaffolding and synthetic demo mode verified (`PAYPAL_MODE=mock`); live PayPal REST API and PayPal Sandbox remain unverified.
  * *Cloud Hosting (Render + Neon):* Multi-service blueprint (`render.yaml`) prepared and validated; cloud runtime deployment remains unverified.

---

## 3. Devpost Project Story

### Inspiration
Generative AI chatbots are rapidly entering online retail, but standard LLM chat interfaces present severe risks in transactional e-commerce:
1. **Price & Feature Hallucinations:** Language models can quote non-existent discounts, hallucinate stock, or invent features.
2. **Unconstrained Autonomous Purchasing:** Allowing autonomous agents to execute purchases or modify carts without explicit human approval risks accidental orders and liability.
3. **Checkout Race Conditions & Tampering:** Without cryptographic verification between price quotes and order submission, users can manipulate client-side totals or suffer race conditions where inventory is oversold during payment.

We built **PayPilot AI** to show that conversational commerce does not require blind trust in an LLM. By placing deterministic algorithms, row-level database locking, and cryptographic token verification around the AI model, shoppers get the convenience of natural-language discovery with complete financial and inventory safety.

---

### What It Does
* **Natural-Language Product Request:** Shoppers enter their own plain-English requests (e.g. *"Noise-canceling headphones for air travel under $400"* or *"Lightweight laptop with 16GB RAM"*).
* **Grounded Recommendations & Clarification:** Queries are parsed and strictly grounded against the catalog. When shopper requests are ambiguous, the assistant asks for clarification rather than hallucinating products.
* **Fast Catalog Typeahead Search:** On the Product Catalog view, shoppers can type naturally with real-time typeahead (debounced ~280–300ms) matching names, categories, brands, specifications (e.g. `OLED`, `Titanium`, `USB-C`), and normalized variants (such as `"electronic"` mapping to real tech products).
* **Visible Cart Quantity & Responsive Sticky Bar:** Displays authoritative total units ($\sum \text{quantity}$), immediate addition feedback (`"Added to cart +1"`, `"Added to cart +2"`), and a compact floating bar that remains accessible on both mobile and desktop viewports.
* **Side-by-Side Product Comparison:** Compares up to 4 catalog items across technical specifications, ratings, stock counts, and AI match reasons.
* **Two-Stage Cryptographic Checkout:**
  * *Stage 1 (Preview):* Calculates prices, stock availability, and issues a tamper-evident HMAC-SHA256 signed preview token binding cart version, item fingerprint, prices, and a 10-minute expiry timestamp.
  * *Stage 2 (Confirmation):* Re-verifies the signature and cart fingerprint, acquires pessimistic row-level database locks (`SELECT ... FOR UPDATE`), and places a 15-minute temporary inventory reservation.
* **Simulated Payment Lifecycle with Production Guards:** Shoppers test payment approval, failure, retry, and capture using synthetic identifiers (`DEMO-PAYPAL-ORD-...`). Every step displays prominent notices that no real payment is processed, while backend production guards strictly prevent mock captures in production environments.
* **Session Order & Spend History:** Displays placed orders, itemized receipts, and settled spend calculated directly from confirmed session orders.

---

### How We Built It
* **FastAPI Backend Architecture:** Designed around asynchronous SQLAlchemy ORM, Pydantic v2 schemas, and standard RFC error envelopes. Every endpoint requires CSPRNG session token validation via constant-time comparison.
* **Deterministic Decision Engine:** Implemented a fixed 6-stage pipeline: intent extraction, SQL hard filtering, deterministic composite scoring ($0.4\times\text{req} + 0.3\times\text{rating} + 0.2\times\text{pref} + 0.1\times\text{price}$), greedy knapsack budget allocation, explanation generation, and audit logging.
* **Bounded Agent Tool Registry:** Restricted agent tool access strictly to an allowlisted registry (`ALLOWED_TOOLS`) containing 4 read-only tools (`search_products`, `get_product_detail`, `compare_products`, `optimize_budget`). Unallowlisted actions (such as `create_order` or `initiate_payment`) are forbidden and rejected with HTTP 403.
* **React 19 & TypeScript Frontend:** Single-page application built on Vite, styled strictly with the canonical design system: Primary `#321064`, Secondary `#6D28D9`, Soft Surface `#F4F0FA`, White `#FFFFFF`, Text `#21152F` / `#62576F`, and Borders `#DED6E9`.

---

### Challenges We Ran Into
1. **Preventing AI Hallucinations in Budget Optimization:** Early prompt engineering attempts frequently resulted in the LLM recommending combinations that slightly exceeded the budget ceiling. We solved this by extracting the budget parameter and delegating budget allocation entirely to a deterministic greedy knapsack optimizer in Python.
2. **Eliminating Race Conditions During Checkout:** Concurrency conflicts can cause items to be sold out between preview review and payment capture. We solved this by implementing row-level pessimistic locks (`SELECT FOR UPDATE`) ordered by product ID during order confirmation, combined with a 15-minute temporary reservation TTL and an advisory-locked background sweeper.
3. **Handling E-Commerce Search Variants Without External Heavy Engines:** Shoppers expect queries like `"electronic"` to return tech items even when categories are named `"Audio"` or `"Computing"`. We implemented query normalization and concept synonym mapping that associates broad terms with actual catalog products while cleanly excluding non-electronic furniture.

---

### Accomplishments We're Proud Of
* **100% Automated Test Pass Rate:** 111 backend pytest tests passing, 20 frontend node tests passing, 0 oxlint warnings/errors across 26 files, and complete headless Chrome CDP browser smoke test passing end-to-end.
* **Zero Client Secrets:** No third-party payment or LLM secrets are stored in the client application or required for local evaluation.
* **Tamper-Proof Checkout:** Cryptographic token binding guarantees that client-side requests cannot alter product prices or bypass inventory validation.

---

### What We Learned
* In transactional and financial AI applications, generative models should be confined to natural-language understanding and synthesis; all pricing, budgeting, inventory reservation, and payment execution must remain strictly deterministic and auditable.
* Temporary stock holds with background expiration sweepers provide a vastly better customer experience than failing at final payment capture.

---

### What's Next
* **Authenticated Merchant Feeds:** Integrate verified retail API adapters (e.g. Best Buy Developer API) using structured contracts rather than web scraping.
* **Live Sandbox Verification:** Configure and verify PayPal Sandbox OAuth tokens and real test buyer sandbox captures.
* **Persistent Multi-Session Accounts:** Extend beyond anonymous sessions to support authenticated user accounts with multi-session budget tracking.

---

## 4. Truthful 2–3 Minute Demo Script

> [!IMPORTANT]
> **Demo Ground Rules & Transparency Notice:**
> - Recommendations are grounded strictly in the seeded demo catalog and its verified attributes.
> - Payment approval, failure, retry, and capture are simulated in mock demo mode. No real money is processed.
> - Live cloud staging and live PayPal/Gemini credentials remain unverified optional integrations.

### Minute 1: Natural-Language Discovery & Live Typeahead (0:00 – 1:00)
1. **Product Catalog Typeahead:**
   * Open the web app on `http://localhost:5173/#/catalog`.
   * Point out the category tabs, active session pill in the header, and search field.
   * Type `"electronic"` slowly into the search field.
   * *Talking Point:* *"PayPilot AI offers fast, catalog-grounded typeahead search. Notice that typing 'electronic' immediately surfaces matching tech items and updates the product grid without pressing Enter, normalizing terms and filtering real catalog items."*
   * Use keyboard arrow keys to highlight a suggestion, press Enter to scroll to and highlight the product card, and click **Add to Cart**.
   * *Talking Point:* *"Notice the instant '+1' indicator on the card and the floating sticky cart bar at the bottom, which tracks authoritative unit counts without covering controls."*

2. **AI Shopping Assistant:**
   * Navigate to the **AI Search Results** tab (`#/agent`).
   * Enter a natural-language request: e.g. *"Noise-canceling headphones for air travel under $400"*.
   * Click **Search with AI**.
   * *Talking Point:* *"Shoppers are not locked into preset prompt buttons—they can enter arbitrary queries. The backend extracts category and budget constraints, verifies catalog stock, and ranks candidates using a deterministic scoring formula."*
   * Point out the match score and grounded catalog claims on the recommendation card.

### Minute 2: Two-Stage Checkout & Cryptographic Token Binding (1:00 – 2:00)
1. **Review Checkout Preview:**
   * Click **View Cart** on the sticky cart bar or top navigation to open the cart drawer.
   * Click **Review Checkout Preview**.
   * *Talking Point:* *"To prevent client-side price tampering and inventory race conditions, PayPilot uses a two-stage checkout. Stage 1 issues an HMAC-SHA256 signed preview token that locks the cart version, item fingerprint, prices, and a 10-minute expiry."*
2. **Confirm Order & Reserve Stock:**
   * Review the itemized breakdown and check the **Explicit Shopper Confirmation** checkbox.
   * Click **Confirm Order & Reserve Stock**.
   * *Talking Point:* *"Upon confirmation, the backend verifies the cryptographic signature, acquires row-level locks with SELECT FOR UPDATE, creates the order, and places a 15-minute temporary inventory hold so items aren't oversold while the customer pays."*

### Minute 3: Simulated Payment Lifecycle & Audit Trail (2:00 – 3:00)
1. **Failure Simulation & Resilience:**
   * Point out the prominent banner: **"Demo payment — no real payment processed"** (`Synthetic Demo`).
   * Click **Simulate Payment Failure (Test Retry Flow)**.
   * *Talking Point:* *"We simulate failure to demonstrate resilience: Attempt #1 fails with `payment_failed`, but the backend preserves the 15-minute stock reservation so the shopper never loses their cart."*
2. **Retry, Approval & Capture:**
   * Click **Retry Payment (Attempt #2)**.
   * Click **Simulate Buyer Approval**, then **Verify & Capture Demo Payment**.
   * *Talking Point:* *"With one click, we simulate approval and capture. The backend atomically commits the held stock and marks the order as PAID."*
3. **View Receipt & Session History:**
   * Click **View Order Receipt** to view the itemized breakdown and payment audit trail.
   * Navigate to the **Orders** tab to show session settled spend and placed orders.
   * *Talking Point:* *"Everything is transparent: shoppers can inspect their session order history and verify that no real funds were charged."*

---

## 5. Pre-Submission Checklist

### Media & Submission Assets Checklist
- [ ] **Repository URL:** Set to `https://github.com/sudarsandiwaghar/PayPilot-AI-` (public or accessible to judges).
- [ ] **Video Demonstration:** Record a 2–3 minute video following the script above. Ensure high resolution (1080p) with clear audio.
- [ ] **Screenshots (Minimum 4 Recommended):**
  1. Product Catalog with live typeahead dropdown active.
  2. AI Shopping Assistant with custom natural-language query and grounded recommendations.
  3. Two-stage Checkout Preview modal with signed preview token and confirmation checkbox.
  4. Payment Modal showing the simulated demo payment notice and retry flow.
  5. Orders History View showing settled spend and itemized receipt.
- [ ] **Banner / Thumbnail:** 1200x630px image utilizing the canonical Deep Purple (`#321064`) and Vibrant Violet (`#6D28D9`) palette.

---

## 6. Claims That Must NOT Be Made (Unverified Claims)

| Claim Category | Forbidden / False Claim | Truthful Repo Reality |
| :--- | :--- | :--- |
| **Payment Processing** | "Processes live credit cards / PayPal payments in real time" | **Simulated Demo Only:** `PAYPAL_MODE=mock`. Uses synthetic identifiers (`DEMO-PAYPAL-ORD-...`). Real PayPal credentials have not been verified. |
| **Live Web Scraping** | "Scrapes live prices across Amazon, Best Buy, and Walmart" | **Seeded Catalog Only:** 20 curated demo products seeded via `app/seed/catalog.py` with explicit `is_demo_data=True` and `verified_at=None`. No live web crawling. |
| **Live Gemini Model** | "Powered by live Google Gemini 1.5 Pro in the deployed app" | **Mock Provider Active by Default:** `LLM_PROVIDER=mock`. `GeminiLLMProvider` is scaffolded with header auth and fallback, but live API calls are unverified without an external user-supplied key. |
| **Cloud Deployment** | "Live and running at paypilot.onrender.com" | **Cloud Staging Unverified:** Blueprint and Neon branches exist, but live cloud runtime health probes have not been directly observed. Demo runs verified locally on `http://127.0.0.1:8000` and `:5173`. |
| **User Accounts** | "Manages multi-month user accounts and bank budgets" | **Session-Bound Ephemeral Scope:** Anonymous sessions (`ShoppingSession`) with bearer tokens. Budget limits are evaluated dynamically per single-turn query constraint. |

---

## 7. Challenge-Specific Requirements To Verify

If submitting to a specific hackathon on Devpost, check the hackathon's official rules page for:
1. **Track / Category Selection:** Confirm which category (e.g. AI Agents, E-Commerce, FinTech) matches PayPilot AI.
2. **Required Sponsor Technologies:** If the hackathon requires a specific sponsor API (e.g. Google Gemini, PayPal, or PostgreSQL), confirm whether simulated mock mode is accepted or if live sandbox API keys must be demonstrated during judging.
3. **Video Duration Limit:** Verify whether the video must be strictly under 2 or 3 minutes.
4. **Team Members:** Ensure all team contributors are invited to the Devpost project before submission.


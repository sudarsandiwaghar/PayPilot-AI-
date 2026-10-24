# PayPilot AI — Intelligent Shopping Assistant & Secure E-Commerce

**PayPilot AI** is a production-grade, full-stack AI shopping assistant and secure e-commerce application. It combines an autonomous AI shopping agent, rigorous concurrency-controlled checkout with temporary stock reservations, idempotent payment lifecycle management, and a rich React + TypeScript frontend.

---

> [!IMPORTANT]
> ### ⚠️ External Payment Provider Verification Status
> - **PayPal Mock / Demo Mode:** **VERIFIED** — Fully tested and verified end-to-end via automated unit tests, integration tests, and browser UI smoke tests using synthetic identifiers.
> - **PayPal Sandbox:** **UNVERIFIED** — Real PayPal sandbox credentials have not been configured or tested in this demo environment. No external network requests are sent to PayPal.
> - **PayPal Live:** **UNVERIFIED** — Live PayPal mode is not enabled and real funds are never processed.
> - **Notice:** All demo purchases display the prominent notice: **"Demo payment — no real payment processed"**.

---

## Architecture & Security Highlights

1. **Deterministic Anonymous Shopping Sessions:**
   - CSPRNG-generated bearer token (`pp_sess_...`) issued upon session creation.
   - Only the SHA-256 hash is persisted in the database (`access_token_hash`).
   - Constant-time verification (`hmac.compare_digest`) protects all cart, checkout, order, and payment endpoints. UUID possession alone never grants access.

2. **Two-Stage Checkout with Signed Preview Tokens (Tamper Detection):**
   - **Stage 1 (Preview):** Calculates totals, validates item stock, and generates an HMAC-SHA256 signature binding the `session_id`, `cart_version`, item fingerprint (IDs, quantities, prices), currency, and a 10-minute expiry. The checkout preview uses this signed token designed to detect tampering.
   - **Stage 2 (Confirmation):** Re-verifies HMAC token signature, verifies cart has not mutated, acquires row-level pessimistic locks (`SELECT ... FOR UPDATE`), creates the order, and reserves stock for 15 minutes.

3. **Atomic Stock Hold & Sweeper Lifecycle:**
   - Stock is **held** (`held`) upon order confirmation with a 15-minute reservation TTL.
   - Stock is **committed** (`committed`) upon successful payment capture (or simulated demo capture).
   - Overdue reservations are automatically swept and released by an in-process lifespan worker (or cron/CLI) using PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) and `FOR UPDATE SKIP LOCKED`.

4. **Synthetic Demo Payment Flow with Production Guards:**
   - Supports realistic demo flows using synthetic identifiers (`DEMO-PAYPAL-ORD-...`, `DEMO-PAYER-...`).
   - Payment approval, failure, retry, and capture are simulated. No real payment is processed.
   - PayPal Sandbox and Live integrations remain unverified.
   - Includes failure simulation and multi-attempt retry without losing cart items or active stock holds.
   - **Production Guard:** Application startup is actively rejected if `APP_ENV=production` and `PAYPAL_MODE` is `mock` or `demo`. Mock payment captures are strictly blocked from marking orders `paid` in production.
   - **No Silent Fallback:** Sandbox or live PayPal failures never silently fall back to mock mode; they fail explicitly.

5. **AI Shopping Assistant Grounded in Seeded Catalog:**
   - Interactive conversational assistant powered by Google Gemini (or synthetic mock provider).
   - Recommendations are grounded in the seeded demo catalog and its stored product attributes.
   - Backend rules enforce budget, stock, and other hard constraints regardless of model output.

---

## Local Windows Setup & Demo Guide

Follow these exact steps to set up and run the application locally on Windows.

### 1. Prerequisites

- **Operating System:** Windows 10 or Windows 11
- **Python:** 3.12+ (tested on Python 3.14)
- **Node.js:** 18+ and npm (tested on Node v20+)
- **PostgreSQL:** 16 (local Windows service or Docker)
- **Git** (optional, for version control)

---

### 2. PostgreSQL Database Setup (Least-Privilege Role)

> [!WARNING]
> **Do NOT run the application as the database admin or superuser!**  
> The application and worker must always run as the dedicated, unprivileged `paypilot` application role (`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`), restricted to ownership of only `paypilot_dev` and `paypilot_test`. The database admin account (`postgres`) is used strictly for initial role and database provisioning.

Open PowerShell or Command Prompt. Ensure your PostgreSQL service is running.

#### Option A: Local Windows PostgreSQL Service (`psql`)
1. Connect to PostgreSQL using your administrative account:
   ```cmd
   psql -U postgres
   ```
2. Execute the provisioning SQL to create the restricted role and application databases:
   ```sql
   -- 1. Create the dedicated application role with restricted privileges
   CREATE ROLE paypilot WITH LOGIN PASSWORD '<LOCAL_DB_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE;

   -- 2. Create development and test databases owned by the paypilot role
   CREATE DATABASE paypilot_dev OWNER paypilot;
   CREATE DATABASE paypilot_test OWNER paypilot;

   -- 3. Grant access and schema management permissions to the application role
   GRANT ALL PRIVILEGES ON DATABASE paypilot_dev TO paypilot;
   GRANT ALL PRIVILEGES ON DATABASE paypilot_test TO paypilot;
   \q
   ```
   *(If the `paypilot` role already exists on your machine, ensure superuser is revoked:* `ALTER ROLE paypilot WITH NOSUPERUSER NOCREATEDB NOCREATEROLE;`*)*

#### Option B: Docker on Windows
1. Start a PostgreSQL container with a separate administrative superuser account (`postgres`). Choose a secure local administrative password (`<LOCAL_ADMIN_PASSWORD>`) and bind the port strictly to the loopback interface (`127.0.0.1`) so it is not exposed on external or local network interfaces:
   ```cmd
   docker run --name paypilot-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=<LOCAL_ADMIN_PASSWORD> -p 127.0.0.1:5432:5432 -d postgres:16
   ```

2. Provision the restricted `paypilot` application role and databases.  
   *(Note: In PostgreSQL, `CREATE DATABASE` cannot execute inside a multi-statement transaction block. Run each statement in its own `psql -c` invocation outside a transaction):*
   ```cmd
   :: 1. Create the dedicated application role (NOSUPERUSER, NOCREATEDB, NOCREATEROLE)
   docker exec -i paypilot-postgres psql -U postgres -d postgres -c "CREATE ROLE paypilot WITH LOGIN PASSWORD '<LOCAL_DB_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE;"

   :: 2. Create the development database (executed outside transaction)
   docker exec -i paypilot-postgres psql -U postgres -d postgres -c "CREATE DATABASE paypilot_dev OWNER paypilot;"

   :: 3. Create the test database (executed outside transaction)
   docker exec -i paypilot-postgres psql -U postgres -d postgres -c "CREATE DATABASE paypilot_test OWNER paypilot;"

   :: 4. Grant access and schema permissions to the application role
   docker exec -i paypilot-postgres psql -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE paypilot_dev TO paypilot;"
   docker exec -i paypilot-postgres psql -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE paypilot_test TO paypilot;"
   ```

---

### 3. Backend Setup (Python Virtual Environment)

From the project root (`Paypilot AI`):

1. **Create and activate the virtual environment:**
   ```cmd
   python -m venv .venv
   .venv\Scripts\activate
   ```

2. **Upgrade pip and install dependencies in editable mode:**
   ```cmd
   python -m pip install --upgrade pip
   pip install -e ".[dev]"
   ```

3. **Configure the backend environment file:**
   Copy `.env.example` to `.env`:
   ```cmd
   copy .env.example .env
   ```

   Verify the following demo defaults in `.env` (using your local password placeholder):
   ```env
   APP_ENV=development
   APP_DEBUG=true
   APP_SECRET_KEY=dev-secret-key-at-least-16-chars-long
   DATABASE_URL=postgresql+asyncpg://paypilot:<LOCAL_DB_PASSWORD>@localhost:5432/paypilot_dev
   TEST_DATABASE_URL=postgresql+asyncpg://paypilot:<LOCAL_DB_PASSWORD>@localhost:5432/paypilot_test
   PAYPAL_MODE=mock
   LLM_PROVIDER=mock
   STOCK_SWEEP_ENABLED=true
   STOCK_SWEEP_INTERVAL_SECONDS=60
   ```
   > [!NOTE]
   > Setting `PAYPAL_MODE=mock` enables the self-contained demo flow without requiring PayPal credentials. Setting `LLM_PROVIDER=mock` enables synthetic AI recommendations. If you wish to use live Gemini, set `LLM_PROVIDER=gemini` and add your `LLM_API_KEY`.

4. **Run Alembic database migrations:**
   ```cmd
   .venv\Scripts\alembic upgrade head
   ```

5. **Seed the demo product catalog:**
   Populates 20 curated tech & gear items across 5 categories with pricing and stock:
   ```cmd
   .venv\Scripts\python -m app.seed.catalog
   ```

---

### 4. Frontend Setup (React + Vite)

From the project root, open a separate terminal:

1. **Navigate to the frontend directory:**
   ```cmd
   cd frontend
   ```

2. **Install Node dependencies:**
   ```cmd
   npm install
   ```

3. **Configure the frontend environment file:**
   ```cmd
   copy .env.example .env
   ```
   Verify that `frontend\.env` contains:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8000
   ```

---

### 5. Running the Application Locally

#### Terminal 1 — Start Backend Server:
```cmd
.venv\Scripts\uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```
- **Backend API:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **API Liveness Probe:** [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- **API Readiness Probe:** [http://127.0.0.1:8000/api/v1/health/ready](http://127.0.0.1:8000/api/v1/health/ready)

#### Terminal 2 — Start Frontend Dev Server:
```cmd
cd frontend
npm run dev
```
- **Web Application:** [http://localhost:5173](http://localhost:5173)

---

## Detailed Mock Payment Flow Walkthrough

The demo payment flow provides a realistic experience of a payment gateway while maintaining data integrity:

```
[ Cart ] ──> [ Checkout Preview ] ──> [ Confirm Order ] ──> Stock Held (15 min)
                                                                 │
                                ┌────────────────────────────────┴────────────────────────────────┐
                                ▼                                                                 ▼
                   [ Simulate Payment Failure ]                                      [ Simulate Buyer Approval ]
                                │                                                                 │
                                ▼                                                                 ▼
                     Status: Payment Failed                                             Status: Approved
                     (Stock Hold Maintained)                                                      │
                                │                                                                 ▼
                                ▼                                                   [ Verify & Capture Payment ]
                     [ Click Retry Payment ]                                                      │
                                │                                                                 ▼
                                └─────────> (Creates Attempt #2) ───────────────> Stock Committed & Order PAID
```

### Steps in the Demo:

1. **Add Product to Cart & Open Preview:**
   - Browse the catalog on [http://localhost:5173](http://localhost:5173) and click **Add to Cart**.
   - Click the Cart button in the top navigation to open the cart drawer, then click **Review Checkout Preview**.
   - In the Checkout Preview modal, review the locked rates and validated total, check the **Explicit Shopper Confirmation** checkbox, and click **Confirm Order & Reserve Stock**.
   - The backend locks inventory rows and places a 15-minute temporary reservation on your items.

2. **Notice Banner:**
   - The Payment Modal displays the clear banner:
     > **Demo payment — no real payment processed** (`Synthetic Demo`)
   - A synthetic order identifier is generated (e.g. `DEMO-PAYPAL-ORD-A1B2C3D4`).

3. **Simulating a Payment Failure & Retrying:**
   - Click **Simulate Payment Failure (Test Retry Flow)**.
   - The backend transitions the payment attempt to `capture_failed` with the reason `"Simulated payment failure (insufficient buyer funds in demo mode)"`.
   - The order status updates to `payment_failed`, but the inventory reservation remains active.
   - Click **Retry Payment (Attempt #2)** to start a fresh attempt without losing your cart or reservation.

4. **Simulating Buyer Approval & Capturing:**
   - On Attempt #2, click **Simulate Buyer Approval**.
   - The status updates to `approved`.
   - Click **Verify & Capture Demo Payment**.
   - The backend atomically captures the payment, commits the inventory stock (`committed`), marks the order as `PAID`, and records each payment attempt in the audit trail.

5. **Viewing the Order Receipt:**
   - Click **View Order Receipt**.
   - The receipt displays status `PAID` alongside the banner:
     > **Demo payment — no real payment processed** (`Synthetic Mock`)
   - An audit trail listing Attempt #1 (`CAPTURE_FAILED`) and Attempt #2 (`CAPTURED`) is clearly presented.

---

## 3-Minute Hackathon Demo Script

This screen-by-screen presentation script covers the complete end-to-end shopping and payment journey in 3 minutes, matching the actual browser-tested UI exactly.

> [!NOTE]
> **Demo Notice & Provider Verification Status:**
> - Recommendations are grounded in the seeded demo catalog and its stored product attributes.
> - Backend rules enforce budget, stock, and other hard constraints.
> - The checkout preview uses a signed token designed to detect tampering.
> - Payment approval, failure, retry, and capture are simulated. No real payment is processed.
> - PayPal Sandbox and Live integrations remain unverified.

---

### Minute 1: Seeded Catalog, Attribute Comparison & Grounded Assistant (0:00 – 1:00)

* **Screen:** Product Catalog (`http://localhost:5173`)
* **Actions:**
  1. Point out the category filters, stock level tags, and the active session indicator in the navigation bar (`Session ...`).
  2. Click the compare button (`+`) on two items (e.g. *MacBook Pro 14"* and *Garmin Epix Pro*).
  3. Click **Compare (2)** in the navigation bar to open the **Side-by-Side Product Comparison** modal, review stored attributes, and close the modal.
* **Talking Points:**
  > *"Welcome to PayPilot AI. We pair conversational shopping guidance with deterministic backend transaction safeguards.*
  > *Shoppers can easily compare stored product attributes, specifications, and pricing side-by-side directly from the seeded demo catalog."*

* **Screen:** AI Shopping Assistant Tab
* **Actions:**
  1. Click the **AI Assistant** tab in the navigation bar.
  2. Click the quick prompt: *"Noise-canceling headphones for air travel under $400"*.
  3. Show the ranked recommendation card (*Sony WH-1000XM5* at $399.99) and click **Add to Cart**.
* **Talking Points:**
  > *"Recommendations are grounded in the seeded demo catalog and its stored product attributes.*
  > *Backend rules enforce budget, stock, and other hard constraints before suggestions are presented to the shopper. We can add the recommended headphones straight to our cart."*

---

### Minute 2: Two-Stage Checkout with Signed Preview & Stock Reservation (1:00 – 2:00)

* **Screen:** Cart Drawer & Checkout Preview Modal
* **Actions:**
  1. Click the Cart button in the navigation bar to open the **Your Shopping Cart** drawer, then click **Review Checkout Preview**.
  2. In the **Checkout Preview & Binding** modal, review the itemized breakdown, locked prices, signed preview token snippet, and expiration timer (`Expires at ...`).
  3. Check the **Explicit Shopper Confirmation** checkbox and click **Confirm Order & Reserve Stock**.
* **Talking Points:**
  > *"To protect against client-side price modification and inventory race conditions, PayPilot uses a two-stage checkout:*
  > *Stage 1: The checkout preview uses a signed token designed to detect tampering. It cryptographically binds the cart version, item fingerprint, prices, and expiration timestamp using HMAC-SHA256.*
  > *Stage 2: Upon confirmation, the backend verifies the signature, confirms the cart hasn't changed, queries database inventory with row-level locks (`SELECT ... FOR UPDATE`), and places a temporary 15-minute stock hold so inventory isn't oversold while the customer pays."*

---

### Minute 3: Simulated Payment Failure, Retry, Capture & Receipt (2:00 – 3:00)

* **Screen:** Demo Payment Checkout Modal
* **Actions:**
  1. Point out the notice banner: **"Demo payment — no real payment processed"** (marked `Synthetic Demo`).
  2. Click **Simulate Payment Failure (Test Retry Flow)**. Show that Attempt #1 fails with `payment_failed` while the 15-minute inventory reservation remains active.
  3. Click **Retry Payment (Attempt #2)** to start a fresh attempt without re-entering checkout.
  4. Click **Simulate Buyer Approval**, then click **Verify & Capture Demo Payment**.
  5. Once captured, click **View Order Receipt**.
* **Screen:** Order Receipt Modal
* **Actions:**
  1. Point out the order status: **PAID**.
  2. Point out the receipt banner: **"Demo payment — no real payment processed"** (marked `Synthetic Mock`).
  3. Review the **Payment Attempts Audit Trail** showing Attempt #1 (`CAPTURE_FAILED`) and Attempt #2 (`CAPTURED`).
  4. Click **Close Receipt**.
* **Talking Points:**
  > *"Payment approval, failure, retry, and capture are simulated. No real payment is processed, and PayPal Sandbox and Live integrations remain unverified.*
  > *We deliberately simulate payment failure to demonstrate resilience: Attempt #1 fails, but our backend preserves the active inventory hold so the customer never loses their cart.*
  > *With one click, we retry, simulate buyer approval, and simulate payment capture. The backend commits the held inventory and records each payment attempt in the payment attempts audit trail."*

---

## Security, Exclusions, and Git Hygiene

All secret credentials, environment configurations, virtual environments, build artifacts, and local databases are strictly excluded from version control via `.gitignore`:

- **Environment variables:** `.env`, `.env.*`, `frontend/.env`, `frontend/.env.*` (only `.env.example` files are tracked).
- **Credentials & certificates:** `*.pem`, `*.key`, `*.cert`.
- **Virtual environments:** `.venv/`, `venv/`, `ENV/`.
- **Node & Dependencies:** `node_modules/`, `frontend/node_modules/`.
- **Build Output:** `dist/`, `build/`, `frontend/dist/`, `frontend/dist-ssr/`.
- **Local Database Files:** `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-wal`, `*.db-shm`.
- **Caches:** `.pytest_cache/`, `.ruff_cache/`, `.oxlint_cache/`.

---

## Verifying the Test & Quality Suite

Run these automated checks locally on Windows to verify backend tests, linting, frontend linting, and production compilation:

```cmd
:: 1. Run all backend tests (86 tests)
.venv\Scripts\pytest -v

:: 2. Run Python linting and code style checks
.venv\Scripts\ruff check app tests

:: 3. Run frontend linter (oxlint)
cd frontend
npm run lint

:: 4. Run frontend TypeScript check & production build
npm run build
```

### Current Verification Results:
- **Pytest:** 86/86 tests passed (100% pass rate).
- **Ruff:** 0 errors across all application and test modules.
- **Frontend Oxlint:** 0 warnings, 0 errors across 18 files.
- **Frontend Build:** Completed successfully (`tsc -b && vite build`) with 0 errors.

---

## Continuous Integration (GitHub Actions)

A full CI workflow is configured in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) to automatically validate all pushes and pull requests:
- **Backend Job:** Starts a clean PostgreSQL 16 service container, installs dependencies, validates linting (`ruff check`), provisions test databases, executes Alembic migrations (`alembic upgrade head`), verifies catalog seeding (`python -m app.seed.catalog`), and runs the complete pytest test suite.
- **Frontend Job:** Sets up Node.js 20, installs dependencies, validates code style with oxlint (`npm run lint`), and verifies production TypeScript compilation (`npm run build`).

---

## Staging Deployment Preparation

PayPilot AI provides a containerized multi-tier staging deployment setup powered by Docker Compose. For the full guide and operational runbook, see [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md).

### Quick Staging Start:
```bash
# 1. Prepare environment files
cp .env.staging.example .env.staging
cp frontend/.env.staging.example frontend/.env.staging

# 2. Build and launch staging services (PostgreSQL 16, FastAPI backend, Nginx frontend)
docker compose -f docker-compose.staging.yml up -d --build

# 3. Apply schema migrations
docker compose -f docker-compose.staging.yml run --rm backend alembic upgrade head

# 4. Seed product catalog
docker compose -f docker-compose.staging.yml run --rm backend python -m app.seed.catalog

# 5. Verify health probes
curl -f http://localhost:8080/api/v1/health
curl -f http://localhost:8080/api/v1/health/ready
```

- **Staging Web App:** [http://localhost:8080](http://localhost:8080)
- **Payment Mode:** Explicitly set to `mock`. Real funds are never processed.
- **Role Isolation:** Database managed by restricted `paypilot` user (`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`).

### Zero-Cost Cloud Staging (Render Free + Neon Free):
For a 100% zero-cost cloud staging deployment on Render and Neon serverless PostgreSQL, see the dedicated guide: [RENDER_NEON_DEPLOYMENT.md](RENDER_NEON_DEPLOYMENT.md) and 1-click blueprint [`render.yaml`](render.yaml).

---

## Manual Prerequisites & Troubleshooting

| Issue | Resolution |
| :--- | :--- |
| **PostgreSQL connection refused (`localhost:5432`)** | Ensure the PostgreSQL service is started in Windows Services (`services.msc`) or start your Docker PostgreSQL container. |
| **`alembic upgrade head` error** | Verify database credentials in `.env` match your local PostgreSQL user (`paypilot:paypilot`). Ensure `paypilot_dev` database exists. |
| **`APP_ENV=production` startup rejection** | By design, production rejects startup if `PAYPAL_MODE` is `mock`/`demo` or if `APP_SECRET_KEY` is a default value. Keep `APP_ENV=development` for local demos. |
| **Port 8000 or 5173 already in use** | Stop any existing processes using the ports or supply `--port <new_port>` to uvicorn/vite. |

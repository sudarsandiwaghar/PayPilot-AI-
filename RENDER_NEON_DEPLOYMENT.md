# PayPilot AI — Zero-Cost Staging Deployment Guide (Render Free + Neon Free)

This guide provides instructions for deploying **PayPilot AI** to a completely free staging environment using **Render Free** (for the web service and static site) and **Neon Free** (for serverless PostgreSQL).

---

## 1. Target Architecture & Free-Tier Characteristics

```
┌───────────────────────────────────────────────┐
│              Browser Shopper                  │
│   https://paypilot-frontend.onrender.com      │
└───────────────┬───────────────────────────────┘
                │
                │ 1. Direct Public HTTPS API Calls (CORS enabled)
                │    Origin: https://paypilot-frontend.onrender.com
                ▼
┌───────────────────────────────────────────────┐
│       Render Free Web Service (Backend)       │
│      https://paypilot-backend.onrender.com    │
│  - Runtime: Docker (FastAPI + Uvicorn)        │
│  - Auto-sleep after 15 min inactivity         │
│  - Dynamic PORT binding ($PORT injected)      │
│  - Startup: Alembic upgrade & Catalog seed    │
│  - Liveness probe: /api/v1/health             │
└───────────────┬───────────────────────────────┘
                │
                │ 2. TLS Connection (asyncpg)
                │    postgresql+asyncpg://...ssl=require
                ▼
┌───────────────────────────────────────────────┐
│           Neon Free PostgreSQL (DB)           │
│         ep-cool-1234.us-east-2.neon.tech      │
│  - Serverless PostgreSQL 16                   │
│  - Auto-suspend after 5 min inactivity        │
│  - 1 GB storage, 100 compute-unit-hours/month │
└───────────────────────────────────────────────┘
```

### Free-Tier Quotas & Operational Realities

| Platform Component | Free Tier Resource Limit | Inactivity Behavior | Cold-Start Wake Time | Best Practice |
| :--- | :--- | :--- | :--- | :--- |
| **Backend (Render Web Service)** | 0.1 CPU, 512 MB RAM | Spins down (sleeps) after 15 minutes of zero HTTP traffic. | ~30 – 50 seconds on the first incoming HTTP request. | **For demo purposes only.** The first page load or API request will take ~40s while Render boots the container. Subsequent requests are fast (<100ms). |
| **Frontend (Render Static Site)** | 100 GB/month bandwidth | Never sleeps. Served globally via Render's CDN. | Instant (<50ms). | SPA routing rewrite (`/*` -> `/index.html`) ensures deep links work without 404s. |
| **Database (Neon Serverless Postgres)** | 1 GB storage, 100 compute-unit-hours (CU-hrs) / month | Auto-suspends compute after 5 minutes of no queries. | ~1 – 3 seconds to resume compute. | **Never ping the backend 24/7 with an external uptime monitor** (such as UptimeRobot), as keeping the backend awake will keep the stock sweeper polling Neon and burn your 100 free monthly compute hours in ~4 days! Allow Render and Neon to co-sleep when no demo is active. |

---

## 2. Database Setup on Neon Free

1. Log into your [Neon Console](https://console.neon.tech/) (free account, no credit card required).
2. Create a new project (e.g., `paypilot-staging`).
3. Neon will present your connection string in the dashboard:
   ```text
   postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require
   ```
4. **Convert for SQLAlchemy / asyncpg Compatibility:**
   - Change the driver prefix from `postgresql://` (or `postgres://`) to **`postgresql+asyncpg://`**.
   - Change `sslmode=require` to **`ssl=require`** (asyncpg expects `ssl`, not `sslmode`).
   - Your final connection URL must match this format:
     ```text
     postgresql+asyncpg://[user]:[password]@[endpoint].neon.tech/neondb?ssl=require
     ```
   *(Note: PayPilot AI's configuration automatically normalizes `postgres://` and `sslmode=require` if pasted, but supplying `postgresql+asyncpg://` and `ssl=require` directly is recommended).*

---

## 3. Deployment Option A: 1-Click Render Blueprint (`render.yaml`)

PayPilot AI includes a pre-configured, tested Render Blueprint in [`render.yaml`](render.yaml).

### Steps:
1. Log into the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository: `sudarsandiwaghar/PayPilot-AI-`.
4. Render will parse [`render.yaml`](render.yaml) and display the two services to create:
   - **`paypilot-backend`** (Docker Web Service, Plan: Free)
   - **`paypilot-frontend`** (Static Site, Plan: Free)
5. Under the environment variables prompt for `paypilot-backend`:
   - Enter your Neon connection URL into the **`DATABASE_URL`** field:
     `postgresql+asyncpg://[user]:[password]@[endpoint].neon.tech/neondb?ssl=require`
6. Click **Apply**.
7. Render will automatically build the backend Docker container, provision the static frontend site, and launch the staging environment.

---

## 4. Deployment Option B: Manual Render Dashboard Setup

If you prefer configuring the services manually through the Render UI:

### Step 1: Create the Backend Web Service
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select your GitHub repository (`PayPilot-AI-`).
3. Configure the following fields:
   - **Name:** `paypilot-backend`
   - **Region:** Any (e.g., `Oregon (US West)` or matching your Neon region)
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `./Dockerfile`
   - **Docker Context:** `.`
   - **Instance Type:** `Free`
4. Expand **Advanced** -> **Health Check Path**:
   - Set to: `/api/v1/health`
5. Under **Environment Variables**, add:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `APP_ENV` | `staging` | Staging runtime guards |
   | `APP_DEBUG` | `false` | Disable debug stack traces |
   | `APP_LOG_LEVEL` | `INFO` | Standard staging logging |
   | `APP_SECRET_KEY` | *(Click "Generate" or paste 32+ hex chars)* | HMAC preview token secret |
   | `DATABASE_URL` | `postgresql+asyncpg://[user]:[password]@[endpoint].neon.tech/neondb?ssl=require` | Your Neon connection string |
   | `PAYPAL_MODE` | `mock` | Enforce synthetic mock payments |
   | `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` | PayPal endpoint (skipped in mock) |
   | `STOCK_SWEEP_ENABLED` | `true` | Enable background stock sweep |
   | `STOCK_SWEEP_INTERVAL_SECONDS` | `600` | 10-min interval (> Neon 5-min auto-suspend) |
   | `LLM_PROVIDER` | `mock` | Mock shopping agent (no API key needed) |
   | `CORS_ORIGINS` | `["https://paypilot-frontend.onrender.com"]` | Exact frontend URL |
   | `AUTO_MIGRATE` | `true` | Auto-run Alembic migrations on boot |
   | `AUTO_SEED` | `true` | Auto-seed 20 catalog products on boot |
6. Click **Create Web Service**. Note the public URL (e.g., `https://paypilot-backend.onrender.com`).

---

### Step 2: Create the Frontend Static Site
1. In Render Dashboard, click **New +** -> **Static Site**.
2. Select your GitHub repository (`PayPilot-AI-`).
3. Configure the following fields:
   - **Name:** `paypilot-frontend`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm ci && npm run build`
   - **Publish Directory:** `dist`
4. Under **Redirects/Rewrites**:
   - Click **Add Rule**
   - **Type:** `Rewrite`
   - **Source:** `/*`
   - **Destination:** `/index.html`
5. Under **Environment Variables**:
   - **`VITE_API_BASE_URL`**: `https://paypilot-backend.onrender.com` *(Point to your backend URL from Step 1, without a trailing slash)*.
6. Click **Create Static Site**.

---

## 5. Startup, Migrations & Seeding Behavior

When the backend container boots on Render (both on initial deploy and upon waking up from cold sleep):

1. **[`scripts/start.sh`](scripts/start.sh)** executes:
   - Runs `alembic upgrade head`. If the database is already migrated, Alembic validates the schema version and exits in ~50ms.
   - Runs `python -m app.seed.catalog`. The seed script inspects each product by its unique `sku`. If all 20 products exist, it commits 0 records and finishes in ~100ms.
   - Reads Render's assigned **`PORT`** environment variable (e.g. `10000`) and launches Uvicorn:
     ```sh
     exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
     ```
2. Render's health check sends an HTTP GET to `/api/v1/health` and marks the service healthy.

---

## 6. Stock Sweeper & Neon Quota Deep Dive

### Neon Free Compute Model: CU-Hours vs. Active Hours
Neon Serverless PostgreSQL does **not** meter simply by wall-clock uptime. Instead, consumption is measured in **Compute Unit hours (CU-hours)**:
$$\text{CU-hours Consumed} = \text{Allocated Compute Units (CU)} \times \text{Active Wall-Clock Hours}$$

On the Neon Free tier:
- You receive **100 CU-hours per calendar month** and **1 GB storage**.
- The compute endpoint automatically suspends (scales to zero) after **5 minutes (300 seconds) of query inactivity**.
- Any incoming connection or query resets the 5-minute idle countdown back to zero.
- When suspended, compute consumption is **0 CU-hours**.

#### Sample Usage Estimates Across Compute Assumptions
> [!NOTE]
> The figures below are **theoretical sample estimates, not measured usage**. Neon supports fractional compute scaling down to 0.25 CU in configurable projects, while standard compute operates at 1.00 CU. The actual minimum compute size depends on your Neon project configuration and regional availability; it is not guaranteed to be 0.25 CU unless configured. Actual consumption varies based on cold-start wake durations, query bursts, connection pool keep-alive traffic, and Neon autoscaling policies.

| Compute Size Assumption | Hardware Baseline | Consumption Rate | Continuous Active Clock Hours Allowed by 100 CU-hr Quota (Theoretical Estimate) |
| :--- | :--- | :--- | :--- |
| **Assuming 0.25 CU** | Fractional compute allocation (~0.25 vCPU, 1 GB RAM) | 0.25 CU-hours / active hour | **~400 active wall-clock hours / month** ($100 / 0.25$) |
| **Assuming 1.00 CU** | Standard 1 vCPU baseline (~1 vCPU, 4 GB RAM) | 1.00 CU-hour / active hour | **~100 active wall-clock hours / month** ($100 / 1.00$) |

#### Theoretical Scenario: 50 Minutes of Database Compute
Consider an explicit scenario assuming **50 minutes of cumulative database compute** within a billing cycle:

> [!IMPORTANT]
> **Understanding Database vs. Web Service Idle Dynamics:**
> 30 minutes of user browsing plus Render's 15-minute web service inactivity timeout does **not** automatically mean 50 minutes of Neon database compute.
> - **Neon's 5-minute auto-suspend timer starts immediately following the last database query**, not after the Render backend container spins down.
> - For example, if a shopper finishes their last checkout query at $t=30$ minutes and closes their browser, Neon's idle countdown begins at $t=30$ minutes. If no background query runs, Neon will auto-suspend at $t=35$ minutes, running in parallel with Render's HTTP idle timer (which sleeps at $t=45$ minutes).
> - However, if background jobs (such as the 600-second stock sweeper) execute queries while Render is waiting to sleep, each sweep briefly touches the database and resets Neon's 5-minute timer.
> - Therefore, real compute consumption depends on exact query timings rather than an additive formula. The 50-minute figure below is strictly an **illustrative scenario** to demonstrate CU-hour math under different compute allocations.

- **Assuming 0.25 CU (Theoretical Scenario):**
  $$\text{Estimated Consumption} = 0.25\text{ CU} \times \left(\frac{50}{60}\text{ hours}\right) \approx \mathbf{0.21\text{ CU-hours}}$$
  *(Theoretical estimate: a 100 CU-hr monthly allowance would theoretically support ~480 such 50-minute compute sessions).*
- **Assuming 1.00 CU (Theoretical Scenario):**
  $$\text{Estimated Consumption} = 1.00\text{ CU} \times \left(\frac{50}{60}\text{ hours}\right) \approx \mathbf{0.83\text{ CU-hours}}$$
  *(Theoretical estimate: a 100 CU-hr monthly allowance would theoretically support ~120 such 50-minute compute sessions).*

*(All session counts, compute sizes, and monthly projections above are theoretical scenario estimates, not measured usage. Neon does not guarantee a 0.25 CU minimum compute size across all tiers and regions without project configuration verification).*

---

### Reassessing the 300-Second Sweeper Interval
In earlier planning, setting `STOCK_SWEEP_INTERVAL_SECONDS=300` (5 minutes) was considered. However, a rigorous reassessment shows:
- **Why 300s Does NOT Protect Quota:** Neon's auto-suspend window is exactly 300 seconds. If a background worker executes a query every 300 seconds, the idle duration between queries is roughly 300 seconds. Due to async scheduling jitter, connection pool health checks, and query execution latency, the idle period will almost certainly fall *at or under* 300 seconds, preventing Neon's auto-suspend countdown from ever triggering.
- **Thrashing Risk:** Even if Neon does manage to suspend at exactly 300.0s, the sweeper immediately dispatches another query at 300.1s. This forces Neon to immediately cold-wake, creating severe thrashing (frequent cold-starts with 1–3s latency spikes and compute wake overhead).
- **Conclusion:** **A 300-second interval cannot be claimed to protect the quota without empirical measurement.** In practice, it either keeps Neon awake continuously or causes sleep-wake thrashing while Render is awake.

---

### Stock Reservation Expiry When Backend Sleeps & Wakes

When the Render backend enters cold sleep (after 15 minutes of HTTP inactivity) and later wakes up on an incoming request, stock reservation handling is protected by **two layers of defense**:

#### 1. In-Transaction Reclamation on New Reservations (Zero Falsely-Rejected Orders)
- **The Problem:** If Customer A placed items on hold (15-minute TTL) and abandoned checkout, and the backend then went to sleep for 3 hours, Customer A's hold expired while the backend was sleeping. If Customer B wakes the backend and attempts to reserve the remaining inventory before any background sweeper has run, a naive stock check would see `product.stock_qty == 0` and falsely reject Customer B with `InsufficientStock`.
- **The Solution:** In [`StockService.reserve_stock_for_order`](app/services/stock_service.py), PayPilot acquires a row lock on the requested `Product` (`SELECT ... FOR UPDATE`). Under this row lock, it queries for any expired reservations (`expires_at <= now`) for that product, transitions them to `status='released'`, cancels the abandoned order, and immediately restores `product.stock_qty += reclaimed_qty` **before** checking available stock.
- **Result:** Customer B's reservation succeeds immediately. Expired holds are reclaimed on-demand under full database concurrency control without overselling.

#### 2. Immediate Startup / Wake-Up Sweep in Background Worker
- **Startup Execution:** In [`app/main.py`](app/main.py), `_stock_sweep_worker` executes an immediate sweep of all expired reservations across the entire database upon startup/wake-up, before entering its periodic sleep loop.
- **Result:** Any holds that expired during downtime or cold sleep are proactively purged from the database within the first second of container boot.

#### 3. In-Flow Payment & Capture Protection
- **Payment Initiation (`create_payment_attempt`):** Rejects overdue holds synchronously in real-time, cancelling the order and restoring inventory.
- **Payment Capture (`capture_payment_attempt`):** Verifies hold validity prior to capture, preventing capture on expired reservations.

#### 4. Proposed Sweeper Interval: 600 Seconds (10 Minutes)
In [`render.yaml`](render.yaml) and [`.env.render.example`](.env.render.example), `STOCK_SWEEP_INTERVAL_SECONDS` is set to **`600`** (10 minutes):
- **Neon Sleep Window:** After a sweep finishes, Neon is idle for 5 minutes (300s) and auto-suspends. It then remains in suspended sleep for the remaining ~5 minutes before the next sweep wakes it (~50% duty cycle while Render is active).
- **Duty Cycle Estimates (Theoretical Baseline):**
  - **At assumed 0.25 CU:** ~0.125 CU-hours per wall-clock hour while Render is active.
  - **At assumed 1.00 CU:** ~0.50 CU-hours per wall-clock hour while Render is active.

---

### The Essential "No External Pinger" Rule
> [!WARNING]
> **Never attach an external uptime monitoring bot (UptimeRobot, Pingdom, BetterStack) to the Render Free service.**
>
> If an external bot pings the Render backend every 5 minutes to bypass Render's cold start:
> 1. Render Free will **never spin down** (720 hours/month).
> 2. The in-process sweeper worker will run continuously 24/7.
> 3. Running 24/7 at an assumed 1.00 CU consumes $\sim 360\text{ CU-hours/month}$ ($720\text{h} \times 0.50$), completely exhausting the 100 CU-hour quota in ~8 days!
>
> **The only safe free-tier staging strategy is natural co-sleeping:**
> When demo visitors leave, Render Free sleeps after 15 minutes of HTTP inactivity. Once Render sleeps, the Python sweeper task halts completely, allowing Neon to enter indefinite suspension 5 minutes later with 0 CU-hours consumed.

---

## 7. Fake-URL Configuration Testing vs. Real Provider Connection

### Critical Security & Connectivity Distinction

> [!IMPORTANT]
> **Database connectivity to Neon is currently UNVERIFIED.**
> Real connectivity can only be verified once you create your free project in the Neon console and enter your real connection string into the Render service dashboard.

1. **What Local & CI Configuration Tests Validate:**
   - Automated tests (such as [`tests/test_config_validators.py`](tests/test_config_validators.py) and local test scripts) use **synthetic fake URLs** (e.g., `postgresql://mockuser:mockpass@ep-demo-1234.us-east-2.neon.tech/neondb?sslmode=require`).
   - These tests strictly validate:
     - Driver scheme normalization: `postgres://` or `postgresql://` -> `postgresql+asyncpg://`
     - Parameter remapping: `sslmode=require` -> `ssl=require`
     - Pydantic Settings validation and error handling for malformed URLs.
   - **No network packets are sent to Neon during local tests.**
2. **Provider Secret Handling:**
   - **Never paste real database passwords, secrets, or connection strings into source code, documentation, pull requests, or chat prompts.**
   - Mark your database connection as **unverified** until you:
     1. Copy your connection URL from the [Neon Console](https://console.neon.tech/).
     2. Paste it directly into Render's secure Environment Variables dashboard (or during Blueprint sync for `DATABASE_URL`).
     3. Verify the `/api/v1/health/ready` check reports `"name": "postgresql", "status": "ok"`.

---

## 8. Staging Verification & Smoke Test Checklist

Once both services are deployed on Render:

1. **Verify Backend Liveness Probe:**
   ```bash
   curl -f https://paypilot-backend.onrender.com/api/v1/health
   ```
   *Expected response:* `{"status": "ok", "version": "0.1.0", "timestamp": "..."}`

2. **Verify Backend Readiness Probe (Real Database & Mock PayPal):**
   ```bash
   curl -f https://paypilot-backend.onrender.com/api/v1/health/ready
   ```
   *Expected response:*
   ```json
   {
     "status": "ready",
     "checks": [
       {"name": "postgresql", "status": "ok", "latency_ms": 25.4},
       {"name": "paypal", "status": "ok", "latency_ms": 0.0, "error": "Mock mode active — external network check skipped"}
     ]
   }
   ```
   *(If `postgresql` fails, verify your Neon endpoint is active and the password/database name are correct in Render's environment settings).*

3. **Verify Frontend Direct API Reachability & Mock Checkout:**
   - Open `https://paypilot-frontend.onrender.com` in your browser.
   - Open Browser DevTools -> **Network** tab.
   - Verify all API calls (e.g. `/api/v1/products`) resolve directly to `https://paypilot-backend.onrender.com` with HTTP 200 and valid CORS response headers (`access-control-allow-origin`).
   - Add a product to the cart, review the signed preview token, simulate payment, and complete the synthetic demo capture.


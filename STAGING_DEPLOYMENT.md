# PayPilot AI — Staging Deployment Guide & Runbook

This document specifies the deployment architecture, configuration, secrets management, and operational procedures for deploying **PayPilot AI** to a staging environment.

---

## 1. Architecture & Staging Philosophy

PayPilot AI's staging deployment mirrors production behavior while strictly guaranteeing financial safety:

- **Isolated Staging Database:** PostgreSQL 16 database (`paypilot_staging`) accessed exclusively via a restricted, least-privilege role (`paypilot`: `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`).
- **Deterministic Mock Payment Mode:** Explicitly enforced via `PAYPAL_MODE=mock`. Staging processes simulated payments with synthetic transaction IDs (`DEMO-PAYPAL-ORD-...`), preserving checkout token validation and inventory reservation workflows without transmitting requests to PayPal or processing real money.
- **Production Guard Parity:** Staging runs under `APP_ENV=staging`, `APP_DEBUG=false`, and `APP_LOG_LEVEL=INFO`. Secret keys must be high-entropy 32+ character strings generated specifically for staging.
- **Unified Reverse Proxy:** Nginx serves compiled static assets with SPA fallback (`try_files $uri /index.html`) and proxies `/api/` traffic directly to the FastAPI backend, eliminating cross-origin complications.

```
                              ┌──────────────────────────────────────────┐
                              │            Staging Client Host           │
                              │           http://<staging-host>:8080     │
                              └────────────────────┬─────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────┴──────────────────────────────────────────────────┐
│ Docker Network: paypilot-staging-net                                                                │
│                                                                                                     │
│   ┌────────────────────────────────┐                 ┌──────────────────────────────────────────┐   │
│   │  frontend (Nginx Alpine)       │   /api/ proxy   │  backend (FastAPI / Uvicorn)             │   │
│   │  - Port 8080 -> Container 80   ├────────────────>│  - Container port 8000                   │   │
│   │  - Static SPA (React + Vite)   │                 │  - Lifespan Stock Hold Sweeper (60s)     │   │
│   │  - Liveness / Readiness Proxy  │                 │  - Liveness: /api/v1/health              │   │
│   └────────────────────────────────┘                 │  - Readiness: /api/v1/health/ready       │   │
│                                                      └────────────────────┬─────────────────────┘   │
│                                                                           │                         │
│                                                                           ▼                         │
│                                                      ┌──────────────────────────────────────────┐   │
│                                                      │  db (PostgreSQL 16 Alpine)               │   │
│                                                      │  - Container port 5432 (Internal)        │   │
│                                                      │  - paypilot_staging (Owned by paypilot)  │   │
│                                                      │  - Persistent Volume: pgdata_staging     │   │
│                                                      └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Recommended Staging Setup vs. PaaS Alternatives

| Feature / Tradeoff | Option 1: Docker Compose Stack (Recommended) | Option 2: PaaS (Render / Railway / Vercel) |
| :--- | :--- | :--- |
| **Portability** | 100% portable to any Linux VM, AWS EC2, DigitalOcean Droplet, GCP Compute, or bare metal. | Dependent on PaaS provider configuration (`render.yaml`, railway templates). |
| **Networking & CORS** | Nginx reverse-proxies `/api/` to backend internally. Single domain, zero CORS errors. | Split domains (`paypilot-staging.vercel.app` & `paypilot-api.onrender.com`). Requires strict `CORS_ORIGINS`. |
| **Cold Starts** | Zero cold starts. Always-on staging availability. | Free/low tiers sleep after 15 minutes of inactivity; health checks may time out. |
| **Database Privileges**| Auto-provisions least-privilege `paypilot` role (`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`). | Managed databases default to superuser connection strings unless custom roles are manually configured. |
| **Operational Overhead** | Requires host Docker Engine and volume backups. | Managed patching and automated HTTPS/SSL. |

---

## 3. Environment Variable Matrix

Configure these variables in `.env.staging` (backend) and `frontend/.env.staging` (frontend):

| Variable | Environment | Required | Recommended Staging Value | Purpose & Security Note |
| :--- | :--- | :--- | :--- | :--- |
| `APP_ENV` | Backend | **Yes** | `staging` | Sets runtime environment. Disables development debug flags while permitting mock payments. |
| `APP_HOST` | Backend | **Yes** | `0.0.0.0` | Container bind address. |
| `APP_PORT` | Backend | **Yes** | `8000` | Internal backend port. |
| `APP_DEBUG` | Backend | **Yes** | `false` | Disables debug mode and verbose stack traces. |
| `APP_LOG_LEVEL` | Backend | **Yes** | `INFO` | Staging logging verbosity. |
| `APP_SECRET_KEY` | Backend | **Yes** | `openssl rand -hex 32` | **Secret.** Cryptographic HMAC key for signing checkout preview tokens. Must be ≥32 characters. |
| `DATABASE_URL` | Backend | **Yes** | `postgresql+asyncpg://paypilot:<PW>@db:5432/paypilot_staging` | **Secret.** Connection string using restricted `paypilot` role. |
| `PAYPAL_MODE` | Backend | **Yes** | `mock` | **Enforced.** Keeps payment simulation explicitly in mock mode. Never set to `sandbox` or `live` without verified credentials. |
| `PAYPAL_BASE_URL` | Backend | **Yes** | `https://api-m.sandbox.paypal.com` | Base endpoint tested by readiness probe. |
| `STOCK_SWEEP_ENABLED` | Backend | **Yes** | `true` | Runs the automatic 60-second stock hold sweeper in the background. |
| `STOCK_SWEEP_INTERVAL_SECONDS` | Backend | No | `60` | Sweep interval in seconds. |
| `LLM_PROVIDER` | Backend | **Yes** | `mock` (or `gemini`) | Use `mock` for deterministic demo shopping recommendations without external API dependencies. |
| `LLM_API_KEY` | Backend | Optional | `""` (or staging Gemini key) | **Secret.** Required only if `LLM_PROVIDER=gemini`. |
| `CORS_ORIGINS` | Backend | **Yes** | `["http://localhost:8080","https://staging.yourdomain.com"]` | JSON array of allowed browser origins. |
| `VITE_API_BASE_URL` | Frontend | No | `""` (empty string) | Kept empty when served behind Nginx reverse proxy (uses relative `/api/`). |

---

## 4. Secret Handling & Security Requirements

1. **Strict Version Control Exclusion:**
   - Real staging files (`.env.staging`, `frontend/.env.staging`) must **never** be committed to Git.
   - Verified in `.gitignore`:
     ```gitignore
     .env
     .env.*
     !.env.example
     !.env*.example
     ```
2. **Generating Cryptographic Keys:**
   - Generate `APP_SECRET_KEY`:
     ```bash
     openssl rand -hex 32
     ```
   - Generate database passwords:
     ```bash
     openssl rand -base64 24
     ```
3. **Database Least-Privilege Role:**
   - The application database connection **must not** use `postgres` or any superuser role.
   - The staging role `paypilot` must have:
     - `NOSUPERUSER`
     - `NOCREATEDB`
     - `NOCREATEROLE`

---

## 5. Step-by-Step Staging Deployment Runbook

### Prerequisites
- Host machine or VM with Linux/Windows/macOS
- Docker Engine 24.0+
- Docker Compose v2.20+ (`docker compose version`)
- Ports `8080` (or `80`) available on the host

---

### Step 1: Prepare the Staging Environment Files

On the staging server:

1. Copy the staging backend environment template:
   ```bash
   cp .env.staging.example .env.staging
   ```
2. Generate a secure 32+ byte secret key and database password, then edit `.env.staging`:
   ```bash
   # Generate secret key
   openssl rand -hex 32
   ```
   Set `APP_SECRET_KEY` and `DATABASE_URL` in `.env.staging`. Ensure `PAYPAL_MODE=mock` is maintained.

3. Copy the staging frontend environment template:
   ```bash
   cp frontend/.env.staging.example frontend/.env.staging
   ```

---

### Step 2: Build and Start the Staging Services

Start the database, backend, and frontend containers in detached mode:

```bash
docker compose -f docker-compose.staging.yml up -d --build
```

Verify that all three containers are healthy:

```bash
docker compose -f docker-compose.staging.yml ps
```

*Expected output:*
```
NAME                         IMAGE                  COMMAND                  SERVICE    STATUS
paypilot-staging-db          postgres:16-alpine     "docker-entrypoint.s…"   db         Up (healthy)
paypilot-staging-backend     paypilot-backend       "uvicorn app.main:ap…"   backend    Up (healthy)
paypilot-staging-frontend    paypilot-frontend      "nginx -g 'daemon of…"   frontend   Up (healthy)
```

---

### Step 3: Run Database Migrations

Apply Alembic migrations to create the required schema in `paypilot_staging`:

```bash
docker compose -f docker-compose.staging.yml run --rm backend alembic upgrade head
```

*Expected output:*
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 001_initial_schema
INFO  [alembic.runtime.migration] Running upgrade 001_initial_schema -> 002_add_stock_reservations
```

---

### Step 4: Seed the Demo Catalog

Populate the database with the 20 seeded catalog products:

```bash
docker compose -f docker-compose.staging.yml run --rm backend python -m app.seed.catalog
```

*Expected output:*
```
[INFO] Seeding catalog into database...
[INFO] Seeded 20 demo products across 5 categories successfully.
```

---

### Step 5: Verify Health Checks & Endpoints

1. **Liveness Probe (Process Heartbeat):**
   ```bash
   curl -f http://localhost:8080/api/v1/health
   ```
   *Expected Response (HTTP 200):*
   ```json
   {
     "status": "ok",
     "version": "0.1.0",
     "timestamp": "2026-10-24T04:30:00Z"
   }
   ```

2. **Readiness Probe (Dependency Connectivity):**
   ```bash
   curl -f http://localhost:8080/api/v1/health/ready
   ```
   *Expected Response (HTTP 200):*
   ```json
   {
     "status": "ready",
     "checks": [
       {"name": "postgresql", "status": "ok", "latency_ms": 1.25},
       {"name": "paypal", "status": "ok", "latency_ms": 42.1}
     ],
     "timestamp": "2026-10-24T04:30:00Z"
   }
   ```

3. **Frontend Application Access:**
   Open `http://<staging-host>:8080` in your web browser. Verify:
   - Product catalog loads with all 20 seeded items.
   - Category filtering and attribute comparison modals operate smoothly.
   - Shopping cart preview generates signed HMAC preview tokens.
   - Demo checkout completes with synthetic buyer approval and capture.

---

## 6. Alternative: Platform-as-a-Service (PaaS) Setup

If deploying to Render, Railway, or Fly.io:

1. **Managed PostgreSQL Database:**
   - Create a PostgreSQL 16 database.
   - Connect via administrative `psql` and create the restricted `paypilot` user:
     ```sql
     CREATE ROLE paypilot WITH LOGIN PASSWORD '<STRONG_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
     GRANT ALL PRIVILEGES ON DATABASE paypilot_staging TO paypilot;
     ```
2. **Backend Web Service (FastAPI):**
   - Source: Root directory.
   - Dockerfile: `./Dockerfile`.
   - Set environment variables as listed in Section 3 (`APP_ENV=staging`, `PAYPAL_MODE=mock`, `CORS_ORIGINS=["https://staging.yourdomain.com"]`).
   - Health check path: `/api/v1/health`.
   - Pre-deploy command: `alembic upgrade head && python -m app.seed.catalog`.
3. **Frontend Web Service (Static Site on Vercel / Cloudflare Pages / Netlify):**
   - Framework preset: Vite.
   - Root directory: `frontend`.
   - Build command: `npm run build`.
   - Output directory: `dist`.
   - Environment variable: `VITE_API_BASE_URL=https://<your-backend-paas-url>`.
   - SPA Rewrite Rule: Redirect all `/*` paths to `/index.html`.

---

## 7. Rollback & Maintenance Procedures

- **Container Logs Inspection:**
  ```bash
  docker compose -f docker-compose.staging.yml logs -f backend
  docker compose -f docker-compose.staging.yml logs -f frontend
  ```
- **Stopping the Staging Environment:**
  ```bash
  docker compose -f docker-compose.staging.yml down
  ```
- **Resetting Staging Database to Fresh State:**
  ```bash
  docker compose -f docker-compose.staging.yml down -v
  docker compose -f docker-compose.staging.yml up -d
  docker compose -f docker-compose.staging.yml run --rm backend alembic upgrade head
  docker compose -f docker-compose.staging.yml run --rm backend python -m app.seed.catalog
  ```

#!/bin/sh
set -e

# =================================================================
# PayPilot AI — Backend Container Entrypoint
# =================================================================
# 1. Runs database migrations (alembic upgrade head) if enabled.
# 2. Runs idempotent catalog seeding (python -m app.seed.catalog) if enabled.
# 3. Starts Uvicorn ASGI server binding to $PORT (Render) or $APP_PORT (default: 8000).

echo "[INFO] Starting PayPilot AI container initialization..."

# Run database migrations
if [ "${AUTO_MIGRATE:-true}" != "false" ]; then
    echo "[INFO] Running database migrations (alembic upgrade head)..."
    alembic upgrade head
    echo "[INFO] Migrations complete."
else
    echo "[INFO] AUTO_MIGRATE=false — skipping automatic migrations."
fi

# Seed demo product catalog (idempotent: skips existing SKUs)
if [ "${AUTO_SEED:-true}" != "false" ]; then
    echo "[INFO] Checking and seeding demo product catalog..."
    python -m app.seed.catalog
    echo "[INFO] Catalog check complete."
else
    echo "[INFO] AUTO_SEED=false — skipping automatic catalog seeding."
fi

# Determine port and host:
# Render automatically injects $PORT (e.g. 10000).
# For local Docker Compose or direct execution, defaults to $APP_PORT or 8000.
BIND_PORT="${PORT:-${APP_PORT:-8000}}"
BIND_HOST="${APP_HOST:-0.0.0.0}"

echo "[INFO] Starting Uvicorn server on ${BIND_HOST}:${BIND_PORT}..."
exec uvicorn app.main:app --host "${BIND_HOST}" --port "${BIND_PORT}"

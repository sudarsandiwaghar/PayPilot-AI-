#!/bin/sh
set -e

# =================================================================
# PayPilot AI — PostgreSQL Staging Database Initialization
# =================================================================
# Executed by the official postgres container on initial volume creation.
# Creates the restricted 'paypilot' application role without superuser
# privileges and assigns ownership of 'paypilot_staging'.

APP_USER="${PAYPILOT_DB_USER:-paypilot}"
APP_PASS="${PAYPILOT_DB_PASSWORD:-paypilot_staging_pass}"
DB_NAME="${POSTGRES_DB:-paypilot_staging}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NAME" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$APP_USER') THEN
            CREATE ROLE $APP_USER WITH LOGIN PASSWORD '$APP_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        ELSE
            ALTER ROLE $APP_USER WITH PASSWORD '$APP_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
    END
    \$\$;

    ALTER DATABASE $DB_NAME OWNER TO $APP_USER;
    GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $APP_USER;
    ALTER SCHEMA public OWNER TO $APP_USER;
    GRANT ALL ON SCHEMA public TO $APP_USER;
EOSQL

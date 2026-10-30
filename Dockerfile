FROM python:3.12-slim

WORKDIR /opt/app

# Install system deps for asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl && \
    rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .

COPY backend/ .
RUN chmod +x /opt/app/scripts/start.sh

EXPOSE 8000

CMD ["/opt/app/scripts/start.sh"]

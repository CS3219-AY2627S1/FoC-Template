# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-30
# Scope: Boilerplate generation — package Alembic configuration and revisions in the service image. Configure the bounded API health probe to use /ready (2026-09-29).
# Scope: Boilerplate generation — configure the existing image to copy module-relative seed metadata with supplier ownership while retaining application and Alembic files. (ai-20260930-012)
# Author review: Keith confirmed review of all affected changes. Keith confirmed review of the packaging changes (ai-20260930-012).
# Details: ai/usage-log.md; ai-20260929-001; ai-20260929-003; ai-20260930-012

# Use the Python version chosen for the service
FROM python:3.12-slim

# Set the working directory inside the image
WORKDIR /app

# Copy requirements.txt into the working directory
COPY supplier-service/requirements.txt .

# Install its dependencies using pip without caching downloads
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY packages/foc-observability /tmp/foc-observability
RUN python -m pip install --no-cache-dir /tmp/foc-observability

# Create the runtime user
RUN useradd --create-home --uid 10001 supplier

# Replace your existing application COPY with one that sets ownership.
COPY --chown=supplier:supplier supplier-service/app ./app
COPY --chown=supplier:supplier supplier-service/alembic.ini ./
COPY --chown=supplier:supplier supplier-service/migrations ./migrations
COPY --chown=supplier:supplier supplier-service/seed ./seed

# Switch subsequent instructions to the runtime user
USER supplier

# Document the container's listening port
EXPOSE 8080

# Probe the running API
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/ready', timeout=3)"

# Server command
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]

# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Boilerplate generation — package the API, worker, and Alembic files in one image with a non-root user, readiness health check, and uvicorn entrypoint, following credit-service conventions.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Boilerplate generation — add uvicorn --timeout-graceful-shutdown 5 so open notification streams do not hold up shutdown (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

FROM python:3.12-slim

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY notification-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/foc-observability /tmp/foc-observability
RUN pip install --no-cache-dir /tmp/foc-observability

COPY notification-service/alembic.ini .
COPY notification-service/alembic ./alembic
COPY notification-service/app ./app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/ready', timeout=3)"

# Open notification streams only end at SSE_MAX_LIFETIME_SECONDS. Stop waiting
# for them after 5 seconds, inside Docker's 10-second stop timeout, so shutdown
# still closes the LISTEN connection and the database pool.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", \
     "--timeout-graceful-shutdown", "5"]

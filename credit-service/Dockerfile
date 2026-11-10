# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Generated the Credit Service container build and runtime command for the API and
# consumer.
# Author review: I validated correctness and supplied additional boundary checks.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install .
RUN addgroup --system credit_service && adduser --system --ingroup credit_service credit_service
USER credit_service

EXPOSE 8003
HEALTHCHECK --interval=10s --timeout=7s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8003/health/ready', timeout=6)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]

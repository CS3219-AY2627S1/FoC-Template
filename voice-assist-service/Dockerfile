# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated Voice Assist package, container or local-development configuration.
# Author review: I validated correctness, and added boundary checks.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install .
RUN addgroup --system voice_assist && adduser --system --ingroup voice_assist voice_assist
USER voice_assist

EXPOSE 8006
HEALTHCHECK --interval=10s --timeout=7s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8006/health/ready', timeout=6)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8006", "--no-access-log"]

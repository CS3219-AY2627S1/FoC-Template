# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented the Order Python image build and API startup command.
# Author review: I validated correctness and added boundary checks where needed.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install .
RUN addgroup --system order_service && adduser --system --ingroup order_service order_service
USER order_service

EXPOSE 8002
HEALTHCHECK --interval=10s --timeout=7s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health/ready', timeout=6)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]

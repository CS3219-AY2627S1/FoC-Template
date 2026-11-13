# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-06
# Scope: Generated the initial Credit Service Docker setup using the sibling-service conventions
# Author review: I reviewed correctness and edited the changes to fit the project

FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.13 /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY src ./src

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 3002

CMD ["uvicorn", "main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "3002"]

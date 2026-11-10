# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Generated the Chat Service container build and startup configuration.
# Author review: I validated correctness and added boundary checks where needed.

FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY app ./app
RUN pip install --no-cache-dir uv==0.11.7 && uv sync --locked --no-dev --no-editable && useradd --create-home chat
ENV PATH="/app/.venv/bin:$PATH"
USER chat
EXPOSE 8003
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003", "--no-access-log", "--ws-max-size", "65536"]

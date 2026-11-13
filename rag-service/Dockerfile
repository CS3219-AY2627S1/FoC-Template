FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.14 /uv /uvx /bin/
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# The model is part of the image, so a new container starts without downloading it.
RUN .venv/bin/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', device='cpu')"
ENV HF_HUB_OFFLINE=1

COPY . .
RUN uv sync --frozen
EXPOSE 3080
CMD ["uv", "run", "--no-dev", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3080"]

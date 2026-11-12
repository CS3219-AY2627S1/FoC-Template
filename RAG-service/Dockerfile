# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the embedding model into the image, so starting a container (or the indexing job) doesn't
# depend on reaching Hugging Face. World-writable because the containers run as an unprivileged user
# and the library keeps lock files next to the model.
ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ENV HF_HOME=/opt/hf-cache
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')" \
    && chmod -R a+rwX /opt/hf-cache

COPY database ./database
COPY ingestion ./ingestion
COPY app ./app

# Default: the indexing job (docker compose overrides this to run the API with uvicorn)
CMD ["python", "-m", "ingestion.index_chunks"]

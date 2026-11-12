# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-11
# Scope (AI-30): Updated the RAG service to the specified Claude model and added API error handling.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verified_claims
from app.claude import ClaudeClient, ClaudeNotConfiguredError, ClaudeUnavailableError
from app.retrieval import Retriever
from app.schemas import QueryRequest, QueryResponse


app = FastAPI(title="RAG Service")
allowed_origins = [
    origin.strip()
    for origin in os.getenv("RAG_CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
)
retriever = Retriever()
claude = ClaudeClient()


# Liveness/readiness for Kubernetes and the load balancer. Cheap on purpose: no database or Claude
# call, so a slow dependency doesn't get every pod restarted. The embedding model is loaded above,
# before the server starts, so a pod only answers here once it can serve queries.
@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/query", response_model=QueryResponse)
def query_chunks(request: QueryRequest, _claims: dict = Depends(verified_claims)) -> QueryResponse:
    chunks = retriever.find_relevant_chunks(request.query, request.top_k)
    try:
        answer = claude.answer(request.query, chunks)
    except (ClaudeNotConfiguredError, ClaudeUnavailableError) as exc:
        raise HTTPException(503, str(exc)) from exc
    return QueryResponse(answer=answer)

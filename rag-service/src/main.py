from fastapi import FastAPI, Request
from .middleware.auth_middleware import verify_auth_header_middleware
from .services.rag_service import boostrap_rag_system
from .controller.rag_controller import (
    queryRequest,
    post_query_rag_controller,
)

# uv run fastapi dev
# conda deactivate
# source .venv/bin/activate
# uvicorn src.main:app --reload --host 0.0.0.0 --port 3080

app = FastAPI()
app.middleware("http")(verify_auth_header_middleware)
boostrap_rag_system()

@app.get("/")
async def root():
    return {"message": "Relay help assistant"}

@app.get("/health/")
async def health():
    return {"status": "ok"}


@app.post("/query/")
async def post_query_raq(request: queryRequest, http_request: Request):
    # Set by verify_auth_header_middleware, which lets only authorized requests reach this route.
    return await post_query_rag_controller(request, http_request.state.account_id)

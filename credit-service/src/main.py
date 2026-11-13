# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-06
# Scope: Generated the initial FastAPI lifecycle, RabbitMQ setup, and health endpoint
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Integrated UserCreated exchange, queue, and consumer startup into the service lifespan
# Author review: I reviewed correctness and edited the changes to fit the project

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from common.config_manager import settings
from common.logging_config import (
    RequestLoggingMiddleware,
    configure_logging,
)
from credit.bootstrap import initialize_credit_service
from credit.views import router as credit_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with initialize_credit_service() as resources:
        app.state.rmq_connection = resources.connection
        app.state.rmq_channel = resources.channel
        app.state.user_exchange = resources.user_exchange
        yield


configure_logging("credit-service")
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "credit-service"}


@app.exception_handler(RequestValidationError)
async def invalid_request_handler(
    _request: Request, _exception: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(status_code=422, content={"message": "Invalid request."})


@app.exception_handler(Exception)
async def unexpected_error_handler(
    request: Request, _exception: Exception,
) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error."},
        headers={"X-Request-ID": request.state.http_request_id},
    )


app.include_router(credit_router)

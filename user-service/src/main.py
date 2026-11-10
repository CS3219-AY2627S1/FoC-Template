# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Integrated startup resources and the UserCreated event publisher with the FastAPI lifespan
# Author review: I reviewed correctness and edited the changes to fit the project

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from auth.bootstrap import initialize_user_service
from auth.models import PASSWORD_REQUIREMENTS_MESSAGE
from auth.views import router as authentication_router
from common.config_manager import settings
from common.logging_config import (
    RequestLoggingMiddleware,
    configure_logging,
    unexpected_error_handler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with initialize_user_service() as resources:
        app.state.rmq_connection = resources.connection
        app.state.rmq_channel = resources.channel
        app.state.user_exchange = resources.user_exchange
        app.state.session_factory = resources.session_factory
        app.state.user_event_publisher = resources.publisher
        yield


configure_logging("user-service")
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)
app.add_exception_handler(Exception, unexpected_error_handler)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "user-service",
    }


@app.exception_handler(RequestValidationError)
async def invalid_request_handler(request: Request, exception: RequestValidationError):
    if request.url.path.endswith("/authentication/users") and any(
        error.get("loc") == ("body", "password") for error in exception.errors()
    ):
        return JSONResponse(status_code=422, content={"message": PASSWORD_REQUIREMENTS_MESSAGE})
    return JSONResponse(status_code=422, content={"message": "Invalid request."})


app.include_router(authentication_router)

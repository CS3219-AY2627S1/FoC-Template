import json
import logging
import os
import re
import sys
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_SAFE_ID = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
_FIELDS = (
    "method", "route", "status", "duration_ms", "error_type", "order_id",
    "command_id", "message_id", "routing_key", "operation", "outcome",
    "attempt", "retry_in_seconds", "redelivered", "user_id", "supplier_id",
)


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str):
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "service_name": self.service,
            "environment": os.getenv("ENVIRONMENT", "development"),
            "logger": record.name,
            "message": record.getMessage(),
        }
        if identifier := request_id.get():
            entry["http_request_id"] = identifier
        for field in _FIELDS:
            if field in record.__dict__:
                entry[field] = record.__dict__[field]
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(service: str) -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))
    handler.setLevel(level)
    logging.basicConfig(level=level, handlers=[handler], force=True)
    for name in ("uvicorn", "uvicorn.error"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True
    # The middleware emits one structured request record instead.
    logging.getLogger("uvicorn.access").disabled = True
    # HTTP client INFO logs include full URLs and query strings.
    for name in ("httpx", "httpcore", "aio_pika", "aiormq"):
        logging.getLogger(name).setLevel(logging.WARNING)


async def propagate_request_id(request) -> None:
    """httpx request hook; never mutate shared AsyncClient headers."""
    if identifier := request_id.get():
        request.headers["X-Request-ID"] = identifier


async def unexpected_error_handler(request: Request, _error: Exception) -> JSONResponse:
    # Starlette's outer error handler runs after middleware context is reset.
    # Uvicorn still records the exception; the response carries the lookup ID.
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error."},
        headers={"X-Request-ID": request.state.http_request_id},
    )


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id", "")
        identifier = incoming if _SAFE_ID.fullmatch(incoming) else uuid4().hex
        # Python 3.14 restores the previous context when this block exits.
        with request_id.set(identifier):
            scope.setdefault("state", {})["http_request_id"] = identifier
            started = time.perf_counter()
            status = 500
            error_type = None

            async def send_response(message: Message) -> None:
                nonlocal status
                if message["type"] == "http.response.start":
                    status = message["status"]
                    MutableHeaders(scope=message)["X-Request-ID"] = identifier
                await send(message)

            try:
                await self.app(scope, receive, send_response)
            except Exception as error:
                error_type = type(error).__name__
                status = 500
                # Uvicorn logs the traceback; avoid a duplicate exception record here.
                raise
            finally:
                if scope["path"] != "/health" or status >= 400:
                    route = scope.get("route")
                    logging.getLogger("http.request").log(
                        logging.ERROR if status >= 500 else logging.INFO,
                        "http.request_completed",
                        extra={
                            "method": scope["method"],
                            # Route templates avoid logging arbitrary path/query data.
                            "route": getattr(route, "path", "unmatched"),
                            "status": status,
                            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                            "error_type": error_type,
                        },
                    )

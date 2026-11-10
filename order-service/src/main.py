import asyncio
from contextlib import AsyncExitStack, asynccontextmanager, suppress
from http.cookiejar import CookieJar, DefaultCookiePolicy
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from common.config_manager import settings
from common.db import get_engine
from common.gateway import get_internal_gateway_url
from common.logging_config import (
    RequestLoggingMiddleware,
    configure_logging,
    propagate_request_id,
    unexpected_error_handler,
)
from orders.messaging import initialize_order_messaging
from orders.orm_models import Base
from orders.views import router as order_router
from workers.expiry import expiry_worker


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    if settings.rabbitmq_url is None or not settings.rabbitmq_url.get_secret_value():
        raise RuntimeError("RABBITMQ_URL is not configured")

    gateway_url = get_internal_gateway_url()
    async with AsyncExitStack() as resources:
        app.state.internal_gateway_client = await resources.enter_async_context(
            httpx.AsyncClient(
                base_url=gateway_url,
                timeout=5.0,
                event_hooks={"request": [propagate_request_id]},
                # Credentials are per-request headers, never shared session cookies.
                cookies=CookieJar(policy=DefaultCookiePolicy(allowed_domains=[])),
            )
        )
        engine = get_engine()
        resources.push_async_callback(engine.dispose)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with initialize_order_messaging(
            settings.rabbitmq_url.get_secret_value(), session_factory,
        ):
            expiry_task = asyncio.create_task(expiry_worker(session_factory))
            try:
                yield
            finally:
                expiry_task.cancel()
                with suppress(asyncio.CancelledError):
                    await expiry_task


configure_logging("order-service")
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)
app.add_exception_handler(Exception, unexpected_error_handler)
app.include_router(order_router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "order-service",
    }

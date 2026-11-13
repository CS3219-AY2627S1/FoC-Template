"""FastAPI application entry point for the Order Service."""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.clients import SupplierServiceClient, UserServiceClient
from app.config import required_env
from app.db import database_url, get_db, make_engine, make_session_factory
from foc_observability import RequestContextMiddleware, configure_logging, log_event
from app.routes.admin import router as admin_router
from app.routes.orders import router as orders_router


logger = logging.getLogger(__name__)
configure_logging("order-service", component="api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = make_engine(database_url())
    user_client = UserServiceClient(
        required_env("USER_SERVICE_URL"), required_env("USER_SERVICE_CA_FILE")
    )
    supplier_client = SupplierServiceClient(required_env("SUPPLIER_SERVICE_URL"))
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.user_client = user_client
    app.state.supplier_client = supplier_client
    try:
        yield
    finally:
        user_client.close()
        supplier_client.close()
        engine.dispose()


app = FastAPI(title="FoC Order Service", lifespan=lifespan)
app.add_middleware(RequestContextMiddleware)


@app.exception_handler(OperationalError)
async def database_unavailable(request: Request, exc: OperationalError) -> JSONResponse:
    log_event(
        logger,
        logging.ERROR,
        "database_unavailable",
        path=request.url.path,
    )
    return JSONResponse(
        status_code=503, content={"detail": "Database temporarily unavailable"}
    )


@app.get("/health")
def health_check():
    """Return a simple liveness response for health checks."""

    return {"status": "healthy"}


@app.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    """Return ready only when the database can execute a lightweight query."""

    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        log_event(logger, logging.WARNING, "readiness_check_failed")
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ready"}


app.include_router(orders_router)
app.include_router(admin_router)

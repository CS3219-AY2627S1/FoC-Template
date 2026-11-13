# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — register shared-domain and FastAPI request-validation exception handlers in the existing application factory, returning HTTP 422 through the shared formatter.
# Scope: Writing implementation code — write application-lifespan client construction from existing Settings, expose the shared client on app.state, and register client and database cleanup with ExitStack for shutdown and partial startup failures. (ai-20260930-020)
# Scope: Writing implementation code — register a narrowly scoped ProtectedRouteError handler returning the agreed error envelope and bearer challenge while preserving existing validation and unrelated HTTP exception handling. (ai-20260930-021)
# Scope: Writing implementation code — register supplier and reference-data routers as public endpoints without authentication dependencies, preserving protected-route error handling and lifecycle cleanup. (ai-20260930-022)
# Author review: Keith confirmed review of all affected HTTP validation changes. Keith confirmed review of lifecycle changes. Keith confirmed review of authentication-dependency changes. Keith confirmed review of public-read registration changes (ai-20260930-022).
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code — import and register the administrator supplier router in the existing app factory while preserving existing POST and PATCH URLs. (ai-20261001-011)
# Author review: Keith confirmed review of the retained DELETE adapter changes (ai-20261001-011).
# Details: ../ai/usage-log.md; ai-20260930-003; ai-20260930-020; ai-20260930-021; ai-20260930-022; ai-20261001-011

from contextlib import ExitStack, asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.auth import ProtectedRouteError
from app.clients.user_service import UserServiceClient
from app.db import create_db_engine, create_session_factory
from app.config import Settings
from foc_observability import RequestContextMiddleware, configure_logging
from app.routes.admin_suppliers import router as admin_supplier_router
from app.routes.health import router as health_router
from app.routes.reference_data import router as reference_router
from app.routes.suppliers import router as supplier_router
from app.validation.errors import DomainValidationError, request_validation_issues

configure_logging("supplier-service", component="api")


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings is None:
            app.state.settings = Settings()
        else:
            app.state.settings = settings
        configure_logging(
            "supplier-service",
            component="api",
            environment=app.state.settings.app_env,
            level=app.state.settings.log_level,
        )

        with ExitStack() as resources:
            app.state.engine = create_db_engine(app.state.settings)
            resources.callback(app.state.engine.dispose)
            app.state.user_service_client = UserServiceClient(app.state.settings)
            resources.callback(app.state.user_service_client.close)
            app.state.session_factory = create_session_factory(app.state.engine)
            yield

    app = FastAPI(
        title="FoC Supplier Service",
        lifespan=lifespan,
    )
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(ProtectedRouteError)
    async def protected_route_error_handler(
        request: Request, error: ProtectedRouteError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code, content=error.detail, headers=error.headers,
        )

    @app.exception_handler(DomainValidationError)
    async def domain_validation_handler(
        request: Request, error: DomainValidationError,
    ) -> JSONResponse:
        return JSONResponse(status_code=422, content=error.to_dict())

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request, error: RequestValidationError,
    ) -> JSONResponse:
        validation = DomainValidationError(request_validation_issues(error.errors()))
        return JSONResponse(status_code=422, content=validation.to_dict())

    app.include_router(health_router)
    app.include_router(supplier_router)
    app.include_router(admin_supplier_router)
    app.include_router(reference_router)

    return app

app = create_app()

# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29
# Scope: Writing implementation code — write readiness using the existing engine and Alembic APIs, application-relative configuration, exact nonempty head matching, connection cleanup, and generic failure diagnostics; preserve database-independent liveness.
# Author review: Keith confirmed review of all affected readiness changes.
# Details: ../../ai/usage-log.md; ai-20260929-002

import logging
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from foc_observability import log_event

router = APIRouter()
logger = logging.getLogger(__name__)
ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"


@router.get("/health")
def health():
    return {"status": "healthy"}


@router.get("/ready")
def ready(request: Request):
    try:
        if not ALEMBIC_CONFIG_PATH.is_file():
            raise ValueError("Missing migration configuration")
        config = Config(str(ALEMBIC_CONFIG_PATH))
        packaged_heads = set(ScriptDirectory.from_config(config).get_heads())
        if not packaged_heads:
            raise ValueError("Empty migration heads")

        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            installed_heads = set(
                MigrationContext.configure(connection).get_current_heads()
            )

        if installed_heads == packaged_heads:
            return {"status": "ready"}
    except Exception:
        # Exception messages can contain database credentials or connection details.
        # Keep this request boundary fail-closed without logging those messages.
        pass

    log_event(logger, logging.WARNING, "readiness_check_failed")
    return JSONResponse(status_code=503, content={"status": "not_ready"})

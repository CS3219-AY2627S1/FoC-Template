# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Boilerplate generation — scaffold online and offline migration execution that reads DATABASE_URL from the environment and fails with a named error when it is missing.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-sonnet-5-5, then claude-opus-5-5), date: 2026-11-04
# Scope: Boilerplate generation — import app.models so autogenerate sees the tables, and pass SESSION_OPTIONS in connect_args so migrations run with a UTC session time zone (ai-20261104-001).
# Author review: Keith confirmed that all tests and manual verification were completed and approved, and confirmed rerunning the tests himself, with commands and results unspecified (ai-20261104-001).
# Details: notification-service/ai/usage-log.md; ai-20261104-001

"""Alembic migration environment for the Notification Service."""

import logging
import os
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

try:
    from foc_observability import configure_logging, log_event
except ModuleNotFoundError:
    repository_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repository_root / "packages/foc-observability/src"))
    from foc_observability import configure_logging, log_event

from app.config import required_env
from app.db import SESSION_OPTIONS, Base
from app import models  # noqa: F401  (registers tables on Base.metadata)


config = context.config
logger = logging.getLogger(__name__)
configure_logging(
    "notification-migrate",
    component="migration",
    level=os.getenv("LOG_LEVEL", "INFO"),
)
logging.getLogger("alembic").setLevel(logging.WARNING)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"options": SESSION_OPTIONS},
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


def main() -> None:
    """Run the migration with structured lifecycle events."""

    mode = "offline" if context.is_offline_mode() else "online"
    log_event(logger, logging.INFO, "migration_started", mode=mode)
    try:
        database_url = required_env("DATABASE_URL")

        # Alembic's Config uses configparser interpolation for percent signs.
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
        global target_metadata
        target_metadata = Base.metadata

        if context.is_offline_mode():
            run_migrations_offline()
        else:
            run_migrations_online()
    except Exception as error:
        log_event(
            logger,
            logging.ERROR,
            "migration_failed",
            mode=mode,
            exception_type=type(error).__name__,
        )
        raise
    else:
        log_event(logger, logging.INFO, "migration_completed", mode=mode)


main()

"""Alembic migration environment for the Credit Service."""

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


config = context.config
logger = logging.getLogger(__name__)
configure_logging("credit-migrate", component="migration")
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
    """Configure and run one migration process with structured lifecycle logs."""

    mode = "offline" if context.is_offline_mode() else "online"
    log_event(logger, logging.INFO, "migration_started", mode=mode)
    try:
        from app import models  # noqa: F401 - register ORM tables with Base.metadata
        from app.db import Base

        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL must be set before running Alembic migrations"
            )

        # Alembic's Config uses configparser interpolation for percent signs.
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
        global target_metadata
        target_metadata = Base.metadata

        if context.is_offline_mode():
            run_migrations_offline()
        else:
            run_migrations_online()
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "migration_failed",
            mode=mode,
            exception_type=type(exc).__name__,
            exc_info=True,
        )
        raise SystemExit(1) from None
    else:
        log_event(logger, logging.INFO, "migration_completed", mode=mode)


main()

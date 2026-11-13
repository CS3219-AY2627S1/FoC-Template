# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
# Scope: Learning support; Boilerplate generation; Writing implementation code — load model metadata and configure online/offline migration execution.
# Author review: Keith confirmed review of all affected changes.
# Details: ../ai/usage-log.md; ai-20260929-001

import logging

from alembic import context
from sqlalchemy import MetaData, create_engine, pool

from app.config import Settings
from foc_observability import configure_logging, log_event


logger = logging.getLogger(__name__)
configure_logging("supplier-migrate", component="migration")
logging.getLogger("alembic").setLevel(logging.WARNING)


def load_target_metadata() -> MetaData:
    import app.models  # noqa: F401 - register ORM tables with Base.metadata
    from app.db import Base

    return Base.metadata


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    if type_ == "table" and name == "spatial_ref_sys" and reflected:
        return False

    return True


def run_migrations_offline(settings: Settings, metadata: MetaData) -> None:
    context.configure(
        url=str(settings.database_url),
        target_metadata=metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online(settings: Settings, metadata: MetaData) -> None:
    # Create a synchronous SQLAlchemy engine using the settings URL and
    # pool.NullPool: this short-lived migration process needs no retained pool.
    engine = create_engine(str(settings.database_url), poolclass=pool.NullPool)

    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=metadata,
                include_object=include_object,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


def main() -> None:
    """Configure and run one migration process with structured lifecycle logs."""

    mode = "offline" if context.is_offline_mode() else "online"
    log_event(logger, logging.INFO, "migration_started", mode=mode)
    try:
        settings = Settings()
        metadata = load_target_metadata()

        if context.is_offline_mode():
            run_migrations_offline(settings, metadata)
        else:
            run_migrations_online(settings, metadata)
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

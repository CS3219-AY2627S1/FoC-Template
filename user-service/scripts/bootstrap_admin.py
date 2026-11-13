"""Create the first User Service administrator from environment variables."""

import logging
import os
from pathlib import Path
import sys

from pydantic import ValidationError

# Support both ``python -m scripts.bootstrap_admin`` (used by Compose) and
# ``python scripts/bootstrap_admin.py`` from the service directory.
if __package__ in {None, ""}:
    service_root = Path(__file__).resolve().parents[1]
    repository_root = service_root.parent
    sys.path.insert(0, str(service_root))
    sys.path.insert(0, str(repository_root / "packages/foc-observability/src"))

from foc_observability import configure_logging, log_event
from app.db import SessionLocal
from app.schemas import UserCreate
from app.services.bootstrap import BootstrapError, bootstrap_admin


ENVIRONMENT_FIELDS = {
    "nus_student_number": "BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER",
    "email": "BOOTSTRAP_ADMIN_EMAIL",
    "display_name": "BOOTSTRAP_ADMIN_DISPLAY_NAME",
    "password": "BOOTSTRAP_ADMIN_PASSWORD",
}


class BootstrapConfigurationError(RuntimeError):
    """Raised when bootstrap environment variables are incomplete or invalid."""


def payload_from_environment() -> UserCreate | None:
    """Build the validated administrator payload from process environment.

    All four variables being empty disables the optional bootstrap job. A
    partially configured job fails loudly so a deployment cannot appear to be
    initialized when the administrator was not created.
    """

    raw_values = {
        field: os.getenv(environment_name, "")
        for field, environment_name in ENVIRONMENT_FIELDS.items()
    }
    if not any(value.strip() for value in raw_values.values()):
        return None

    missing = [
        environment_name
        for field, environment_name in ENVIRONMENT_FIELDS.items()
        if not raw_values[field].strip()
    ]
    if missing:
        raise BootstrapConfigurationError(
            "Missing required administrator bootstrap variables: " + ", ".join(missing)
        )

    try:
        # Preserve the password exactly as supplied. The other fields are
        # normalized by UserCreate, including surrounding whitespace.
        values = {
            field: value if field == "password" else value.strip()
            for field, value in raw_values.items()
        }
        return UserCreate(**values)
    except ValidationError as exc:
        raise BootstrapConfigurationError(
            "Administrator bootstrap variables do not satisfy the user account policy"
        ) from exc


def main() -> int:
    """Run the one-shot bootstrap command and return a process exit code."""

    configure_logging("user-bootstrap", component="bootstrap")
    logger = logging.getLogger(__name__)

    try:
        payload = payload_from_environment()
        if payload is None:
            log_event(
                logger,
                logging.INFO,
                "administrator_bootstrap_disabled",
            )
            return 0

        with SessionLocal() as db:
            created = bootstrap_admin(payload, db)
    except (BootstrapConfigurationError, BootstrapError) as exc:
        log_event(
            logger,
            logging.ERROR,
            "administrator_bootstrap_failed",
            reason=str(exc),
        )
        return 1

    if created:
        log_event(logger, logging.INFO, "administrator_bootstrap_completed")
    else:
        log_event(
            logger,
            logging.INFO,
            "administrator_bootstrap_already_completed",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

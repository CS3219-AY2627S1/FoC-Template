"""Environment values the Order Service cannot start without."""

import os


def required_env(name: str) -> str:
    """Return an environment value or fail before the service starts."""

    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} must be set before starting the Order Service")
    return value

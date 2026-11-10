# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented and debugged configuration validation tests.
# Author review: I validated correctness and added boundary checks where needed.

import pytest

from app.core.config import Settings
from app.db import connection_options


@pytest.mark.parametrize("value", [None, "", "   "])
def test_empty_url_is_unconfigured(value):
    assert Settings(_env_file=None, database_url=value).database_url is None


def test_settings_do_not_display_credentials():
    settings = Settings(_env_file=None, database_url="postgresql://user:test-password@example/db")
    assert "test-password" not in repr(settings)
    assert "test-password" not in settings.model_dump_json()


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+asyncpg"])
def test_postgresql_url_normalization(scheme):
    url, args = connection_options(f"{scheme}://user:p%40ss@localhost:16422/postgres")
    assert url.drivername == "postgresql+asyncpg"
    assert url.password == "p@ss"
    assert url.port == 16422
    assert args == {"timeout": 5}


@pytest.mark.parametrize(
    "mode", ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]
)
def test_tls_modes_are_preserved(mode):
    url, args = connection_options(f"postgresql://localhost/db?sslmode={mode}")
    assert "sslmode" not in url.query
    assert args["ssl"] == mode


@pytest.mark.parametrize("url", [
    "not-a-url-with-secret",
    "sqlite:///secret",
    "postgresql://user:secret@localhost",
    "postgresql://user:secret@localhost:bad/db",
    "postgresql://user:secret@localhost/db?sslmode=unknown",
    "postgresql://user:secret@localhost/db?sslmode=require&ssl=disable",
])
def test_invalid_configuration_has_a_safe_error(url):
    with pytest.raises(ValueError) as caught:
        connection_options(url)
    assert str(caught.value) == "DATABASE_URL must be a valid PostgreSQL connection URL."
    assert "secret" not in str(caught.value)

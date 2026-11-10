# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added coverage for PostgreSQL URL normalization and asyncpg TLS options.
# Author review: I validated correctness and added boundary checks where needed.

from unittest.mock import patch

from app.db import Database, async_database_url


def test_standard_postgresql_urls_are_normalized_for_asyncpg() -> None:
    assert (
        async_database_url("postgres://database.example/service")
        == "postgresql+asyncpg://database.example/service"
    )
    assert (
        async_database_url("postgresql://database.example/service")
        == "postgresql+asyncpg://database.example/service"
    )


def test_existing_asyncpg_url_is_unchanged() -> None:
    database_url = "postgresql+asyncpg://database.example/service"

    assert async_database_url(database_url) == database_url


def test_sslmode_is_removed_from_asyncpg_url() -> None:
    assert (
        async_database_url("postgresql://db.supabase.co/postgres?sslmode=require&pgbouncer=true")
        == "postgresql+asyncpg://db.supabase.co/postgres?pgbouncer=true"
    )


def test_database_translates_sslmode_require_to_asyncpg_ssl_connect_arg() -> None:
    with patch("app.db.create_async_engine") as create_engine:
        Database("postgresql://db.supabase.co/postgres?sslmode=require&foo=bar")

    kwargs = create_engine.call_args.kwargs
    assert kwargs["connect_args"] == {"timeout": 5, "ssl": True}
    assert create_engine.call_args.args[0] == "postgresql+asyncpg://db.supabase.co/postgres?foo=bar"

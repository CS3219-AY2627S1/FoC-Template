# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29 to 2026-09-30
# Scope: Writing implementation code — write isolated SQLite and injected-failure tests for revision matching, configuration failures, connection release, recovery, safe diagnostics, and changed working directory.
# Scope: Writing implementation code — run readiness tests against an unavailable authentication transport and verify credential-independent ready/not-ready results based only on database and migration state. (ai-20260930-022)
# Author review: Keith confirmed review of all affected readiness changes. Keith confirmed review of public-read registration changes (ai-20260930-022).
# Details: ../../ai/usage-log.md; ai-20260929-002; ai-20260930-022

import logging
from unittest.mock import MagicMock

import httpx
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, event, text
from sqlalchemy.pool import StaticPool

from app.clients.user_service import UserServiceClient
from app.routes import health


@pytest.fixture
def packaged_heads():
    return set(
        ScriptDirectory.from_config(Config(str(health.ALEMBIC_CONFIG_PATH))).get_heads()
    )


@pytest.fixture
def database(client, monkeypatch):
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(client.app.state, "engine", engine)
    try:
        yield engine
    finally:
        engine.dispose()


def install_heads(engine, heads):
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        ))
        connection.execute(text("DELETE FROM alembic_version"))
        for head in heads:
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:head)"),
                {"head": head},
            )


def assert_readiness(client, ready):
    response = client.get("/ready")
    assert response.status_code == (200 if ready else 503)
    assert response.json() == {"status": "ready" if ready else "not_ready"}


def test_matching_revisions(client, database, packaged_heads):
    assert packaged_heads
    install_heads(database, packaged_heads)
    assert_readiness(client, True)


def test_missing_version_table(client, database):
    assert_readiness(client, False)


@pytest.mark.parametrize("state", ["missing", "older", "unexpected", "extra"])
def test_nonmatching_revisions(client, database, packaged_heads, state):
    scripts = ScriptDirectory.from_config(Config(str(health.ALEMBIC_CONFIG_PATH)))
    older = {revision.revision for revision in scripts.walk_revisions()} - packaged_heads
    assert older
    heads = {
        "missing": set(),
        "older": older,
        "unexpected": {"unexpected_revision"},
        "extra": packaged_heads | {"unexpected_revision"},
    }[state]
    install_heads(database, heads)
    assert_readiness(client, False)


def test_multiple_packaged_heads_require_exact_match(client, database, monkeypatch):
    scripts = MagicMock()
    scripts.get_heads.return_value = ["branch_a", "branch_b"]
    monkeypatch.setattr(health.ScriptDirectory, "from_config", lambda config: scripts)
    install_heads(database, {"branch_a"})
    assert_readiness(client, False)
    install_heads(database, {"branch_b", "branch_a"})
    assert_readiness(client, True)


def test_schema_repair_recovers(client, database, packaged_heads):
    assert_readiness(client, False)
    install_heads(database, packaged_heads)
    assert_readiness(client, True)


@pytest.mark.parametrize("failure", ["connect", "query", "revisions"])
def test_database_failures_release_connections_and_recover(
    client, database, packaged_heads, monkeypatch, caplog, failure
):
    install_heads(database, packaged_heads)
    secret = "postgresql://private_user:secret_password@private-host/private-db"
    returned_connections = []
    event.listen(database, "checkin", lambda *args: returned_connections.append(True))

    def fail(*args, **kwargs):
        raise RuntimeError(secret)

    with monkeypatch.context() as patch:
        if failure == "connect":
            patch.setattr(database, "connect", fail)
        elif failure == "query":
            event.listen(database, "before_cursor_execute", fail)
        else:
            patch.setattr(health.MigrationContext, "get_current_heads", fail)
        try:
            with caplog.at_level(logging.WARNING):
                assert_readiness(client, False)
        finally:
            if failure == "query":
                event.remove(database, "before_cursor_execute", fail)

    assert len(returned_connections) == (0 if failure == "connect" else 1)
    assert any(
        getattr(record, "event", None) == "readiness_check_failed"
        for record in caplog.records
    )
    for sensitive in [secret, "private_user", "secret_password", "private-host", "private-db"]:
        assert sensitive not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)
    assert_readiness(client, True)
    assert len(returned_connections) == (1 if failure == "connect" else 2)


@pytest.mark.parametrize(
    "configuration",
    ["missing", "empty", "malformed", "no_location", "bad_location", "empty_heads", "bad_revision"],
)
def test_invalid_migration_configuration(
    client, database, packaged_heads, monkeypatch, tmp_path, configuration
):
    install_heads(database, packaged_heads)
    config_path = tmp_path / "alembic.ini"
    versions = tmp_path / "migrations" / "versions"
    versions.mkdir(parents=True)
    contents = {
        "empty": "",
        "malformed": "this is not an ini file",
        "no_location": "[alembic]\n",
        "bad_location": "[alembic]\nscript_location = %(here)s/absent\n",
        "empty_heads": "[alembic]\nscript_location = %(here)s/migrations\n",
        "bad_revision": "[alembic]\nscript_location = %(here)s/migrations\n",
    }
    if configuration != "missing":
        config_path.write_text(contents[configuration])
    if configuration == "bad_revision":
        (versions / "broken.py").write_text("this is invalid python!")
    monkeypatch.setattr(health, "ALEMBIC_CONFIG_PATH", config_path)
    assert_readiness(client, False)


def test_changed_working_directory(client, database, packaged_heads, monkeypatch, tmp_path):
    install_heads(database, packaged_heads)
    monkeypatch.chdir(tmp_path)
    assert_readiness(client, True)


@pytest.fixture(autouse=True)
def unavailable_user_service(settings, monkeypatch):
    """Every probe test runs with an unreachable authentication transport."""
    transport = MagicMock(side_effect=httpx.ConnectError("User Service unavailable"))
    upstream = UserServiceClient(settings, transport=httpx.MockTransport(transport))
    resolve = MagicMock(wraps=upstream.resolve_identity)
    monkeypatch.setattr(upstream, "resolve_identity", resolve)
    monkeypatch.setattr("app.main.UserServiceClient", lambda settings: upstream)
    try:
        yield
    finally:
        upstream.close()
        resolve.assert_not_called()
        transport.assert_not_called()


@pytest.mark.parametrize("authorization", [None, "Bearer valid-admin", "Bearer revoked", "Basic malformed"])
@pytest.mark.parametrize("ready", [False, True])
def test_readiness_depends_only_on_database_during_auth_outage(
    client, database, packaged_heads, authorization, ready,
):
    if ready:
        install_heads(database, packaged_heads)
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.get("/ready", headers=headers)
    assert response.status_code == (200 if ready else 503)
    assert response.json() == {"status": "ready" if ready else "not_ready"}

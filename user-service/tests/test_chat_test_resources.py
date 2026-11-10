# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Added or extended tests for isolated Chat test resource handling.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import pytest

from scripts import run_chat_tests


@pytest.mark.parametrize(
    "project_id,port,linked",
    [
        ("user-service", 18422, False),
        ("foc-user-chat-test", 15422, False),
        ("foc-user-chat-test", 18422, True),
    ],
)
def test_isolated_runner_rejects_existing_or_linked_database_projects(
    tmp_path,
    monkeypatch,
    project_id,
    port,
    linked,
) -> None:
    supabase = tmp_path / "supabase"
    supabase.mkdir()
    (supabase / "config.toml").write_text(
        f'project_id = "{project_id}"\n[db]\nport = {port}\n',
        encoding="utf-8",
    )
    if linked:
        (supabase / ".temp").mkdir()
        (supabase / ".temp" / "project-ref").write_text("cloud-project", encoding="utf-8")
    monkeypatch.setattr(run_chat_tests, "PROJECT_ROOT", tmp_path)
    with pytest.raises(SystemExit, match="Refusing"):
        run_chat_tests.verify_project()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://test:private-password@cloud.example:18422/postgres",
        "postgresql://test:private-password@127.0.0.1:15422/postgres",
        "postgresql://test:private-password@127.0.0.1:18422/production",
        "https://test:private-password@127.0.0.1:18422/postgres",
    ],
)
def test_isolated_runner_rejects_non_test_database_urls(monkeypatch, url) -> None:
    monkeypatch.setattr(run_chat_tests, "verify_project", lambda: None)
    monkeypatch.setattr(run_chat_tests, "local_cli", lambda *args: f'DB_URL="{url}"\n')
    with pytest.raises(SystemExit) as caught:
        run_chat_tests.isolated_database_url()
    assert "private-password" not in str(caught.value)

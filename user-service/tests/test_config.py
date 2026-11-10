# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added or extended tests for service configuration validation.
# Author review: I validated correctness and added boundary checks where needed.

from app.core.config import Settings


def test_blank_database_url_is_treated_as_unconfigured() -> None:
    settings = Settings(_env_file=None, database_url="   ")

    assert settings.database_url is None


def test_phase_two_session_security_defaults_match_the_requirements() -> None:
    settings = Settings(_env_file=None)

    assert settings.jwt_refresh_token_ttl_seconds == 86_400
    assert settings.jwt_session_idle_timeout_seconds == 1_800

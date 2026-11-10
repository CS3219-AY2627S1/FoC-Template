# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Added or extended tests for Super Admin bootstrap configuration.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import pytest
from pydantic import SecretStr

from app.admin.lifecycle import BootstrapConfigurationError, BootstrapCredentials
from app.core.config import Settings


def test_bootstrap_credentials_require_explicit_local_values_and_apply_registration_validation(
) -> None:
    settings = Settings(
        _env_file=None,
        bootstrap_super_admin_username="Initial-Admin",
        bootstrap_super_admin_email="initial-admin@u.nus.edu",
        bootstrap_super_admin_password=SecretStr("InitialAdminPass1!"),
    )

    credentials = BootstrapCredentials.from_settings(settings)

    assert credentials.username == "Initial-Admin"
    assert credentials.email == "initial-admin@u.nus.edu"
    assert credentials.display_name == "Initial-Admin"
    assert credentials.password == "InitialAdminPass1!"


def test_bootstrap_credentials_reject_missing_or_invalid_configuration() -> None:
    with pytest.raises(BootstrapConfigurationError):
        BootstrapCredentials.from_settings(Settings(_env_file=None))

    with pytest.raises(BootstrapConfigurationError):
        BootstrapCredentials.from_settings(
            Settings(
                _env_file=None,
                bootstrap_super_admin_username="initial admin",
                bootstrap_super_admin_email="initial-admin@example.com",
                bootstrap_super_admin_password=SecretStr("short"),
            )
        )

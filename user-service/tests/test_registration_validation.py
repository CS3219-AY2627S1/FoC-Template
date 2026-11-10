# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21
# Scope: Added or extended tests for registration field and password validation.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.schemas import RegistrationRequest


def test_registration_defaults_display_name_to_username() -> None:
    request = RegistrationRequest(
        username="Alice_User?",
        email="alice@u.nus.edu",
        password="SecurePass1!",
    )

    assert request.display_name == "Alice_User?"


def test_registration_accepts_a_full_stop_in_a_password() -> None:
    request = RegistrationRequest(
        username="Alice_User?",
        email="alice@u.nus.edu",
        password="Secure.Pass1",
    )

    assert request.password == "Secure.Pass1"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("username", "Alice User", "Username may contain only"),
        ("email", "alice@example.com", "Use a NUS student email address"),
        ("password", "onlylowercasepassword", "Use 12-72 characters from 3 of the 4"),
        ("password", "Short1!", "Use 12-72 characters from 3 of the 4"),
        ("password", "Secure Pass1!", "Use 12-72 characters from 3 of the 4"),
        ("display_name", "Alice User", "Display name may contain only"),
    ],
)
def test_registration_rejects_values_outside_backlog_rules(
    field: str,
    value: str,
    message: str,
) -> None:
    payload = {
        "username": "Alice_User?",
        "email": "alice@u.nus.edu",
        "password": "SecurePass1!",
        "display_name": "Alice_User?",
    }
    payload[field] = value

    with pytest.raises(ValidationError, match=message):
        RegistrationRequest.model_validate(payload)

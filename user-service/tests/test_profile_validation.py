# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-22, 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for profile update and deletion input validation.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.schemas import (
    AccountDeletionRequest,
    AdminUserLookupRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
)


def test_profile_update_accepts_only_mutable_validated_fields() -> None:
    request = ProfileUpdateRequest.model_validate({"displayName": "Updated_User?"})

    assert request.display_name == "Updated_User?"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"displayName": "Invalid display name"},
        {"displayName": None},
        {"email": "replacement@u.nus.edu"},
        {"username": "replacement"},
        {"activeParticipationMode": "COURIER"},
        {"systemRole": "ADMIN"},
        {"accountStatus": "DELETED"},
        {"id": "00000000-0000-0000-0000-000000000001"},
    ],
)
def test_profile_update_rejects_empty_invalid_and_protected_changes(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        ProfileUpdateRequest.model_validate(payload)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"currentPassword": "SecurePass1!", "acknowledgeDeletion": False},
        {"currentPassword": "SecurePass1!", "acknowledgeDeletion": True, "email": "x@u.nus.edu"},
    ],
)
def test_account_deletion_requires_password_and_explicit_acknowledgement(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        AccountDeletionRequest.model_validate(payload)


def test_account_deletion_accepts_a_true_explicit_acknowledgement() -> None:
    request = AccountDeletionRequest.model_validate(
        {"currentPassword": "SecurePass1!", "acknowledgeDeletion": True}
    )

    assert request.current_password == "SecurePass1!"
    assert request.acknowledge_deletion is True


def test_password_change_validates_only_a_current_and_valid_replacement_password() -> None:
    request = PasswordChangeRequest.model_validate(
        {"currentPassword": "CurrentPassword1!", "newPassword": "ReplacementPassword1!"}
    )

    assert request.current_password == "CurrentPassword1!"
    assert request.new_password == "ReplacementPassword1!"

    with pytest.raises(ValidationError):
        PasswordChangeRequest.model_validate(
            {"currentPassword": "CurrentPassword1!", "newPassword": "weak"}
        )


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "CampusUser"},
        {"email": "campus@u.nus.edu"},
    ],
)
def test_admin_lookup_accepts_one_valid_unique_identifier(payload: dict[str, object]) -> None:
    request = AdminUserLookupRequest.model_validate(payload)

    assert (request.username is None) != (request.email is None)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"username": "CampusUser", "email": "campus@u.nus.edu"},
        {"username": "invalid username"},
        {"email": "campus@example.com"},
    ],
)
def test_admin_lookup_requires_one_valid_identifier(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        AdminUserLookupRequest.model_validate(payload)

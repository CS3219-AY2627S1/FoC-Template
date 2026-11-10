# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for supported account statuses.
# Author review: I validated correctness and added boundary checks where needed.

"""Account status is shared by all User Service response contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.schemas import (
    AdminUserLookupResponse,
    AuthorizationDecisionResponse,
    CurrentUserResponse,
)
from app.core.config import Settings
from app.main import create_app
from app.models import AccountStatus


@pytest.mark.parametrize(
    ("response_model", "fields"),
    [
        (
            CurrentUserResponse,
            {"username": "CampusUser", "email": "campus@u.nus.edu", "displayName": "Campus"},
        ),
        (
            AdminUserLookupResponse,
            {
                "username": "CampusUser",
                "email": "campus@u.nus.edu",
                "displayName": "Campus",
                "emailVerified": True,
                "createdAt": datetime.now(UTC),
            },
        ),
        (AuthorizationDecisionResponse, {"allowed": False}),
    ],
)
def test_account_responses_accept_supported_statuses_and_reject_removed_status(
    response_model, fields: dict[str, object],
) -> None:
    identity_field = "subjectId" if response_model is AuthorizationDecisionResponse else "userId"
    payload = {identity_field: uuid4(), "systemRole": "USER", **fields}
    for status in ("ACTIVE", "DELETED"):
        response = response_model.model_validate({**payload, "accountStatus": status})
        assert response.model_dump(mode="json", by_alias=True)["accountStatus"] == status
    with pytest.raises(ValidationError):
        response_model.model_validate({**payload, "accountStatus": "SUSPENDED"})


def test_account_status_enum_and_openapi_expose_only_supported_values() -> None:
    assert list(AccountStatus) == [AccountStatus.ACTIVE, AccountStatus.DELETED]
    with pytest.raises(ValueError):
        AccountStatus("SUSPENDED")

    app = create_app(Settings(_env_file=None, environment="test"))
    schema = app.openapi()
    assert schema["components"]["schemas"]["AccountStatus"]["enum"] == ["ACTIVE", "DELETED"]

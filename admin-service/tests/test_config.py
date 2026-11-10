# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added configuration validation tests.
# Author review: I validated correctness and supplied additional boundary checks.

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_blank_values_are_unset():
    settings = Settings(_env_file=None, database_url="  ", user_service_base_url="")
    assert settings.database_url is None
    assert settings.user_service_base_url is None


def test_service_origin_drops_trailing_slash():
    settings = Settings(_env_file=None, user_service_base_url="http://user-service:8000/")
    assert settings.user_service_base_url == "http://user-service:8000"


@pytest.mark.parametrize(
    "url",
    [
        "ftp://user-service:8000",
        "http://name:secret@user-service:8000",
        "http://user-service:8000/v1",
        "http://user-service:8000?debug=1",
    ],
)
def test_service_origin_rejects_credentials_paths_and_other_schemes(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, user_service_base_url=url)

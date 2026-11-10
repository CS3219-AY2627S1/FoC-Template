# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21
# Scope: Implemented input validation and updated the password character check.
# Author review: I validated correctness and added boundary checks where needed.

"""Validation rules taken from the User Service account-creation backlog."""

from __future__ import annotations

import re

from email_validator import EmailNotValidError
from email_validator import validate_email as parse_email

NUS_STUDENT_EMAIL_DOMAIN = "u.nus.edu"
MAX_BCRYPT_PASSWORD_BYTES = 72
_USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9!#$%^&*()\-_=+?]+$")
_PASSWORD_PATTERN = re.compile(r"^[A-Za-z0-9!@#$%^&*()\-_=+?.]+$")
_PASSWORD_SPECIALS = frozenset("!@#$%^&*()-_=+?.")
_PASSWORD_REQUIREMENTS_ERROR = "Use 12-72 characters from 3 of the 4 character groups"


def normalize_email(email: str) -> str:
    """Return the canonical form used by unique database constraints."""

    return email.casefold()


def normalize_username(username: str) -> str:
    """Return the canonical case-insensitive username form."""

    return username.casefold()


def validate_email(value: str) -> str:
    """Require syntactically valid email from the supported NUS student domain."""

    if value != value.strip():
        raise ValueError("Email must not begin or end with whitespace.")
    try:
        parsed = parse_email(value, check_deliverability=False)
    except EmailNotValidError as error:
        raise ValueError("Enter a valid NUS email address.") from error
    if parsed.domain.casefold() != NUS_STUDENT_EMAIL_DOMAIN:
        raise ValueError("Use a NUS student email address ending in @u.nus.edu.")
    return parsed.normalized


def validate_username(value: str) -> str:
    """Allow only the backlog's username character allow-list."""

    if not _USERNAME_PATTERN.fullmatch(value):
        raise ValueError(
            "Username may contain only letters, digits, and ! # $ % ^ & * ( ) - _ = + ?."
        )
    return value


def validate_profile_name(value: str) -> str:
    """Apply the same allow-list used for a display name in the backlog."""

    if not _USERNAME_PATTERN.fullmatch(value):
        raise ValueError(
            "Display name may contain only letters, digits, and ! # $ % ^ & * ( ) - _ = + ?."
        )
    return value


def validate_password(value: str) -> str:
    """Enforce length, allow-list, and three-of-four password categories."""

    encoded = value.encode("utf-8")
    if len(value) < 12 or len(encoded) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError(_PASSWORD_REQUIREMENTS_ERROR)
    if not _PASSWORD_PATTERN.fullmatch(value):
        raise ValueError(_PASSWORD_REQUIREMENTS_ERROR)

    categories = (
        any("A" <= character <= "Z" for character in value),
        any("a" <= character <= "z" for character in value),
        any("0" <= character <= "9" for character in value),
        any(character in _PASSWORD_SPECIALS for character in value),
    )
    if sum(categories) < 3:
        raise ValueError(_PASSWORD_REQUIREMENTS_ERROR)
    return value


def validate_otp(value: str) -> str:
    """Require the six-digit verification code without altering it."""

    if not re.fullmatch(r"\d{6}", value):
        raise ValueError("OTP must contain exactly six digits.")
    return value

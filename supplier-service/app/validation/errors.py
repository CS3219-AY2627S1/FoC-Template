# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29 to 2026-09-30
# Scope: Writing implementation code — define structured field issues, a multi-issue exception, and the specified validation error envelope.
# Scope: Writing implementation code — translate Pydantic parsing errors into shared field-path issues and stable codes without introducing a runtime Pydantic dependency into the shared error module.
# Scope: Writing implementation code; Refactoring and documentation improvements — share parsing-error conversion, map FastAPI body/query paths, handle invalid JSON, and use approved messages without copying raw input, context, or internal exception text.
# Author review: Keith confirmed review of the creation-validation changes (ai-20260930-001) and HTTP validation changes (ai-20260930-003). Review of earlier work (ai-20260929-005) remains unconfirmed.
# Details: ../../ai/usage-log.md; ai-20260929-005; ai-20260930-001; ai-20260930-003

"""Transport-independent validation issues and the shared error envelope."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from pydantic import ValidationError


def parsing_issues(error: "ValidationError") -> list["ValidationIssue"]:
    """Translate Pydantic errors without exposing raw input or library messages."""
    return _parsing_issues(error.errors(include_url=False, include_input=False))


def request_validation_issues(
    errors: Iterable[Mapping[str, Any]],
) -> list["ValidationIssue"]:
    """Convert FastAPI error records; body paths are relative to the body.

    Accept error records rather than a FastAPI exception to keep this module
    usable by importers without importing the web framework. Never copy input,
    context, or exception messages into the response.
    """
    return _parsing_issues(errors, request=True)


_DOMAIN_MESSAGES = {
    "INVALID_COORDINATE": "Enter a finite numeric coordinate.",
    "COORDINATE_OUT_OF_RANGE": "Enter a coordinate within the permitted bounds.",
    "INVALID_TIME": "Enter a valid daily time.",
    "TIMEZONE_NOT_ALLOWED": "Daily times must not contain a timezone.",
    "UNKNOWN_CATEGORY": "Category does not exist.",
    "BLANK_TEXT": "Enter nonblank text.",
    "UNKNOWN_AREA": "Select an approved area.",
    "EMPTY_CATEGORIES": "Select at least one category.",
}


def _parsing_issues(
    errors: Iterable[Mapping[str, Any]], *, request: bool = False,
) -> list["ValidationIssue"]:
    issues = []
    for detail in errors:
        kind = detail["type"]
        location = tuple(detail["loc"])
        if request and location[:1] == ("body",):
            location = location[1:]
        if kind == "json_invalid":
            # A JSON character offset is not a field path.
            location = ()
            code, message = "INVALID_JSON", "Request body must contain valid JSON."
        elif kind in _DOMAIN_MESSAGES:
            code, message = kind, _DOMAIN_MESSAGES[kind]
        elif kind == "missing":
            code, message = "REQUIRED_FIELD", "This field is required."
        elif kind == "extra_forbidden":
            code, message = "FORBIDDEN_FIELD", "This field cannot be supplied."
        elif kind.startswith("uuid"):
            code, message = "INVALID_UUID", "Enter a valid category UUID."
        elif kind.startswith("time"):
            code, message = "INVALID_TIME", "Enter a valid daily time."
        elif kind == "string_type":
            code, message = "INVALID_TEXT", "Enter a string."
        else:
            code, message = "INVALID_INPUT", "Enter a value of the required type."
        path = ".".join(str(part) for part in location)
        issues.append(ValidationIssue((path,) if path else (), code, message))
    return issues


@dataclass(frozen=True)
class ValidationIssue:
    fields: tuple[str, ...]
    code: str
    message: str

    def to_dict(self) -> dict[str, object]:
        return {
            "fields": list(self.fields),
            "code": self.code,
            "message": self.message,
        }


class DomainValidationError(ValueError):
    """One or more issues; callers may combine issues across validators."""

    def __init__(self, errors: Iterable[ValidationIssue]) -> None:
        self.errors = tuple(errors)
        super().__init__("Some fields are invalid.")

    def to_dict(self) -> dict[str, object]:
        return {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": str(self),
                "details": [error.to_dict() for error in self.errors],
            }
        }

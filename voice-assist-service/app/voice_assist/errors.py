# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""Safe API errors. Messages never echo inputs, transcripts or provider responses."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: dict[str, str] | None = None):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}


def unavailable(code: str = "DEPENDENCY_UNAVAILABLE") -> ApiError:
    return ApiError(503, code, "A required service is unavailable. Retry safely.")


class ProviderError(Exception):
    """An external AI provider failed or returned an unusable result."""

    def __init__(self, stage: str):
        super().__init__(stage)
        self.stage = stage


class SupplierLookupError(Exception):
    """Supplier Service could not answer; drafting continues without a supplier."""

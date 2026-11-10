# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Implemented the safe API error envelope.
# Author review: I validated correctness and supplied additional boundary checks.

"""Safe API errors. Messages never echo inputs."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message


def unavailable(code: str = "DEPENDENCY_UNAVAILABLE") -> ApiError:
    return ApiError(503, code, "A required service is unavailable. Retry safely.")

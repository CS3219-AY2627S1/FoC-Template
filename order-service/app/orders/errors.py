# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented Order API error objects and response helpers.
# Author review: I validated correctness and added boundary checks where needed.

"""Safe domain errors; dependency payloads never become public messages."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message


def unavailable(code: str = "DEPENDENCY_UNAVAILABLE") -> ApiError:
    return ApiError(503, code, "A required service is unavailable. Retry safely with the same key.")


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "The requested resource was not found.")

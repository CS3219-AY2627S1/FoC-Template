# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented structured errors for Chat startup and request handling.
# Author review: I validated correctness and added boundary checks where needed.

from dataclasses import dataclass


@dataclass
class ApiError(Exception):
    status: int
    code: str
    message: str


def unavailable() -> ApiError:
    return ApiError(503, "SERVICE_NOT_READY", "A required service dependency is unavailable.")


def unauthorized() -> ApiError:
    return ApiError(401, "INVALID_SESSION", "A current active session is required.")


def not_found() -> ApiError:
    return ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.")


def payload(error: ApiError, correlation_id: str) -> dict:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "correlationId": correlation_id,
            "fieldErrors": [],
        }
    }

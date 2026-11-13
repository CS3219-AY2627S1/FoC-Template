# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations


class ChatError(Exception):
    """A domain error. `code` is stable and goes to clients in both HTTP and WS errors."""

    http_status = 400

    def __init__(self, code: str, message: str, http_status: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        if http_status is not None:
            self.http_status = http_status


def not_found(what: str = "conversation") -> ChatError:
    return ChatError("not_found", f"{what} not found", 404)


def not_member() -> ChatError:
    return ChatError("not_member", "you are not a member of this conversation", 403)


def closed() -> ChatError:
    return ChatError("conversation_closed", "conversation is closed", 409)


def not_allowed(message: str) -> ChatError:
    return ChatError("not_allowed", message, 403)


def invalid(message: str) -> ChatError:
    return ChatError("invalid_payload", message, 422)


def photos_unavailable() -> ChatError:
    return ChatError("photos_unavailable", "photo sharing is not available right now", 503)


def invalid_image(message: str) -> ChatError:
    return ChatError("invalid_image", message, 422)


def too_many_uploads(limit: int) -> ChatError:
    return ChatError("too_many_uploads", f"send or discard your {limit} pending photos first", 429)

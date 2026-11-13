import logging
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from ..services.limits import RateLimiter, trim_conversation
from ..services.rag_service import get_rag_system

logger = logging.getLogger(__name__)

# Everything in a request is sent to Claude, so these limits also cap what one request can cost.
MAX_QUERY_LENGTH = 1000
MAX_CONVERSATION_TURNS = 10
# Longer than a question because earlier assistant answers come back in the conversation.
MAX_TURN_LENGTH = 6000
# Enough to chat with the assistant, too few to run up a bill with a script.
QUESTIONS_PER_WINDOW = 10
WINDOW_SECONDS = 60

limiter = RateLimiter(QUESTIONS_PER_WINDOW, WINDOW_SECONDS)


class queryRequest(BaseModel):
    query: str
    conversation: list | None = None


def error_response(status_code: int, code: str, message: str):
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def is_valid_turn(turn):
    return (
        isinstance(turn, dict)
        and turn.get("role") in ("user", "assistant")
        and isinstance(turn.get("content"), str)
        and len(turn["content"]) <= MAX_TURN_LENGTH
    )


async def post_query_rag_controller(request: queryRequest, account_id: str):
    if not request.query.strip() or len(request.query) > MAX_QUERY_LENGTH:
        return error_response(400, "INVALID_QUERY", f"Ask a question of at most {MAX_QUERY_LENGTH} characters")

    raw = request.conversation or []
    if not all(is_valid_turn(turn) for turn in raw):
        return error_response(400, "INVALID_CONVERSATION", "The conversation could not be read")
    conversation = trim_conversation(raw, MAX_CONVERSATION_TURNS)

    # Checked last, so a request the service refuses anyway does not use up a question.
    if not limiter.allow(account_id):
        return error_response(429, "TOO_MANY_QUESTIONS", "You asked a lot in a short time. Wait a minute and try again")

    try:
        response = await get_rag_system().rag_query(request.query, conversation)
        return {"query": request.query, "response": response}
    except Exception:
        logger.exception("Could not answer a query")
        return error_response(500, "ASSISTANT_FAILED", "The assistant could not answer right now. Try again later")

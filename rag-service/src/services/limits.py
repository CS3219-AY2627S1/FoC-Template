import time
from collections import defaultdict, deque


def trim_conversation(conversation: list, max_turns: int) -> list:
    """The last max_turns turns, starting with a question.

    Claude expects the messages to start with the user. Cutting an even number of turns off a
    conversation that alternates keeps that, but a cut in the middle of a pair would start with an
    answer, and Claude would refuse the whole request.
    """
    turns = conversation[-max_turns:] if max_turns > 0 else []
    while turns and turns[0].get("role") != "user":
        turns = turns[1:]
    return turns


class RateLimiter:
    """At most `limit` requests per account within `window_seconds`.

    Every question is a paid call to Claude, so one account must not be able to send them without
    end. The counts live in memory: the rag-service runs as a single instance (it is not autoscaled),
    and a restart forgetting them is harmless.
    """

    def __init__(self, limit: int, window_seconds: float, clock=time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self.clock = clock
        self.calls: dict[str, deque] = defaultdict(deque)

    def allow(self, account_id: str) -> bool:
        now = self.clock()
        calls = self.calls[account_id]
        while calls and now - calls[0] >= self.window:
            calls.popleft()
        if len(calls) >= self.limit:
            return False
        calls.append(now)
        return True

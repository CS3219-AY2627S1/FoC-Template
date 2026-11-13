# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Importing the package registers every table on ``Base.metadata``."""

from app.models import (  # noqa: F401
    attachments,
    conversations,
    messages,
    outbox,
    processed_events,
    ws_tickets,
)

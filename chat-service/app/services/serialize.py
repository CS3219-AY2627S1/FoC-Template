# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Turn rows into JSON-safe dicts (ISO timestamps, string UUIDs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.models.conversations import Conversation, ConversationMember
from app.models.messages import Message


def _ts(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _id(value: uuid.UUID | None) -> str | None:
    return str(value) if value else None


def message(m: Message) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "conversation_id": str(m.conversation_id),
        "seq": m.seq,
        "sender_id": _id(m.sender_id),
        "client_msg_id": _id(m.client_msg_id),
        "kind": m.kind,
        "body": m.body,
        "payload": m.payload,
        "reply_to_id": _id(m.reply_to_id),
        "created_at": _ts(m.created_at),
        "edited_at": _ts(m.edited_at),
        "deleted_at": _ts(m.deleted_at),
    }


def member(m: ConversationMember) -> dict[str, Any]:
    return {
        "user_id": str(m.user_id),
        "label": m.label,
        "history_from_seq": m.history_from_seq,
        "delivered_seq": m.delivered_seq,
        "read_seq": m.read_seq,
        "joined_at": _ts(m.joined_at),
    }


def conversation(
    c: Conversation,
    members: list[ConversationMember],
    *,
    me: ConversationMember | None = None,
    last_message: Message | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(c.id),
        "kind": c.kind.value,
        "unique_key": c.unique_key,
        "title": c.title,
        "metadata": c.metadata_,
        "last_seq": c.last_seq,
        "last_message_at": _ts(c.last_message_at),
        "closed_at": _ts(c.closed_at),
        "purge_after": _ts(c.purge_after),
        "created_at": _ts(c.created_at),
        "members": [member(m) for m in members],
    }
    if me is not None:
        seen = max(me.read_seq, me.history_from_seq)
        visible_last = (
            last_message if last_message and last_message.seq > me.history_from_seq else None
        )
        out["me"] = {
            "history_from_seq": me.history_from_seq,
            "delivered_seq": me.delivered_seq,
            "read_seq": me.read_seq,
            "unread_count": max(0, c.last_seq - seen),
        }
        out["last_message"] = message(visible_last) if visible_last else None
    return out

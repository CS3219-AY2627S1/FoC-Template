# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Implemented conversation access, message persistence, blocking, and unread tracking.
# Author review: I validated correctness and added boundary checks where needed.

"""Transaction boundary for private conversations. PostgreSQL is authoritative."""

import hashlib
import json
from uuid import uuid4

from sqlalchemy import text

from app.errors import ApiError, not_found, unavailable


def pair(a, b):
    if a == b:
        raise ApiError(422, "INVALID_RECIPIENT", "Choose another user.")
    return tuple(sorted((a, b)))


async def lock(session, namespace, *ids):
    key = int.from_bytes(
        hashlib.blake2b(
            (namespace + ":" + ":".join(map(str, ids))).encode(), digest_size=8
        ).digest(),
        signed=True,
    )
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def message(row):
    return {
        "messageId": str(row["id"]),
        "conversationId": str(row["conversation_id"]),
        "senderUserId": str(row["sender_id"]),
        "clientMessageId": str(row["client_message_id"]),
        "sequence": row["sequence"],
        "text": row["text"],
        "createdAt": row["created_at"].isoformat(),
    }


async def member(session, conversation_id, user_id, for_update=False):
    result = await session.execute(
        text(
            """
        SELECT c.*, p.last_read_sequence FROM chat_service.conversations c
        JOIN chat_service.conversation_participants p ON p.conversation_id = c.id
        WHERE c.id = :cid AND p.user_id = :uid
    """
            + (" FOR UPDATE OF c" if for_update else "")
        ),
        {"cid": conversation_id, "uid": user_id},
    )
    row = result.mappings().first()
    if row is None:
        raise not_found()
    return row


async def blocked(session, low, high):
    return bool(
        (
            await session.execute(
                text("""
        SELECT EXISTS(SELECT 1 FROM chat_service.blocks
          WHERE (blocker_id = :a AND blocked_id = :b)
             OR (blocker_id = :b AND blocked_id = :a))
    """),
                {"a": low, "b": high},
            )
        ).scalar_one()
    )


def other(row, user_id):
    return row["user_high"] if row["user_low"] == user_id else row["user_low"]


async def enqueue(session, event_type, data):
    event_id = uuid4()
    await session.execute(
        text("""INSERT INTO chat_service.outbox_events (id,event_type,payload)
        VALUES (:id,:type,CAST(:data AS jsonb))"""),
        {"id": event_id, "type": event_type, "data": json.dumps(data)},
    )


class ChatService:
    def __init__(self, database, identity):
        self.db, self.identity = database, identity

    async def active(self, ids):
        people = await self.identity.participants(ids)
        if any(i not in people or people[i]["accountStatus"] != "ACTIVE" for i in ids):
            raise ApiError(409, "RECIPIENT_UNAVAILABLE", "Messaging is unavailable for this user.")
        return people

    async def create(self, user_id, recipient_id):
        low, high = pair(user_id, recipient_id)
        async with self.db.transaction() as session:
            await lock(session, "pair", low, high)
            existing = (
                await session.execute(
                    text("""
                SELECT id FROM chat_service.conversations WHERE user_low=:a AND user_high=:b
            """),
                    {"a": low, "b": high},
                )
            ).scalar_one_or_none()
            if existing:
                return {"conversationId": str(existing)}
            await self.active([user_id, recipient_id])
            if await blocked(session, low, high):
                raise ApiError(409, "MESSAGING_BLOCKED", "Messaging is blocked for this pair.")
            cid = uuid4()
            await session.execute(
                text("""INSERT INTO chat_service.conversations
                (id,user_low,user_high) VALUES (:id,:a,:b)"""),
                {"id": cid, "a": low, "b": high},
            )
            await session.execute(
                text("""INSERT INTO chat_service.conversation_participants
                (conversation_id,user_id) VALUES (:id,:a),(:id,:b)"""),
                {"id": cid, "a": low, "b": high},
            )
        return {"conversationId": str(cid)}

    async def summary(self, session, row, user_id, people):
        counterpart_id = other(row, user_id)
        person = people.get(counterpart_id)
        if person is None:
            # Unknown is not a tombstone. Fail closed instead of inventing an identity.
            raise unavailable()
        latest = (
            (
                await session.execute(
                    text("""SELECT * FROM chat_service.messages
            WHERE conversation_id=:cid AND sequence<=:boundary ORDER BY sequence DESC LIMIT 1"""),
                    {"cid": row["id"], "boundary": row["last_sequence"]},
                )
            )
            .mappings()
            .first()
        )
        unread = (
            await session.execute(
                text("""SELECT count(*) FROM chat_service.messages
            WHERE conversation_id=:cid AND sequence>:seq AND sequence<=:boundary
              AND sender_id<>:uid"""),
                {
                    "cid": row["id"],
                    "seq": row["last_read_sequence"],
                    "uid": user_id,
                    "boundary": row["last_sequence"],
                },
            )
        ).scalar_one()
        is_blocked = await blocked(session, row["user_low"], row["user_high"])
        return {
            "conversationId": str(row["id"]),
            "counterpart": person,
            "latestMessage": message(latest) if latest else None,
            "unreadCount": unread,
            "lastReadSequence": row["last_read_sequence"],
            "lastSequence": row["last_sequence"],
            "messagingAvailable": not is_blocked and person["accountStatus"] == "ACTIVE",
            "blocked": is_blocked,
            "createdAt": row["created_at"].isoformat(),
        }

    async def conversations(self, user_id, query):
        async with self.db.transaction() as session:
            rows = (
                (
                    await session.execute(
                        text("""
                SELECT c.*,p.last_read_sequence FROM chat_service.conversations c
                JOIN chat_service.conversation_participants p ON p.conversation_id=c.id
                WHERE p.user_id=:uid AND (CAST(:cursor AS uuid) IS NULL OR c.id>:cursor)
                ORDER BY c.id LIMIT :limit
            """),
                        {"uid": user_id, "cursor": query.cursor, "limit": query.limit + 1},
                    )
                )
                .mappings()
                .all()
            )
            selected = rows[: query.limit]
            people = await self.identity.participants([other(r, user_id) for r in selected])
            items = [await self.summary(session, r, user_id, people) for r in selected]
            return {
                "items": items,
                "nextCursor": str(selected[-1]["id"]) if len(rows) > query.limit else None,
            }

    async def conversation(self, user_id, cid):
        async with self.db.transaction() as session:
            row = await member(session, cid, user_id)
            people = await self.identity.participants([other(row, user_id)])
            return await self.summary(session, row, user_id, people)

    async def history(self, user_id, cid, query):
        async with self.db.transaction() as session:
            row = await member(session, cid, user_id)
            boundary = row["last_sequence"]
            clause, direction = "", "DESC"
            params = {"cid": cid, "limit": query.limit + 1, "boundary": boundary}
            if query.beforeSequence is not None:
                clause, params["seq"] = "AND sequence<:seq", query.beforeSequence
            if query.afterSequence is not None:
                clause, params["seq"] = "AND sequence>:seq", query.afterSequence
                direction = "ASC"
            rows = (
                (
                    await session.execute(
                        text(f"""SELECT * FROM chat_service.messages
                WHERE conversation_id=:cid AND sequence<=:boundary {clause}
                ORDER BY sequence {direction} LIMIT :limit"""),
                        params,
                    )
                )
                .mappings()
                .all()
            )
            selected = rows[: query.limit]
            if direction == "DESC":
                selected = list(reversed(selected))
            return {
                "items": [message(r) for r in selected],
                "boundarySequence": boundary,
                "lastReadSequence": row["last_read_sequence"],
                "hasMore": len(rows) > query.limit,
            }

    async def send(self, user_id, command):
        cid = command.conversationId
        async with self.db.transaction() as session:
            row = await member(session, cid, user_id)
            # Retry keys span conversations. Lock them before the pair lock everywhere.
            await lock(session, "retry", user_id, command.clientMessageId)
            existing = (
                (
                    await session.execute(
                        text("""SELECT * FROM chat_service.messages
                WHERE sender_id=:uid AND client_message_id=:client"""),
                        {"uid": user_id, "client": command.clientMessageId},
                    )
                )
                .mappings()
                .first()
            )
            if existing:
                if existing["conversation_id"] != cid or existing["text"] != command.text:
                    raise ApiError(409, "RETRY_ID_CONFLICT", "Use a new client message ID.")
                return message(existing)
            await lock(session, "pair", row["user_low"], row["user_high"])
            row = await member(session, cid, user_id, for_update=True)
            await self.active([user_id, other(row, user_id)])
            if await blocked(session, row["user_low"], row["user_high"]):
                raise ApiError(409, "MESSAGING_BLOCKED", "Messaging is blocked for this pair.")
            seq = (
                await session.execute(
                    text("""UPDATE chat_service.conversations
                SET last_sequence=last_sequence+1 WHERE id=:cid RETURNING last_sequence"""),
                    {"cid": cid},
                )
            ).scalar_one()
            mid = uuid4()
            stored = (
                (
                    await session.execute(
                        text("""INSERT INTO chat_service.messages
                (id,conversation_id,sender_id,sequence,text,client_message_id)
                VALUES (:mid,:cid,:uid,:seq,:text,:client) RETURNING *"""),
                        {
                            "mid": mid,
                            "cid": cid,
                            "uid": user_id,
                            "seq": seq,
                            "text": command.text,
                            "client": command.clientMessageId,
                        },
                    )
                )
                .mappings()
                .one()
            )
            await enqueue(
                session,
                "chat.message.created.v1",
                {"conversationId": str(cid), "messageId": str(mid), "sequence": seq},
            )
            result = message(stored)
        # Exiting the transaction commits before the caller can emit message.accepted.
        return result

    async def set_block(self, user_id, target_id, enabled):
        low, high = pair(user_id, target_id)
        async with self.db.transaction() as session:
            await lock(session, "pair", low, high)
            if enabled:
                people = await self.identity.participants([target_id])
                if target_id not in people:
                    raise ApiError(404, "USER_NOT_FOUND", "User not found.")
                await session.execute(
                    text("""INSERT INTO chat_service.blocks
                    (blocker_id,blocked_id) VALUES (:uid,:target) ON CONFLICT DO NOTHING"""),
                    {"uid": user_id, "target": target_id},
                )
            else:
                await session.execute(
                    text("""DELETE FROM chat_service.blocks
                    WHERE blocker_id=:uid AND blocked_id=:target"""),
                    {"uid": user_id, "target": target_id},
                )
            result = {
                "userId": str(target_id),
                "blockedByMe": enabled,
                "messagingBlocked": await blocked(session, low, high),
            }
        return result

    async def blocks(self, user_id, query):
        async with self.db.transaction() as session:
            ids = list(
                (
                    await session.execute(
                        text("""SELECT blocked_id FROM chat_service.blocks
                WHERE blocker_id=:uid AND (CAST(:cursor AS uuid) IS NULL OR blocked_id>:cursor)
                ORDER BY blocked_id LIMIT :limit"""),
                        {"uid": user_id, "cursor": query.cursor, "limit": query.limit + 1},
                    )
                ).scalars()
            )
            selected = ids[: query.limit]
            people = await self.identity.participants(selected)
            if any(i not in people for i in selected):
                raise unavailable()
            return {
                "items": [people[i] for i in selected],
                "nextCursor": str(selected[-1]) if len(ids) > query.limit else None,
            }

    async def event_participants(self, event):
        async with self.db.transaction() as session:
            row = (
                (
                    await session.execute(
                        text("""SELECT c.user_low,c.user_high
                FROM chat_service.messages m JOIN chat_service.conversations c
                  ON c.id=m.conversation_id
                WHERE m.id=:mid AND m.conversation_id=:cid AND m.sequence=:seq"""),
                        {
                            "mid": event.messageId,
                            "cid": event.conversationId,
                            "seq": event.sequence,
                        },
                    )
                )
                .mappings()
                .first()
            )
            return {row["user_low"], row["user_high"]} if row else set()

    async def live_message(self, user_id, event):
        async with self.db.transaction() as session:
            try:
                row = await member(session, event.conversationId, user_id)
            except ApiError as error:
                if error.status == 404:
                    return None
                raise
            await lock(session, "pair", row["user_low"], row["user_high"])
            people = await self.identity.participants([row["user_low"], row["user_high"]])
            if any(
                i not in people or people[i]["accountStatus"] != "ACTIVE"
                for i in (row["user_low"], row["user_high"])
            ):
                return None
            if await blocked(session, row["user_low"], row["user_high"]):
                return None
            stored = (
                (
                    await session.execute(
                        text("""SELECT * FROM chat_service.messages
                WHERE id=:mid AND conversation_id=:cid AND sequence=:seq"""),
                        {
                            "mid": event.messageId,
                            "cid": event.conversationId,
                            "seq": event.sequence,
                        },
                    )
                )
                .mappings()
                .first()
            )
            return message(stored) if stored else None

    async def unread_state(self, user_id, cid):
        async with self.db.transaction() as session:
            row = await member(session, cid, user_id)
            unread = (
                await session.execute(
                    text("""SELECT count(*) FROM chat_service.messages
                WHERE conversation_id=:cid AND sender_id<>:uid AND sequence>:seq
                  AND sequence<=:boundary"""),
                    {
                        "cid": cid,
                        "uid": user_id,
                        "seq": row["last_read_sequence"],
                        "boundary": row["last_sequence"],
                    },
                )
            ).scalar_one()
            return {
                "conversationId": str(cid),
                "lastReadSequence": row["last_read_sequence"],
                "unreadCount": unread,
                "boundarySequence": row["last_sequence"],
            }

    async def read(self, user_id, cid, up_to):
        async with self.db.transaction() as session:
            # Shares the conversation row lock with sequence allocation; future reads cannot race.
            row = await member(session, cid, user_id, for_update=True)
            if up_to > row["last_sequence"]:
                raise ApiError(
                    422, "INVALID_READ_BOUNDARY", "Cannot acknowledge a future sequence."
                )
            cursor = (
                await session.execute(
                    text("""UPDATE chat_service.conversation_participants
                SET last_read_sequence=greatest(last_read_sequence,:seq)
                WHERE conversation_id=:cid AND user_id=:uid RETURNING last_read_sequence"""),
                    {"seq": up_to, "cid": cid, "uid": user_id},
                )
            ).scalar_one()
            if cursor > row["last_read_sequence"]:
                await enqueue(
                    session,
                    "chat.unread.updated.v1",
                    {"conversationId": str(cid), "userId": str(user_id), "upToSequence": cursor},
                )
            unread = (
                await session.execute(
                    text("""SELECT count(*) FROM chat_service.messages
                WHERE conversation_id=:cid AND sender_id<>:uid AND sequence>:seq"""),
                    {"cid": cid, "uid": user_id, "seq": cursor},
                )
            ).scalar_one()
            result = {
                "conversationId": str(cid),
                "lastReadSequence": cursor,
                "unreadCount": unread,
                "boundarySequence": row["last_sequence"],
            }
        return result

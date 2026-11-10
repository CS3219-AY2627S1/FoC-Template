# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Chat domain logic (business rules). Queries live in `app.repositories`.

Every public method runs inside the caller's transaction and records two kinds of side
effects instead of performing them:

* `fanouts` — frames to push to users' sockets. The caller publishes them only AFTER the
  transaction commits, so clients never see data that was rolled back.
* outbox rows — domain events for other services, written in the same transaction.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.config import Settings
from app.models.attachments import Attachment
from app.models.conversations import Conversation, ConversationKind, ConversationMember
from app.models.messages import Message
from app.repositories import attachments as attachment_repo
from app.repositories import conversations as conversation_repo
from app.repositories import members as member_repo
from app.repositories import messages as message_repo
from app.repositories import outbox as outbox_repo
from app.schemas.conversations import (
    AddMemberBody,
    CreateConversationBody,
    UpdateConversationBody,
)
from app.schemas.frames import SendData
from app.schemas.payloads import ImageInput, LocationPayload, MediaPayload
from app.services import serialize


@dataclass
class Fanout:
    user_ids: list[str]
    frame: dict[str, Any]
    skip_conn: str | None = None


@dataclass
class SendResult:
    message: dict[str, Any]
    duplicate: bool


def direct_key(a: uuid.UUID, b: uuid.UUID) -> str:
    x, y = sorted([str(a), str(b)])
    return f"dm:{x}:{y}"


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass
class ChatService:
    session: AsyncSession
    settings: Settings
    fanouts: list[Fanout] = field(default_factory=list)

    # ------------------------------------------------------------------ helpers

    def _emit(
        self,
        user_ids: list[uuid.UUID] | list[str],
        frame: dict[str, Any],
        skip_conn: str | None = None,
    ) -> None:
        ids = [str(u) for u in user_ids]
        if ids:
            self.fanouts.append(Fanout(ids, frame, skip_conn))

    def _outbox(self, topic: str, payload: dict[str, Any]) -> None:
        outbox_repo.add(self.session, topic, payload)

    async def _conversation(self, conversation_id: uuid.UUID) -> Conversation:
        conv = await conversation_repo.get(self.session, conversation_id)
        if conv is None:
            raise errors.not_found()
        return conv

    async def _active_members(self, conversation_id: uuid.UUID) -> list[ConversationMember]:
        return await member_repo.active(self.session, conversation_id)

    async def _member(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID
    ) -> ConversationMember | None:
        return await member_repo.get(self.session, conversation_id, user_id)

    async def _require_member(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID
    ) -> ConversationMember:
        member = await self._member(conversation_id, user_id)
        if member is None or member.left_at is not None:
            # Don't reveal whether the conversation exists to non-members.
            if await conversation_repo.get(self.session, conversation_id) is None:
                raise errors.not_found()
            raise errors.not_member()
        return member

    async def _append(
        self,
        conversation_id: uuid.UUID,
        *,
        sender_id: uuid.UUID | None,
        kind: str,
        body: str | None = None,
        payload: dict[str, Any] | None = None,
        reply_to_id: uuid.UUID | None = None,
        client_msg_id: uuid.UUID | None = None,
    ) -> Message:
        """Allocate the next seq (row lock serialises sends per conversation) and insert."""
        seq = await conversation_repo.allocate_seq(self.session, conversation_id)
        if seq is None:
            await self._conversation(conversation_id)  # raises not_found if missing
            raise errors.closed()
        return await message_repo.create(
            self.session,
            conversation_id=conversation_id,
            seq=seq,
            sender_id=sender_id,
            client_msg_id=client_msg_id,
            kind=kind,
            body=body,
            payload=payload,
            reply_to_id=reply_to_id,
        )

    async def _system_message(
        self,
        conversation_id: uuid.UUID,
        key: str,
        params: dict[str, Any],
        *,
        recipients: list[uuid.UUID],
    ) -> Message:
        msg = await self._append(
            conversation_id, sender_id=None, kind="system", payload={"key": key, "params": params}
        )
        data = serialize.message(msg)
        self._emit(recipients, {"type": "message.new", "data": {"message": data}})
        self._outbox(
            "message.created", {"message": data, "member_ids": [str(u) for u in recipients]}
        )
        return msg

    async def _view(self, conv: Conversation, user_id: uuid.UUID | None = None) -> dict[str, Any]:
        members = await self._active_members(conv.id)
        if user_id is None:
            return serialize.conversation(conv, members)
        me = next((m for m in members if m.user_id == user_id), None)
        last = None
        if conv.last_seq:
            last = await message_repo.at_seq(self.session, conv.id, conv.last_seq)
        return serialize.conversation(conv, members, me=me, last_message=last)

    # ------------------------------------------------------------------ client reads

    async def inbox(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = await conversation_repo.for_member(self.session, user_id)
        if not rows:
            return []
        by_conv = await member_repo.active_in(self.session, [c.id for c, _ in rows])
        last_msgs = await message_repo.at_seqs(
            self.session, [(c.id, c.last_seq) for c, _ in rows if c.last_seq > 0]
        )
        return [
            serialize.conversation(
                c, by_conv.get(c.id, []), me=me, last_message=last_msgs.get(c.id)
            )
            for c, me in rows
        ]

    async def conversation_for(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID
    ) -> dict[str, Any]:
        await self._require_member(conversation_id, user_id)
        return await self._view(await self._conversation(conversation_id), user_id)

    async def history(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        *,
        before_seq: int | None = None,
        after_seq: int | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        member = await self._require_member(conversation_id, user_id)
        msgs, has_more = await message_repo.page(
            self.session,
            conversation_id,
            visible_after=member.history_from_seq,
            before_seq=before_seq,
            after_seq=after_seq,
            limit=max(1, min(limit, self.settings.history_page_max)),
        )
        return {"messages": [serialize.message(m) for m in msgs], "has_more": has_more}

    # ------------------------------------------------------------------ client writes

    async def create_direct(self, user_id: uuid.UUID, other_id: uuid.UUID) -> dict[str, Any]:
        if user_id == other_id:
            raise errors.invalid("cannot start a direct chat with yourself")
        conv, created = await conversation_repo.insert(
            self.session,
            kind=ConversationKind.direct,
            unique_key=direct_key(user_id, other_id),
            title=None,
            metadata={},
            purge_after=None,
        )
        if created:
            await member_repo.add_many(self.session, conv.id, [(user_id, None), (other_id, None)])
            self._outbox("conversation.created", await self._view(conv))
            for uid in (user_id, other_id):
                self._emit(
                    [uid],
                    {
                        "type": "conversation.added",
                        "data": {"conversation": await self._view(conv, uid)},
                    },
                )
        else:
            member = await self._member(conv.id, user_id)
            if member is None:
                raise errors.not_member()
            if member.left_at is not None:
                raise errors.not_allowed("you left this conversation")
        return await self._view(conv, user_id)

    async def create_group(
        self, user_id: uuid.UUID, title: str, member_ids: list[uuid.UUID]
    ) -> dict[str, Any]:
        ids = list(dict.fromkeys([user_id, *member_ids]))
        conv, _ = await conversation_repo.insert(
            self.session,
            kind=ConversationKind.group,
            unique_key=None,
            title=title,
            metadata={},
            purge_after=None,
        )
        await member_repo.add_many(self.session, conv.id, [(u, None) for u in ids])
        await self._system_message(
            conv.id, "group_created", {"by": str(user_id), "title": title}, recipients=[]
        )
        conv = await self._conversation(conv.id)
        self._outbox("conversation.created", await self._view(conv))
        for uid in ids:
            self._emit(
                [uid],
                {
                    "type": "conversation.added",
                    "data": {"conversation": await self._view(conv, uid)},
                },
            )
        return await self._view(conv, user_id)

    async def leave(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        conv = await self._conversation(conversation_id)
        if conv.kind == ConversationKind.direct:
            raise errors.not_allowed("you cannot leave a direct chat")
        await self._require_member(conversation_id, user_id)
        await self._remove(conv, user_id, key="member_left")

    async def send(
        self, user_id: uuid.UUID, data: SendData, *, conn_id: str | None = None
    ) -> SendResult:
        existing = await message_repo.by_client_id(self.session, user_id, data.client_msg_id)
        if existing is not None:
            if existing.conversation_id != data.conversation_id:
                raise errors.invalid("client_msg_id was already used for another conversation")
            return SendResult(serialize.message(existing), duplicate=True)

        body, payload = self._validate_content(data.kind, data.body, data.payload)
        member = await self._require_member(data.conversation_id, user_id)
        photo: Attachment | None = None
        if data.kind == "image":
            photo = await self._claim_photo(user_id, data.conversation_id, payload)
            payload = {
                "attachment_id": str(photo.id),
                "mime": photo.content_type,
                "size": photo.size,
                "width": photo.width,
                "height": photo.height,
            }

        if data.reply_to_id is not None:
            target = await message_repo.get(self.session, data.reply_to_id)
            if (
                target is None
                or target.conversation_id != data.conversation_id
                or target.seq <= member.history_from_seq
            ):
                raise errors.invalid("reply_to_id does not refer to a message in this conversation")

        msg = await self._append(
            data.conversation_id,
            sender_id=user_id,
            kind=data.kind,
            body=body,
            payload=payload,
            reply_to_id=data.reply_to_id,
            client_msg_id=data.client_msg_id,
        )
        if photo is not None:
            await attachment_repo.bind(self.session, photo.id, msg.id)
        # The sender has obviously seen their own message.
        await member_repo.advance(
            self.session, data.conversation_id, user_id, delivered_seq=msg.seq, read_seq=msg.seq
        )
        recipients = [m.user_id for m in await self._active_members(data.conversation_id)]
        out = serialize.message(msg)
        self._emit(recipients, {"type": "message.new", "data": {"message": out}}, skip_conn=conn_id)
        self._outbox(
            "message.created", {"message": out, "member_ids": [str(u) for u in recipients]}
        )
        return SendResult(out, duplicate=False)

    def _validate_content(
        self, kind: str, body: str | None, payload: dict[str, Any] | None
    ) -> tuple[str | None, dict[str, Any] | None]:
        if body is not None and len(body) > self.settings.max_body_length:
            raise errors.invalid(f"body is longer than {self.settings.max_body_length} characters")
        try:
            if kind == "text":
                if not body or not body.strip():
                    raise errors.invalid("text messages need a body")
                if payload:
                    raise errors.invalid("text messages take no payload")
                return body, None
            if kind == "image":
                return body or None, ImageInput.model_validate(payload or {}).model_dump(
                    mode="json"
                )
            if kind == "file":
                return body or None, MediaPayload.model_validate(payload or {}).model_dump(
                    exclude_none=True
                )
            if kind == "location":
                return body or None, LocationPayload.model_validate(payload or {}).model_dump(
                    exclude_none=True
                )
        except ValidationError as exc:
            raise errors.invalid(f"invalid {kind} payload: {exc.errors()[0]['msg']}") from exc
        raise errors.invalid(f"unsupported kind {kind!r}")

    async def _claim_photo(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID, payload: dict[str, Any] | None
    ) -> Attachment:
        """The sender's own unsent upload for this conversation, locked for binding."""
        photo = await attachment_repo.get_for_update(
            self.session, uuid.UUID(str((payload or {})["attachment_id"]))
        )
        if (
            photo is None
            or photo.uploader_id != user_id
            or photo.conversation_id != conversation_id
            or photo.message_id is not None
        ):
            raise errors.invalid("attachment_id is not an unsent photo of yours in this chat")
        return photo

    async def require_can_post(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        """Raise unless the user is a member of this open conversation."""
        await self._require_member(conversation_id, user_id)
        if (await self._conversation(conversation_id)).closed_at is not None:
            raise errors.closed()

    async def attachment_for(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID, attachment_id: uuid.UUID
    ) -> Attachment:
        """A photo the user may see: an unsent upload of their own, or one on a message
        in their visible history that was not deleted. Anything else is "not found"."""
        member = await self._require_member(conversation_id, user_id)
        photo = await attachment_repo.get(self.session, attachment_id)
        if photo is None or photo.conversation_id != conversation_id:
            raise errors.not_found("photo")
        if photo.message_id is None:
            if photo.uploader_id != user_id:
                raise errors.not_found("photo")
            return photo
        msg = await message_repo.get(self.session, photo.message_id)
        if msg is None or msg.deleted_at is not None or msg.seq <= member.history_from_seq:
            raise errors.not_found("photo")
        return photo

    async def _own_message(
        self, user_id: uuid.UUID, message_id: uuid.UUID
    ) -> tuple[Message, Conversation]:
        msg = await message_repo.get_for_update(self.session, message_id)
        if msg is None:
            raise errors.not_found("message")
        await self._require_member(msg.conversation_id, user_id)
        if msg.sender_id != user_id:
            raise errors.not_allowed("you can only change your own messages")
        if msg.deleted_at is not None:
            raise errors.not_allowed("message was deleted")
        conv = await self._conversation(msg.conversation_id)
        if conv.closed_at is not None:
            raise errors.closed()
        return msg, conv

    async def _broadcast_update(self, msg: Message) -> dict[str, Any]:
        out = serialize.message(msg)
        recipients = [
            m.user_id
            for m in await self._active_members(msg.conversation_id)
            if m.history_from_seq < msg.seq
        ]
        self._emit(recipients, {"type": "message.updated", "data": {"message": out}})
        self._outbox(
            "message.updated", {"message": out, "member_ids": [str(u) for u in recipients]}
        )
        return out

    async def edit(self, user_id: uuid.UUID, message_id: uuid.UUID, body: str) -> dict[str, Any]:
        msg, _ = await self._own_message(user_id, message_id)
        if msg.kind != "text":
            raise errors.not_allowed("only text messages can be edited")
        msg.body, _ = self._validate_content("text", body, None)
        msg.edited_at = _now()
        await self.session.flush()
        return await self._broadcast_update(msg)

    async def delete(self, user_id: uuid.UUID, message_id: uuid.UUID) -> dict[str, Any]:
        msg, _ = await self._own_message(user_id, message_id)
        msg.deleted_at = _now()
        msg.body = None
        msg.payload = None
        await self.session.flush()
        return await self._broadcast_update(msg)

    async def mark(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        seq: int,
        what: Literal["delivered", "read"],
    ) -> dict[str, Any] | None:
        member = await self._require_member(conversation_id, user_id)
        before = (member.delivered_seq, member.read_seq)
        conv = await self._conversation(conversation_id)
        seq = min(seq, conv.last_seq)  # can't acknowledge messages that don't exist yet
        delivered_seq, read_seq = await member_repo.advance(
            self.session,
            conversation_id,
            user_id,
            delivered_seq=seq,
            read_seq=seq if what == "read" else None,
        )
        if (delivered_seq, read_seq) == before:
            return None  # nothing moved; don't spam receipts
        receipt = {
            "conversation_id": str(conversation_id),
            "user_id": str(user_id),
            "delivered_seq": delivered_seq,
            "read_seq": read_seq,
        }
        recipients = [m.user_id for m in await self._active_members(conversation_id)]
        self._emit(recipients, {"type": "receipt", "data": receipt})
        return receipt

    async def typing(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        await self._require_member(conversation_id, user_id)
        conv = await self._conversation(conversation_id)
        if conv.closed_at is not None:
            raise errors.closed()
        others = [
            m.user_id for m in await self._active_members(conversation_id) if m.user_id != user_id
        ]
        self._emit(
            others,
            {
                "type": "typing",
                "data": {"conversation_id": str(conversation_id), "user_id": str(user_id)},
            },
        )

    # ------------------------------------------------------------------ service API

    async def create_conversation(
        self, body: CreateConversationBody
    ) -> tuple[dict[str, Any], bool]:
        members = list({m.user_id: m for m in body.members}.values())
        unique_key = body.unique_key
        if body.kind == "direct":
            if len(members) != 2:
                raise errors.invalid("a direct conversation needs exactly 2 members")
            expected = direct_key(members[0].user_id, members[1].user_id)
            if unique_key not in (None, expected):
                raise errors.invalid(
                    f"unique_key of a direct conversation must be {expected!r} or omitted"
                )
            unique_key = expected
        conv, created = await conversation_repo.insert(
            self.session,
            kind=ConversationKind(body.kind),
            unique_key=unique_key,
            title=body.title,
            metadata=body.metadata,
            purge_after=body.purge_after,
        )
        if created:
            await member_repo.add_many(
                self.session, conv.id, [(m.user_id, m.label) for m in members]
            )
            self._outbox("conversation.created", await self._view(conv))
            for m in members:
                self._emit(
                    [m.user_id],
                    {
                        "type": "conversation.added",
                        "data": {"conversation": await self._view(conv, m.user_id)},
                    },
                )
        return await self._view(conv), created

    async def find_conversations(
        self, *, unique_key: str | None, metadata: dict[str, Any] | None, limit: int = 100
    ) -> list[dict[str, Any]]:
        if unique_key is None and not metadata:
            raise errors.invalid("filter by unique_key and/or metadata")
        convs = await conversation_repo.find(
            self.session, unique_key=unique_key, metadata=metadata, limit=min(limit, 500)
        )
        return [await self._view(c) for c in convs]

    async def get_conversation(self, conversation_id: uuid.UUID) -> dict[str, Any]:
        return await self._view(await self._conversation(conversation_id))

    async def update_conversation(
        self, conversation_id: uuid.UUID, body: UpdateConversationBody
    ) -> dict[str, Any]:
        conv = await self._conversation(conversation_id)
        fields = body.model_fields_set
        if "title" in fields:
            conv.title = body.title
        if "metadata" in fields:
            conv.metadata_ = body.metadata or {}
        if "purge_after" in fields:
            conv.purge_after = body.purge_after
        await self.session.flush()
        view = await self._view(conv)
        self._emit(
            [m["user_id"] for m in view["members"]],
            {"type": "conversation.updated", "data": {"conversation": view}},
        )
        self._outbox("conversation.updated", view)
        return view

    async def add_member(self, conversation_id: uuid.UUID, body: AddMemberBody) -> dict[str, Any]:
        conv = await conversation_repo.get_for_update(self.session, conversation_id)
        if conv is None:
            raise errors.not_found()
        if conv.kind == ConversationKind.direct:
            raise errors.not_allowed("members of a direct conversation are fixed")
        if conv.closed_at is not None:
            raise errors.closed()
        existing = await self._member(conversation_id, body.user_id)
        if existing is not None and existing.left_at is None:
            if "label" in body.model_fields_set and existing.label != body.label:
                existing.label = body.label
                await self.session.flush()
                return await self.update_conversation(conversation_id, UpdateConversationBody())
            return await self._view(conv)

        others = [m.user_id for m in await self._active_members(conversation_id)]
        start = 0 if body.include_history else conv.last_seq
        # Earlier messages count as already seen, so joining doesn't reset others' ticks
        # or show a huge unread badge.
        await member_repo.join(
            self.session,
            existing,
            conversation_id=conversation_id,
            user_id=body.user_id,
            label=body.label,
            set_label="label" in body.model_fields_set,
            history_from_seq=start,
            seen_seq=conv.last_seq,
            joined_at=_now(),
        )

        await self._system_message(
            conversation_id,
            "member_added",
            {"user_id": str(body.user_id), "label": body.label},
            recipients=others,
        )
        conv = await self._conversation(conversation_id)
        view = await self._view(conv)
        self._emit(others, {"type": "conversation.updated", "data": {"conversation": view}})
        self._emit(
            [body.user_id],
            {
                "type": "conversation.added",
                "data": {"conversation": await self._view(conv, body.user_id)},
            },
        )
        self._outbox(
            "member.added", {"conversation_id": str(conversation_id), "user_id": str(body.user_id)}
        )
        return view

    async def remove_member(self, conversation_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
        conv = await self._conversation(conversation_id)
        if conv.kind == ConversationKind.direct:
            raise errors.not_allowed("members of a direct conversation are fixed")
        member = await self._member(conversation_id, user_id)
        if member is None or member.left_at is not None:
            raise errors.not_found("member")
        return await self._remove(conv, user_id, key="member_removed")

    async def _remove(self, conv: Conversation, user_id: uuid.UUID, *, key: str) -> dict[str, Any]:
        await member_repo.mark_left(self.session, conv.id, user_id)
        remaining = [m.user_id for m in await self._active_members(conv.id)]
        if conv.closed_at is None:
            await self._system_message(
                conv.id, key, {"user_id": str(user_id)}, recipients=remaining
            )
        conv = await self._conversation(conv.id)
        view = await self._view(conv)
        self._emit(
            [user_id], {"type": "conversation.removed", "data": {"conversation_id": str(conv.id)}}
        )
        self._emit(remaining, {"type": "conversation.updated", "data": {"conversation": view}})
        self._outbox("member.removed", {"conversation_id": str(conv.id), "user_id": str(user_id)})
        return view

    async def close(self, conversation_id: uuid.UUID) -> dict[str, Any]:
        conv = await self._conversation(conversation_id)
        if conv.closed_at is None:
            members = [m.user_id for m in await self._active_members(conversation_id)]
            await self._system_message(
                conversation_id, "conversation_closed", {}, recipients=members
            )
            await conversation_repo.mark_closed(self.session, conversation_id)
            conv = await self._conversation(conversation_id)
            view = await self._view(conv)
            self._emit(members, {"type": "conversation.updated", "data": {"conversation": view}})
            self._outbox("conversation.closed", view)
            return view
        return await self._view(conv)

    async def post_system_message(
        self, conversation_id: uuid.UUID, key: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        await self._conversation(conversation_id)
        members = [m.user_id for m in await self._active_members(conversation_id)]
        msg = await self._system_message(conversation_id, key, params, recipients=members)
        return serialize.message(msg)

    async def purge_expired(self, batch: int = 100) -> int:
        ids = await conversation_repo.lock_purgeable(self.session, batch)
        if not ids:
            return 0
        by_conv = await member_repo.active_in(self.session, ids)
        for conv_id in ids:
            await conversation_repo.delete(self.session, conv_id)
            self._emit(
                [m.user_id for m in by_conv.get(conv_id, [])],
                {"type": "conversation.removed", "data": {"conversation_id": str(conv_id)}},
            )
            self._outbox("conversation.purged", {"conversation_id": str(conv_id)})
        await self.session.flush()
        return len(ids)

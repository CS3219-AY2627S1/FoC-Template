# AI-influenced: photo attachments written with Claude (Opus 5.5); see ai/usage-log.md.
"""Photo uploads and downloads.

Photos are validated and re-encoded by ``foc_shared.images`` (JPEG/PNG/WebP, at most
5 MiB, metadata such as GPS stripped) and kept in a private bucket. Nobody gets a link:
the client uploads through chat-service, sends an image message that names the upload,
and reads it back through chat-service, which checks on every read that the caller may
see that message. A member who joined later, or was removed, cannot read older photos.

Objects are deleted by ``sweep`` only: rows lose their conversation (purge) or message
(delete) through SET NULL, or stay unsent past ``CHAT_PHOTO_UNSENT_TTL_S``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Protocol

from PIL import Image

from app import errors
from app.config import Settings
from app.models.attachments import Attachment
from app.repositories import attachments as attachment_repo
from app.services.chat import ChatService
from foc_shared.images import (
    ImageData,
    ImageStorageError,
    InvalidImageError,
    PrivateImageStore,
    validate_image,
)

log = logging.getLogger(__name__)


class PhotoStore(Protocol):
    """What chat-service needs from storage (``foc_shared.images.PrivateImageStore``)."""

    async def upload(self, prefix: str, image: ImageData) -> str: ...
    async def get(self, key: str) -> ImageData: ...
    async def delete(self, key: str) -> None: ...


def make_store(settings: Settings) -> PhotoStore | None:
    if not settings.chat_photo_bucket:
        return None
    return PrivateImageStore(settings.chat_photo_bucket, settings.chat_photo_region)


@dataclass(frozen=True)
class StoredPhoto:
    """A validated photo already in the bucket, not yet recorded."""

    key: str
    image: ImageData
    width: int
    height: int


# An upload runs in three steps so no database connection is held during the slow part:
#   check_upload  (short transaction)  member of an open chat, under the unsent limit
#   store_image   (no transaction)     validate + re-encode in a thread, then the S3 PUT
#   record        (short transaction)  check again (the chat may have closed), insert
# If ``record`` fails, the caller deletes the object with ``discard``.


async def check_upload(
    s: ChatService, store: PhotoStore | None, user_id: uuid.UUID, conversation_id: uuid.UUID
) -> None:
    """Refuse early: photos switched off, not allowed to post, or too many unsent."""
    if store is None:
        raise errors.photos_unavailable()
    await s.require_can_post(user_id, conversation_id)
    limit = s.settings.chat_photo_max_unsent
    if await attachment_repo.count_unbound(s.session, user_id) >= limit:
        raise errors.too_many_uploads(limit)


def _inspect(data: bytes, claimed_type: str | None) -> tuple[ImageData, int, int]:
    image = validate_image(data, claimed_type)
    with Image.open(BytesIO(image.data)) as opened:
        width, height = opened.size
    return image, width, height


async def store_image(
    store: PhotoStore | None,
    settings: Settings,
    conversation_id: uuid.UUID,
    data: bytes,
    content_type: str | None,
) -> StoredPhoto:
    """Validate and re-encode the image off the event loop, then put it in the bucket."""
    if store is None:
        raise errors.photos_unavailable()
    try:
        image, width, height = await asyncio.to_thread(_inspect, data, content_type)
    except InvalidImageError as exc:
        raise errors.invalid_image(str(exc)) from exc
    try:
        key = await store.upload(f"{settings.chat_photo_prefix}/{conversation_id}", image)
    except ImageStorageError as exc:
        raise errors.photos_unavailable() from exc
    return StoredPhoto(key=key, image=image, width=width, height=height)


async def record(
    s: ChatService,
    store: PhotoStore | None,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    photo: StoredPhoto,
) -> Attachment:
    """Insert the row for a stored photo, after checking again that the user may post."""
    await check_upload(s, store, user_id, conversation_id)
    return await attachment_repo.create(
        s.session,
        conversation_id=conversation_id,
        uploader_id=user_id,
        object_key=photo.key,
        content_type=photo.image.content_type,
        size=len(photo.image.data),
        width=photo.width,
        height=photo.height,
    )


async def discard(store: PhotoStore | None, key: str) -> None:
    """Delete an object whose row was never written (it would be unreachable)."""
    if store is None:
        return
    try:
        await store.delete(key)
    except ImageStorageError:
        log.warning("could not delete orphaned photo %s", key)


async def read(store: PhotoStore | None, attachment: Attachment) -> ImageData:
    if store is None:
        raise errors.photos_unavailable()
    try:
        return await store.get(attachment.object_key)
    except ImageStorageError as exc:
        raise errors.photos_unavailable() from exc


async def sweep(s: ChatService, store: PhotoStore, batch: int = 50) -> int:
    """Delete objects (then rows) for purged conversations, deleted messages and photos
    never sent. Returns how many were removed."""
    cutoff = datetime.now(UTC) - timedelta(seconds=s.settings.chat_photo_unsent_ttl_s)
    rows = await attachment_repo.lock_garbage(s.session, unbound_before=cutoff, limit=batch)
    removed: list[uuid.UUID] = []
    for row in rows:
        try:
            await store.delete(row.object_key)
        except ImageStorageError:
            log.warning("could not delete photo %s; will retry", row.object_key)
            continue
        removed.append(row.id)
    await attachment_repo.delete_many(s.session, removed)
    return len(removed)

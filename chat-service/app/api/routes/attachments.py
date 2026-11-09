# AI-influenced: photo attachments written with Claude (Opus 5.5); see ai/usage-log.md.
"""Photo upload and download. Sending a photo is a normal `send` frame with
{"kind": "image", "payload": {"attachment_id": ...}} after uploading it here."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from app.api.deps import current_user
from app.schemas.attachments import AttachmentResponse
from app.services import photos
from app.state import AppState, get_state
from foc_shared.images import MAX_IMAGE_BYTES

router = APIRouter(prefix="/chat/conversations/{conversation_id}/attachments", tags=["photos"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_photo(
    conversation_id: uuid.UUID,
    file: Annotated[UploadFile, File()],
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> AttachmentResponse:
    """Upload a JPEG, PNG or WebP photo (at most 5 MiB) to a chat you are in."""
    data = await file.read(MAX_IMAGE_BYTES + 1)
    store = state.photos
    # Two short transactions around the slow part, so uploads never hold a pooled
    # database connection while an image is processed or sent to the bucket.
    await state.run(lambda s: photos.check_upload(s, store, user, conversation_id))
    stored = await photos.store_image(
        store, state.settings, conversation_id, data, file.content_type
    )
    try:
        photo = await state.run(lambda s: photos.record(s, store, user, conversation_id, stored))
    except BaseException:
        await photos.discard(store, stored.key)  # covers a failed commit too
        raise
    return AttachmentResponse(
        attachment_id=photo.id,
        content_type=photo.content_type,
        size=photo.size,
        width=photo.width,
        height=photo.height,
    )


@router.get("/{attachment_id}")
async def download_photo(
    conversation_id: uuid.UUID,
    attachment_id: uuid.UUID,
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> Response:
    """The photo's bytes, if you may see the message it belongs to."""
    photo = await state.run(lambda s: s.attachment_for(user, conversation_id, attachment_id))
    image = await photos.read(state.photos, photo)
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )

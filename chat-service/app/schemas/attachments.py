# AI-influenced: photo attachments written with Claude (Opus 5.5); see ai/usage-log.md.
from __future__ import annotations

import uuid

from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    """An uploaded photo. Send it with {"kind": "image", "payload": {"attachment_id": id}}."""

    attachment_id: uuid.UUID
    content_type: str
    size: int
    width: int
    height: int

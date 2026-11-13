# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Message payloads; the shape depends on the message kind."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ImageInput(BaseModel):
    """What a client sends for an image: a photo it uploaded to this conversation."""

    model_config = ConfigDict(extra="forbid")
    attachment_id: uuid.UUID


class MediaPayload(BaseModel):
    """file: a link to a file kept elsewhere. Images are uploaded instead (ImageInput)."""

    model_config = ConfigDict(extra="forbid")
    url: Annotated[str, Field(min_length=1, max_length=2048, pattern=r"^https?://")]
    mime: str | None = Field(default=None, max_length=255)
    size: int | None = Field(default=None, ge=0)
    name: str | None = Field(default=None, max_length=255)


class LocationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str | None = Field(default=None, max_length=255)


class SystemPayload(BaseModel):
    """Template key + params, so clients render the text in the user's language."""

    model_config = ConfigDict(extra="forbid")
    key: Annotated[str, Field(min_length=1, max_length=100)]
    params: dict[str, Any] = Field(default_factory=dict)


UserMessageKind = Literal["text", "image", "file", "location"]

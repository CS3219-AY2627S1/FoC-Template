# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
# Scope: Implemented authenticated voice drafting, request limits and empty-errand handling.
# Author review: I validated correctness, and added boundary checks.

"""Voice Assist routes. A draft is returned to the caller only; nothing is stored or forwarded
to Order or Credit (N3F3.1.3, N3NFR3.1, N3NFR3.4)."""

import asyncio
import logging
import re
import time
from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Header, Request, Response

from app.voice_assist.auth import BearerToken, Requester
from app.voice_assist.errors import ApiError, ProviderError, SupplierLookupError
from app.voice_assist.matching import match_supplier, normalize
from app.voice_assist.postprocess import (
    MAX_NOTE,
    PARAPHRASE_THRESHOLD,
    build_fields,
    stated,
    supplier_field,
)
from app.voice_assist.providers import AUDIO_EXTENSIONS
from app.voice_assist.schemas import DraftFields, DraftResponse, StatusResponse, SupplierField

router = APIRouter(prefix="/v1/voice-assist", tags=["Voice Assist"])
logger = logging.getLogger("voice_assist")

_REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
# Speech models sometimes emit these for silence.
_SILENCE = {"", "you", "thank you", "thanks for watching", "bye"}


@router.get("/status", response_model=StatusResponse, response_model_by_alias=True)
async def status(request: Request, _requester: Requester) -> StatusResponse:
    settings = request.app.state.settings
    available = settings.provider_configured and request.app.state.limiter.daily_available()
    return StatusResponse(
        available=available,
        provider="OpenAI" if settings.voice_assist_provider == "openai" else "Demo (no provider)",
        processing_timeout_seconds=30,
        retention_notice=settings.voice_assist_retention_notice,
    )


async def _read_audio(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    too_large = ApiError(413, "AUDIO_TOO_LARGE", "The recording is too large. Record up to 60 s.")
    if declared and declared.isdigit() and int(declared) > limit:
        raise too_large
    # Held in memory only: never written to disk or the database (N3NFR3.4).
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise too_large
        chunks.append(chunk)
    if not size:
        raise ApiError(422, "EMPTY_AUDIO", "The recording was empty. Record again.")
    return b"".join(chunks)


@router.post("/errand-drafts", response_model=DraftResponse, response_model_by_alias=True)
async def create_draft(
    request: Request,
    response: Response,
    requester: Requester,
    token: BearerToken,
    content_type: Annotated[str | None, Header()] = None,
    x_client_request_id: Annotated[str | None, Header()] = None,
) -> DraftResponse:
    state = request.app.state
    settings = state.settings
    request_id = (
        x_client_request_id
        if x_client_request_id and _REQUEST_ID.fullmatch(x_client_request_id)
        else uuid4().hex
    )
    response.headers["X-Client-Request-Id"] = request_id
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type not in AUDIO_EXTENSIONS:
        raise ApiError(415, "UNSUPPORTED_AUDIO", "This recording format is not supported.")
    if not settings.provider_configured:
        raise ApiError(
            503, "VOICE_ASSIST_UNAVAILABLE", "Voice drafting is unavailable. Fill in the form."
        )
    # N3NFR4.1: counted before any provider call, so rejected requests cost nothing.
    state.limiter.acquire(requester.user_id)
    audio = await _read_audio(request, settings.voice_assist_max_audio_bytes)

    started = time.monotonic()
    request_time = state.clock()
    outcome = "FAILED"
    statuses: dict[str, str] = {}
    try:
        async with asyncio.timeout(settings.voice_assist_total_timeout_seconds):
            async with asyncio.timeout(settings.voice_assist_transcribe_timeout_seconds):
                transcript = await state.transcriber.transcribe(audio, media_type)
            del audio
            transcript = " ".join(transcript.split())
            if normalize(transcript) in _SILENCE:
                outcome = "NO_SPEECH"
                return DraftResponse(
                    request_id=request_id,
                    generated_at=request_time,
                    outcome=outcome,
                    transcript="",
                )
            async with asyncio.timeout(settings.voice_assist_draft_timeout_seconds):
                extracted = await state.drafter.draft(transcript)
            if extracted.errand_count != 1:
                # N3F1.2.1: speech that describes no errand (noise, or text a model produced from
                # silence) gets no draft, just like a recording with no speech.
                outcome = "MULTIPLE_ERRANDS" if extracted.errand_count >= 2 else "NO_ERRAND"
                return DraftResponse(
                    request_id=request_id,
                    generated_at=request_time,
                    outcome=outcome,
                    transcript=transcript,
                )
            fields = build_fields(extracted, transcript, request_time)
            try:
                suppliers = await state.suppliers.active(token)
            except SupplierLookupError:
                suppliers = None
            supplier = await _supplier(state, extracted, transcript, suppliers, token)
            draft = DraftFields(supplier=supplier, **fields)
            statuses = {name: field.status for name, field in draft}
            if all(status == "MISSING" for status in statuses.values()):
                outcome = "NO_ERRAND"
                return DraftResponse(
                    request_id=request_id,
                    generated_at=request_time,
                    outcome=outcome,
                    transcript=transcript,
                )
            outcome = "DRAFT"
            return DraftResponse(
                request_id=request_id,
                generated_at=request_time,
                outcome=outcome,
                transcript=transcript,
                fields=draft,
            )
    except TimeoutError:
        outcome = "TIMEOUT"
        raise ApiError(
            504, "PROVIDER_TIMEOUT", "Drafting took too long. Record again or fill in the form."
        ) from None
    except ProviderError as error:
        outcome = f"{error.stage}_FAILED"
        stage = "transcribe" if error.stage == "TRANSCRIPTION" else "draft"
        raise ApiError(
            502,
            f"{error.stage}_FAILED",
            f"We could not {stage} your recording. Record again or fill in the form.",
        ) from None
    finally:
        # Identifiers, outcome and per-field status only: never audio, transcript or values.
        logger.info(
            "voice draft",
            extra={
                "request_id": request_id,
                "user_id": str(requester.user_id),
                "outcome": outcome,
                "field_statuses": statuses,
                "duration_ms": round((time.monotonic() - started) * 1000),
            },
        )


async def _supplier(state, extracted, transcript, suppliers, token) -> SupplierField:
    """N3F2.2.2: only a match Supplier still reports as ACTIVE becomes the suggestion."""
    conflict = next(
        (
            " ".join(c.reason.split())[:MAX_NOTE]
            for c in extracted.conflicts
            if c.field == "supplier"
        ),
        None,
    )
    spoken = [
        value if stated(value, transcript, PARAPHRASE_THRESHOLD) else None
        for value in (extracted.pickup_supplier_name, extracted.pickup_area)
    ]
    match = match_supplier(*spoken, suppliers or [])
    detail = None
    if match.status == "FILLED" and conflict is None:
        try:
            detail = await state.suppliers.detail(match.supplier.id, token)
        except SupplierLookupError:
            detail = None
    return supplier_field(match, detail, conflict)


def utc_now() -> datetime:
    return datetime.now(UTC)

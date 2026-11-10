# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Implemented transcript-grounded voice-draft validation and field processing.
# Author review: I validated correctness, and added boundary checks.

"""Turn the provider's extraction into reviewable form fields (N3F2.1.1-2.1.6, N3F2.2.2-2.2.3).

Everything here is deterministic. A value the transcript does not support is dropped rather
than shown, so generated text can never silently invent a field (N3F2.1.2)."""

import re
from datetime import datetime

from rapidfuzz import fuzz

from app.voice_assist import times
from app.voice_assist.matching import MatchResult, normalize
from app.voice_assist.schemas import (
    DraftField,
    ExtractedDraft,
    SupplierCandidate,
    SupplierDetail,
    SupplierField,
    SupplierOption,
    SupplierSuggestion,
)

MAX_DESCRIPTION = 1000
MAX_LOCATION = 300
MAX_REWARD = 2_147_483_647
MAX_NOTE = 200
QUOTE_THRESHOLD = 90
PARAPHRASE_THRESHOLD = 80


def stated(phrase: str | None, transcript: str, threshold: int = QUOTE_THRESHOLD) -> bool:
    """True when the phrase (approximately) appears in what the requester said. Numbers must
    match exactly: "6 credits" is not a near-miss of a spoken "5 credits"."""
    words, said = normalize(phrase or ""), normalize(transcript)
    if not words or not set(re.findall(r"\d+", words)) <= set(re.findall(r"\d+", said)):
        return False
    return fuzz.partial_ratio(words, said) >= threshold


def _text(value: str | None, transcript: str, limit: int, label: str, threshold: int):
    text = " ".join((value or "").split())
    if not text or not stated(text, transcript, threshold):
        return DraftField(status="MISSING", note=f"Enter the {label}.")
    if len(text) > limit:
        return DraftField(
            value=text, status="CONFLICT", note=f"Shorten the {label} to {limit:,} characters."
        )
    return DraftField(value=text, status="FILLED")


def _reward(extracted: ExtractedDraft, transcript: str) -> DraftField:
    reward = extracted.reward
    if reward is None or not stated(reward.raw, transcript):
        return DraftField(status="MISSING", note="Enter a credit reward.")
    if reward.amount is None:
        return DraftField(status="AMBIGUOUS", note="We could not tell the reward. Enter it.")
    if reward.amount != int(reward.amount):
        return DraftField(status="AMBIGUOUS", note="Rewards are whole credits. Enter the amount.")
    amount = int(reward.amount)
    if not 1 <= amount <= MAX_REWARD:
        return DraftField(status="CONFLICT", note="Enter a reward of at least 1 credit.")
    # N3F2.1.6: any spoken unit is accepted, but credits are not money.
    note = None if reward.unit == "CREDITS" else f"Taken as {amount} credits."
    return DraftField(value=amount, status="FILLED", note=note)


def _time(phrase, label: str, transcript: str, now: datetime) -> DraftField:
    if phrase is not None and not stated(phrase.raw, transcript):
        phrase = None
    return times.resolve(phrase, now, label)


def build_fields(
    extracted: ExtractedDraft, transcript: str, now: datetime
) -> dict[str, DraftField]:
    fields = {
        "itemDescription": _text(
            extracted.item_description,
            transcript,
            MAX_DESCRIPTION,
            "instructions",
            PARAPHRASE_THRESHOLD,
        ),
        "deliveryLocation": _text(
            extracted.delivery_location,
            transcript,
            MAX_LOCATION,
            "delivery location",
            QUOTE_THRESHOLD,
        ),
        "reward": _reward(extracted, transcript),
        "acceptanceDeadline": _time(
            extracted.acceptance_time, "latest acceptance time", transcript, now
        ),
        "deliveryDeadline": _time(extracted.delivery_time, "latest delivery time", transcript, now),
    }
    # N3F2.1.4: a delivery deadline is never reused as the acceptance deadline.
    if fields["acceptanceDeadline"].status == "MISSING":
        fields[
            "acceptanceDeadline"
        ].note = "Enter the latest acceptance time. A delivery time is not used for it."
    accept, deliver = fields["acceptanceDeadline"], fields["deliveryDeadline"]
    if accept.status == deliver.status == "FILLED" and deliver.value <= accept.value:
        for item in (accept, deliver):
            item.status = "CONFLICT"
            item.note = "Delivery must be later than acceptance."
    for conflict in extracted.conflicts:
        target = fields.get(conflict.field)
        if target is not None:
            target.status = "CONFLICT"
            target.note = (" ".join(conflict.reason.split())[:MAX_NOTE]) or "Check this field."
    return fields


def _option(supplier: SupplierCandidate) -> SupplierOption:
    return SupplierOption(
        id=supplier.id,
        name=supplier.name,
        building_area=supplier.building_area,
        floor=supplier.floor,
    )


def supplier_field(
    match: MatchResult, detail: SupplierDetail | None, conflicted: str | None = None
) -> SupplierField:
    """The supplier is filled only when Supplier confirms the match is still ACTIVE."""
    candidates = [_option(s) for s in match.candidates]
    if conflicted is not None:
        return SupplierField(status="CONFLICT", note=conflicted, candidates=candidates)
    if match.status != "FILLED":
        return SupplierField(status=match.status, note=match.note, candidates=candidates)
    if detail is None:
        return SupplierField(status="MISSING", note="Choose the pickup supplier.")
    return SupplierField(
        value=detail.id,
        status="FILLED",
        note="Suggested from your recording. Change it if needed.",
        suggestion=SupplierSuggestion(
            id=detail.id,
            name=detail.name,
            building_area=detail.building_area,
            floor=detail.floor,
            pickup_location_description=detail.pickup_location_description,
        ),
    )

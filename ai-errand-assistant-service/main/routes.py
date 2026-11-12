#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated the rate limiting logic for the AI Errand Assistant Service.
#  Author review: Code changes were checked and validated


import asyncio
import re
from datetime import datetime, timedelta
from math import ceil
from statistics import median
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from main.auth import AuthenticatedUser, authenticated_user
from main.integrations import fetch_completed_history, fetch_supplier_catalog
from main.llm import BUSINESS_TIMEZONE, MAX_CREDITS, generate_extraction
from main.ratelimit import draft_rate_limiter_from_env
from main.schemas import (
    BuildingCandidate,
    DraftRequest,
    DraftResponse,
    ErrandHistoryItem,
    LLMExtraction,
    SupplierCandidate,
)


router = APIRouter()
draft_rate_limiter = draft_rate_limiter_from_env()

HISTORY_CONTEXT_SIZE = 100
DEFAULT_BASE_CREDITS = 5
MAX_DEADLINE = timedelta(days=7)
UTC = ZoneInfo("UTC")
DESCRIPTION_MAX_LENGTH = 500
ARRIVAL_NOTE = "Please message me when you arrive."
ARRIVAL_NOTE_PATTERN = re.compile(
    r"\b(?:message|text|call|ping|contact|notify|let me know|whatsapp|telegram)\b",
    re.IGNORECASE,
)
# How far after a deadline marker ("by", "before", ...) to look for clock times.
MARKER_LOOKAHEAD = 48

DEADLINE_MARKER_PATTERN = re.compile(
    r"\b(?:by|before|until|due|deadline|no later than|at)\b",
    re.IGNORECASE,
)
# Dates in the message. Only used so numbers inside a date ("12 Nov 2026") are not
# mistaken for clock times; the deadline's date itself is decided by the LLM.
DATE_PATTERN = re.compile(
    r"\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b"
    r"|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b"
    r"|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b"
    r"|\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|"
    r"may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|"
    # The optional year keeps "12 Nov 2026" from being read as the time 20:26.
    r"nov(?:ember)?|dec(?:ember)?)(?:,?\s+20\d{2})?\b",
    re.IGNORECASE,
)
CLOCK_PATTERN = re.compile(
    r"\b(?:"
    # 24-hour without a separator: 1700, 0930, 1700hrs, 1700 h
    # (Spaces sit inside the optional suffix so a match never ends in trailing
    # whitespace, which would push it outside a date span it belongs to.)
    r"(?:[01]\d|2[0-3])[0-5]\d(?:\s*(?:hrs?|h))?"
    # 5, 5pm, 5.30pm, 5:30 p.m., 17:30, 17.30, 17:30hrs
    r"|(?:[01]?\d|2[0-3])(?:[:.][0-5]\d)?(?:\s*(?:[ap]\.?m\.?|hrs?|h))?"
    r"|noon|midnight"
    r")\b",
    re.IGNORECASE,
)
WORD_PATTERN = re.compile(r"[a-z0-9]+")
# One word that can state a floor: "2", "02", "l2", "lvl2", "level2", "b1", "2nd".
# A number fused to anything else ("1h", "5pm", "10cr") is not a floor.
FLOOR_WORD_PATTERN = re.compile(r"(?:level|lvl|floor|flr|fl|l|(b))?0*(\d{1,2})(?:st|nd|rd|th)?")
SENTENCE_PATTERN = re.compile(r"[^.!?]+[.!?]*")
# Words too common in supplier/building names to identify one on their own.
GENERIC_NAME_WORDS = frozenset({
    "the", "and", "cafe", "coffee", "food", "foods", "shop", "store", "express", "kitchen",
    "court", "bar", "house", "block", "blk", "library", "park", "building", "hall",
    "centre", "center", "engineering", "memorial", "science", "central", "unmanned",
    "convenience",
})


def _words(text: str) -> list[str]:
    return WORD_PATTERN.findall(text.casefold())


def _names_place(message: str, name: str) -> bool:
    """Whether the message names this supplier or building.

    Matches the whole name ignoring spaces and punctuation ("Com 2" = "com2"),
    or any distinctive word of it ("deck" for "The Deck", "chong" for
    "Chong Pang Tai Zhi Wei"). Generic words such as "cafe" do not count.
    """
    name_words = _words(name)
    message_words = _words(message)
    if name_words and "".join(name_words) in "".join(message_words):
        return True
    message_word_set = set(message_words)
    return any(
        len(word) >= 3 and word not in GENERIC_NAME_WORDS and word in message_word_set
        for word in name_words
    )


def _floor_keys(text: str) -> set[str]:
    """Floors a text could be naming, e.g. {"2"} for "L2", {"b1"} for "B1"."""
    keys = set()
    for word in _words(text):
        match = FLOOR_WORD_PATTERN.fullmatch(word)
        if match is not None:
            basement, number = match.groups()
            keys.add(f"{'b' if basement else ''}{int(number)}")
    return keys


def _verified_floor(floor: str | None, message: str) -> str | None:
    """Accept the LLM's floor only if the message states it.

    The LLM decides which number is the floor; the backend only checks that
    number appears in the message as a word of its own ("level 2", "L2",
    "#02-10"). Numbers fused to a unit ("in 1h", "by 5pm") never count, so a
    duration or time cannot become a floor. Floors without a number ("ground")
    must appear word for word.
    """
    if not floor:
        return None
    floor_keys = _floor_keys(floor)
    if floor_keys:
        return floor if floor_keys & _floor_keys(message) else None
    message_words = set(_words(message))
    return floor if all(word in message_words for word in _words(floor)) else None


def _without_unstated_places(
    description: str | None,
    message: str,
    suppliers: list[SupplierCandidate],
    buildings: list[BuildingCandidate],
) -> str | None:
    """Drop sentences that name a catalog place the user never mentioned.

    The LLM sometimes writes the supplier it matched into the instructions
    ("pick up from Arise and Shine") even though the message did not name it.
    """
    if not description:
        return description
    names = {supplier.name for supplier in suppliers}
    names |= {supplier.building for supplier in suppliers}
    names |= {building.name for building in buildings}
    unstated = [name for name in names if name.strip() and not _names_place(message, name)]
    kept = [
        sentence.strip()
        for sentence in SENTENCE_PATTERN.findall(description)
        if sentence.strip() and not any(_names_place(sentence, name) for name in unstated)
    ]
    return " ".join(kept)


def _verified_supplier(
    supplier_id: UUID | None, message: str, suppliers: list[SupplierCandidate]
) -> UUID | None:
    """Accept the LLM's supplier only if the message clearly identifies it.

    Either the message names the supplier itself, or it names the supplier's
    building and no other supplier is in that building. A building with several
    suppliers (such as The Deck food court) is ambiguous, so the field is left
    empty for the user to choose instead of guessing a stall.
    """
    chosen = next((supplier for supplier in suppliers if supplier.id == supplier_id), None)
    if chosen is None:
        return None
    if _names_place(message, chosen.name):
        return chosen.id
    building = chosen.building.casefold()
    in_building = [supplier for supplier in suppliers if supplier.building.casefold() == building]
    if len(in_building) == 1 and _names_place(message, chosen.building):
        return chosen.id
    return None


def _urgency_multiplier(minutes_until_deadline: float) -> float:
    if minutes_until_deadline <= 30:
        return 2
    if minutes_until_deadline <= 120:
        return 1.5
    return 1


def _clock_values(text: str) -> set[tuple[int, int]]:
    """Every (hour, minute) a clock token could mean.

    A bare hour such as "5" or "5:30" is ambiguous, so both the AM and PM
    readings are returned; the LLM picks the intended one and the backend only
    checks it was mentioned. Times that are clearly 24-hour (1700, 1700hrs,
    08:00 with a leading zero, 17:30, 00:30) have a single reading.
    """
    value = text.strip().casefold()
    if value == "noon":
        return {(12, 0)}
    if value == "midnight":
        return {(0, 0)}

    four_digit = re.fullmatch(r"(\d{2})(\d{2})\s*(?:hrs?|h)?", value)
    if four_digit is not None:
        hour, minute = int(four_digit.group(1)), int(four_digit.group(2))
        return {(hour, minute)} if hour <= 23 and minute <= 59 else set()

    clock = re.fullmatch(r"(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?m\.?|(hrs?|h))?", value)
    if clock is None:
        return set()
    hour_text, minute_text, meridiem, twenty_four_hour_suffix = clock.groups()
    hour = int(hour_text)
    minute = int(minute_text or "0")
    if hour > 23 or minute > 59:
        return set()
    if meridiem:
        if not 1 <= hour <= 12:
            return set()
        return {(hour % 12 + (12 if meridiem == "p" else 0), minute)}
    if twenty_four_hour_suffix or hour_text.startswith("0") or hour == 0 or hour > 12:
        return {(hour, minute)}
    return {(hour % 12, minute), (hour % 12 + 12, minute)}


def _clock_candidates(message: str) -> set[tuple[int, int]]:
    """Clock times the message mentions after a deadline marker.

    This set is deliberately generous (it may include e.g. "level 2" read as a
    time). It only has to contain the real deadline so that the LLM's choice can
    be verified; the LLM is what tells floors and times apart.
    """
    date_spans = [match.span() for match in DATE_PATTERN.finditer(message)]
    candidates: set[tuple[int, int]] = set()
    for marker in DEADLINE_MARKER_PATTERN.finditer(message):
        # "at" usually introduces a place ("at The Deck"), so after "at" only a
        # clock time immediately following it counts ("at 5pm").
        immediate_only = marker.group(0).casefold() == "at"
        window_end = min(len(message), marker.end() + MARKER_LOOKAHEAD)
        for match in CLOCK_PATTERN.finditer(message, marker.end(), window_end):
            if immediate_only and message[marker.end():match.start()].strip():
                break
            if any(start <= match.start() and match.end() <= end for start, end in date_spans):
                continue
            candidates |= _clock_values(match.group(0))
            if immediate_only:
                break
    return candidates


def _relative_deadline(minutes: int | None, now: datetime) -> datetime | None:
    """Deadline for a duration the LLM read from the message ("in 1h" -> 60).

    The LLM only interprets the wording; the time itself is computed here as
    now + minutes, and must fall within MAX_DEADLINE.
    """
    if minutes is None or minutes < 1 or minutes > MAX_DEADLINE.total_seconds() / 60:
        return None
    return now.astimezone(UTC) + timedelta(minutes=minutes)


def _parse_explicit_deadline(value: str | None, message: str, now: datetime) -> datetime | None:
    """Accept the LLM's clock deadline only if the message actually states it.

    The LLM's local hour:minute must be one the message mentions after a
    deadline marker. The LLM decides the date (so "tmr", "this friday" or any
    other wording works); the backend only checks the result is in the future
    and within MAX_DEADLINE. Relative deadlines are handled by _relative_deadline.
    """
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=BUSINESS_TIMEZONE)

    parsed_local = parsed.astimezone(BUSINESS_TIMEZONE)
    if (parsed_local.hour, parsed_local.minute) not in _clock_candidates(message):
        return None

    deadline = parsed_local.astimezone(UTC)
    now_utc = now.astimezone(UTC)
    if deadline <= now_utc or deadline > now_utc + MAX_DEADLINE:
        return None
    return deadline


def _with_arrival_note(description: str | None) -> str:
    """Courier instructions always ask the courier to message on arrival."""
    description = (description or "").strip()
    if ARRIVAL_NOTE_PATTERN.search(description):
        return description[:DESCRIPTION_MAX_LENGTH]
    room = DESCRIPTION_MAX_LENGTH - len(ARRIVAL_NOTE) - 1
    description = description[:room].rstrip()
    return f"{description} {ARRIVAL_NOTE}" if description else ARRIVAL_NOTE


def _history_context(
    items: list[dict],
    suppliers: list[SupplierCandidate],
) -> list[dict[str, object]]:
    supplier_names = {supplier.id: supplier.name for supplier in suppliers}
    result: list[dict[str, object]] = []
    for item in items[:HISTORY_CONTEXT_SIZE]:
        try:
            history = ErrandHistoryItem.model_validate(item)
        except ValidationError as exc:
            raise HTTPException(502, "Order Service returned invalid history data") from exc
        lead_minutes = max(
            0,
            int((history.expires_at - history.created_at).total_seconds() // 60),
        )
        result.append(
            {
                "history_index": len(result),
                "item": history.required_item[:100],
                "supplier_id": str(history.supplier_id),
                "supplier_name": supplier_names.get(history.supplier_id),
                "credit_value": history.credit_value,
                "deadline_lead_minutes": lead_minutes,
            }
        )
    return result


def _base_credit(entry: dict[str, object]) -> float:
    """A past errand's credit with its own urgency premium removed.

    Without this, urgent past errands inflate the median and the current
    request's urgency multiplier is applied on top of it a second time.
    """
    multiplier = _urgency_multiplier(float(entry["deadline_lead_minutes"]))
    return int(entry["credit_value"]) / multiplier


def _response(
    extraction: LLMExtraction,
    message: str,
    suppliers: list[SupplierCandidate],
    buildings: list[BuildingCandidate],
    history_context: list[dict[str, object]],
    history_count: int,
    now: datetime,
) -> DraftResponse:
    supplier_names = {candidate.id: candidate.name for candidate in suppliers}
    supplier_id = _verified_supplier(extraction.supplier_id, message, suppliers)
    building_names = {candidate.id: candidate.name for candidate in buildings}
    building_id = (
        extraction.delivery_building_id
        if extraction.delivery_building_id in building_names
        else None
    )
    item = extraction.required_item.strip() if extraction.required_item else None
    floor = _verified_floor(
        extraction.delivery_floor.strip() if extraction.delivery_floor else None, message,
    )
    description = _with_arrival_note(
        _without_unstated_places(extraction.delivery_description, message, suppliers, buildings)
    )
    deadline = _parse_explicit_deadline(
        extraction.expires_at, message, now
    ) or _relative_deadline(extraction.deadline_in_minutes, now)

    selected_indices = sorted(
        {index for index in extraction.similar_history_indices if 0 <= index < len(history_context)}
    )
    similar_credits = [_base_credit(history_context[index]) for index in selected_indices]
    all_credits = [_base_credit(entry) for entry in history_context]
    reference_credits = similar_credits or all_credits
    historical_base = (
        min(MAX_CREDITS, max(1, ceil(median(reference_credits))))
        if reference_credits
        else DEFAULT_BASE_CREDITS
    )

    requested = extraction.requested_credits
    if requested is not None and requested >= 1:
        # The user's own offer takes priority over the history-based estimate,
        # and is not raised for urgency.
        credits = min(MAX_CREDITS, requested)
        reason = f"You offered {requested} credits."
        if credits < requested:
            reason = f"{reason} Capped at {MAX_CREDITS} credits."
    else:
        multiplier = 1.0
        if deadline is not None:
            minutes = (deadline - now.astimezone(UTC)).total_seconds() / 60
            multiplier = _urgency_multiplier(minutes)
        urgency_adjusted = ceil(historical_base * multiplier)
        credits = min(MAX_CREDITS, urgency_adjusted)

        if similar_credits:
            reason = (
                f"Based on the median of {len(similar_credits)} similar completed errands "
                f"({historical_base} credits before urgency)."
            )
        elif all_credits:
            reason = (
                f"No similar completed errands were identified; used the median of "
                f"{len(all_credits)} completed errands ({historical_base} credits before urgency)."
            )
        else:
            reason = (
                f"No completed errands were available; used the {DEFAULT_BASE_CREDITS}-credit default."
            )
        if multiplier > 1:
            reason = f"{reason} Applied {multiplier:g}x for the deadline."
        if credits < urgency_adjusted:
            reason = f"{reason} Capped at {MAX_CREDITS} credits."

    return DraftResponse(
        supplier_id=supplier_id,
        supplier_name=supplier_names.get(supplier_id),
        required_item=item or None,
        delivery_building_id=building_id,
        delivery_building_name=building_names.get(building_id),
        delivery_floor=floor,
        delivery_description=description,
        expires_at=deadline,
        historical_base_credit=historical_base,
        credit_value=credits,
        credit_reason=reason,
        completed_history_count=history_count,
    )


def rate_limited_user(
    user: Annotated[AuthenticatedUser, Depends(authenticated_user)],
) -> AuthenticatedUser:
    # Runs after authentication, so the limit is per verified user ID, and
    # before any downstream or LLM call is made.
    draft_rate_limiter.check(user.user_id)
    return user


@router.post("/errands/draft", response_model=DraftResponse)
async def create_errand_draft(
    request: DraftRequest,
    user: Annotated[AuthenticatedUser, Depends(rate_limited_user)],
) -> DraftResponse:
    (suppliers, buildings), (history_count, history_items) = await asyncio.gather(
        fetch_supplier_catalog(user.access_token),
        fetch_completed_history(user.access_token, user.user_id),
    )
    now = datetime.now(tz=BUSINESS_TIMEZONE)
    history_context = _history_context(history_items, suppliers)
    extraction = await generate_extraction(
        request.message,
        now,
        suppliers,
        buildings,
        history_context,
    )
    return _response(
        extraction,
        request.message,
        suppliers,
        buildings,
        history_context,
        history_count,
        now,
    )

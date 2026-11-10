# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-11-02
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""N3F2.1.1-2.1.6 and N3F2.2.2-2.2.3: draft fields never contain values that were not said."""

from datetime import UTC, datetime

import pytest

from app.voice_assist.matching import MatchResult
from app.voice_assist.postprocess import build_fields, supplier_field
from app.voice_assist.schemas import (
    ExtractedDraft,
    FieldConflict,
    RewardPhrase,
    SupplierDetail,
    TimePhrase,
)
from tests.seed import named

NOW = datetime(2026, 10, 30, 5, 20, tzinfo=UTC)  # 13:20 SGT
TRANSCRIPT = (
    "Can someone get me a vegetarian sandwich and an iced latte from Tomoro Coffee, "
    "deliver to COM3 level 1, accept by 2pm today and deliver by 3pm today, 5 credits"
)


def extracted(**overrides) -> ExtractedDraft:
    values = {
        "errand_count": 1,
        "item_description": "a vegetarian sandwich and an iced latte",
        "delivery_location": "COM3 level 1",
        "pickup_supplier_name": "Tomoro Coffee",
        "pickup_area": None,
        "reward": RewardPhrase(raw="5 credits", amount=5, unit="CREDITS"),
        "acceptance_time": TimePhrase(
            raw="accept by 2pm today",
            day="TODAY",
            clock="14:00",
            next_week=False,
            date=None,
            meridiem=None,
            relative_minutes=None,
        ),
        "delivery_time": TimePhrase(
            raw="deliver by 3pm today",
            day="TODAY",
            clock="15:00",
            next_week=False,
            date=None,
            meridiem=None,
            relative_minutes=None,
        ),
        "conflicts": [],
    }
    return ExtractedDraft(**(values | overrides))


def test_complete_recording_fills_every_field():
    fields = build_fields(extracted(), TRANSCRIPT, NOW)
    assert {name: f.status for name, f in fields.items()} == dict.fromkeys(fields, "FILLED")
    assert fields["reward"].value == 5
    assert fields["acceptanceDeadline"].value == "2026-10-30T06:00:00Z"
    assert fields["deliveryDeadline"].value == "2026-10-30T07:00:00Z"


def test_partial_recording_fills_what_was_said_and_flags_the_rest():
    transcript = "Get me a latte from Tomoro, deliver to COM3 level 1, 5 credits"
    fields = build_fields(
        extracted(
            item_description="a latte",
            acceptance_time=None,
            delivery_time=None,
        ),
        transcript,
        NOW,
    )
    assert fields["itemDescription"].status == "FILLED"
    assert fields["deliveryLocation"].status == "FILLED"
    assert fields["reward"].status == "FILLED"
    assert fields["acceptanceDeadline"].status == "MISSING"
    assert "delivery time is not used" in fields["acceptanceDeadline"].note
    assert fields["deliveryDeadline"].status == "MISSING"


def test_values_absent_from_the_transcript_are_dropped():
    fields = build_fields(
        extracted(
            delivery_location="UTown Residence Block A",
            reward=RewardPhrase(raw="10 credits", amount=10, unit="CREDITS"),
            delivery_time=TimePhrase(
                raw="by 6pm",
                day=None,
                clock="18:00",
                next_week=False,
                date=None,
                meridiem=None,
                relative_minutes=None,
            ),
        ),
        TRANSCRIPT,
        NOW,
    )
    for name in ("deliveryLocation", "reward", "deliveryDeadline"):
        assert fields[name].status == "MISSING"
        assert fields[name].value is None


def test_spoken_formatting_differences_still_count_as_stated():
    transcript = TRANSCRIPT.replace("3pm", "3 p.m.").replace("COM3", "COM 3")
    fields = build_fields(extracted(), transcript, NOW)
    assert fields["deliveryDeadline"].status == "FILLED"
    assert fields["deliveryLocation"].status == "FILLED"


def test_a_different_number_is_not_a_near_miss():
    fields = build_fields(
        extracted(reward=RewardPhrase(raw="6 credits", amount=6, unit="CREDITS")), TRANSCRIPT, NOW
    )
    assert fields["reward"].status == "MISSING"


def test_delivery_time_is_never_used_as_the_acceptance_time():
    transcript = "Latte from Tomoro to COM3 level 1, deliver by 3pm today, 5 credits"
    fields = build_fields(
        extracted(
            item_description="Latte",
            acceptance_time=None,
            delivery_time=TimePhrase(
                raw="deliver by 3pm today",
                day="TODAY",
                clock="15:00",
                next_week=False,
                date=None,
                meridiem=None,
                relative_minutes=None,
            ),
        ),
        transcript,
        NOW,
    )
    assert fields["deliveryDeadline"].status == "FILLED"
    assert fields["acceptanceDeadline"].status == "MISSING"


@pytest.mark.parametrize(
    ("raw", "amount", "unit", "note"),
    [
        ("5 credits", 5, "CREDITS", None),
        ("$5", 5, "CURRENCY", "Taken as 5 credits."),
        ("5 dollars", 5, "CURRENCY", "Taken as 5 credits."),
        ("reward 5", 5, "UNSPECIFIED", "Taken as 5 credits."),
    ],
)
def test_reward_takes_the_number_whatever_the_unit(raw, amount, unit, note):
    fields = build_fields(
        extracted(reward=RewardPhrase(raw=raw, amount=amount, unit=unit)),
        f"{TRANSCRIPT} {raw}",
        NOW,
    )
    assert (fields["reward"].status, fields["reward"].value, fields["reward"].note) == (
        "FILLED",
        5,
        note,
    )


@pytest.mark.parametrize(
    ("raw", "amount", "status"),
    [
        ("$4.50", 4.5, "AMBIGUOUS"),
        ("0 credits", 0, "CONFLICT"),
        ("some credits", None, "AMBIGUOUS"),
    ],
)
def test_unusable_rewards_are_not_filled(raw, amount, status):
    fields = build_fields(
        extracted(reward=RewardPhrase(raw=raw, amount=amount, unit="CREDITS")),
        f"{TRANSCRIPT} {raw}",
        NOW,
    )
    assert (fields["reward"].status, fields["reward"].value) == (status, None)


def test_delivery_before_acceptance_flags_both():
    fields = build_fields(
        extracted(
            acceptance_time=TimePhrase(
                raw="deliver by 3pm today",
                day="TODAY",
                clock="15:00",
                next_week=False,
                date=None,
                meridiem=None,
                relative_minutes=None,
            ),
            delivery_time=TimePhrase(
                raw="accept by 2pm today",
                day="TODAY",
                clock="14:00",
                next_week=False,
                date=None,
                meridiem=None,
                relative_minutes=None,
            ),
        ),
        TRANSCRIPT,
        NOW,
    )
    assert fields["acceptanceDeadline"].status == fields["deliveryDeadline"].status == "CONFLICT"


def test_overlong_text_is_flagged_not_truncated():
    long_text = "sandwich " * 130
    fields = build_fields(extracted(item_description=long_text), long_text, NOW)
    assert fields["itemDescription"].status == "CONFLICT"
    assert len(fields["itemDescription"].value) > 1000


def test_provider_reported_conflicts_are_highlighted():
    fields = build_fields(
        extracted(conflicts=[FieldConflict(field="reward", reason="Said both 5 and 8 credits.")]),
        TRANSCRIPT,
        NOW,
    )
    assert fields["reward"].status == "CONFLICT"
    assert fields["reward"].note == "Said both 5 and 8 credits."


def detail(candidate, status="ACTIVE"):
    return SupplierDetail(
        **candidate.model_dump(),
        pickup_location_description="Counter by the entrance",
        status=status,
    )


def test_confirmed_supplier_is_suggested_with_pickup_details():
    tomoro = named("TOMORO COFFEE")
    field = supplier_field(MatchResult("FILLED", supplier=tomoro), detail(tomoro))
    assert field.status == "FILLED"
    assert field.value == tomoro.id
    assert field.suggestion.pickup_location_description == "Counter by the entrance"


def test_supplier_no_longer_active_is_not_suggested():
    tomoro = named("TOMORO COFFEE")
    field = supplier_field(MatchResult("FILLED", supplier=tomoro), None)
    assert (field.status, field.value) == ("MISSING", None)


def test_ambiguous_match_lists_candidates_without_a_value():
    smooy = named("Smooy")
    field = supplier_field(MatchResult("AMBIGUOUS", candidates=[smooy], note="Check it."), None)
    assert field.value is None
    assert [c.id for c in field.candidates] == [smooy.id]

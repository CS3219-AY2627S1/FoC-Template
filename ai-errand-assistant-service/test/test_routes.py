from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from main import routes
from main.app import app
from main.auth import verified_claims
from main.ratelimit import RateLimiter
from main.schemas import BuildingCandidate, LLMExtraction, SupplierCandidate


SGT = ZoneInfo("Asia/Singapore")
UTC = ZoneInfo("UTC")
SUPPLIER_ID = UUID("11111111-1111-4111-8111-111111111111")
BUILDING_ID = UUID("22222222-2222-4222-8222-222222222222")
USER_ID = UUID(int=1)
SUPPLIERS = [SupplierCandidate(id=SUPPLIER_ID, name="The Deck", building="UTown")]
BUILDINGS = [BuildingCandidate(id=BUILDING_ID, name="COM3")]


def history(credit_value, lead_minutes=240):
    return {"credit_value": credit_value, "deadline_lead_minutes": lead_minutes}


def extraction(**overrides):
    values = {
        "supplier_id": SUPPLIER_ID,
        "required_item": "iced milo",
        "delivery_building_id": BUILDING_ID,
        "delivery_floor": "L2",
        "delivery_description": "Meet at the lift",
        "expires_at": None,
        "similar_history_indices": [],
    }
    values.update(overrides)
    return LLMExtraction(**values)


def local(hour, minute=0, day=9):
    return datetime(2026, 11, day, hour, minute, tzinfo=SGT)


# --- credits -----------------------------------------------------------------


def test_similar_history_median_is_adjusted_for_urgency_and_maximum():
    now = local(10)
    message = "Pick up iced milo at The Deck and deliver it to COM3 by today 10:20"
    urgent = extraction(
        expires_at=(now + timedelta(minutes=20)).isoformat(),
        similar_history_indices=[0, 1],
    )
    context = [history(5), history(8), history(20)]

    result = routes._response(urgent, message, SUPPLIERS, BUILDINGS, context, 4, now)
    assert result.historical_base_credit == 7
    assert result.credit_value == 14
    assert "median of 2 similar completed errands" in result.credit_reason
    assert "Applied 2x for the deadline" in result.credit_reason
    assert result.supplier_name == "The Deck"
    assert result.delivery_building_name == "COM3"

    capped = urgent.model_copy(update={"similar_history_indices": [2]})
    result = routes._response(capped, message, SUPPLIERS, BUILDINGS, context, 4, now)
    assert result.credit_value == 25
    assert "Capped at 25 credits" in result.credit_reason


def test_uses_all_history_median_when_llm_finds_no_similar_errands():
    now = local(10)
    result = routes._response(
        extraction(expires_at=(now + timedelta(hours=4)).isoformat()),
        "Pick up iced milo at The Deck and deliver it to COM3 by 2pm",
        SUPPLIERS, BUILDINGS, [history(4), history(8)], 2, now,
    )
    assert result.historical_base_credit == 6
    assert result.credit_value == 6
    assert "median of 2 completed errands" in result.credit_reason


def test_no_history_uses_default_credit():
    result = routes._response(
        extraction(), "Pick up iced milo and deliver it", SUPPLIERS, BUILDINGS, [], 0, local(10)
    )
    assert result.historical_base_credit == 5
    assert result.credit_value == 5
    assert "5-credit default" in result.credit_reason


def test_credits_offered_by_user_take_priority_over_history():
    now = local(10)
    result = routes._response(
        extraction(
            requested_credits=10,
            deadline_in_minutes=20,
            similar_history_indices=[0, 1],
        ),
        "get iced milo to com2 level 2 within 20 minutes for 10 credits",
        SUPPLIERS, BUILDINGS, [history(4), history(4)], 2, now,
    )
    # Not the history median (4) and not raised for the 20-minute deadline.
    assert result.credit_value == 10
    assert result.credit_reason == "You offered 10 credits."


def test_offered_credits_above_maximum_are_capped():
    result = routes._response(
        extraction(requested_credits=40),
        "milo to COM3 for 40 credits", SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    assert result.credit_value == 25
    assert "You offered 40 credits. Capped at 25 credits." == result.credit_reason


@pytest.mark.parametrize("offered", [None, 0, -3])
def test_no_valid_offer_falls_back_to_estimate(offered):
    result = routes._response(
        extraction(requested_credits=offered),
        "milo to COM3", SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    assert result.credit_value == 5
    assert "5-credit default" in result.credit_reason


def test_past_urgency_premium_is_removed_before_applying_current_urgency():
    now = local(10)
    # Both past errands were posted urgently and paid a 2x premium on a base of 6.
    context = [history(12, lead_minutes=20), history(12, lead_minutes=25)]
    relaxed = routes._response(
        extraction(similar_history_indices=[0, 1]),
        "iced milo from the Deck to COM3", SUPPLIERS, BUILDINGS, context, 2, now,
    )
    assert relaxed.historical_base_credit == 6
    assert relaxed.credit_value == 6

    urgent = routes._response(
        extraction(deadline_in_minutes=30, similar_history_indices=[0, 1]),
        "iced milo from the Deck to COM3 within 30 minutes",
        SUPPLIERS, BUILDINGS, context, 2, now,
    )
    # 6 x 2 once, not 12 x 2.
    assert urgent.credit_value == 12


def test_invalid_similar_history_indices_are_ignored_not_fatal():
    parsed = LLMExtraction.model_validate_json(
        '{"supplier_id": null, "required_item": "milo", "delivery_building_id": null,'
        ' "delivery_floor": null, "delivery_description": null, "expires_at": null,'
        ' "similar_history_indices": [0, 0, 1, 100, 250, -1]}'
    )
    result = routes._response(
        parsed, "milo please", SUPPLIERS, BUILDINGS, [history(4), history(10)], 2, local(10)
    )
    # Only indices 0 and 1 exist: median of 4 and 10.
    assert result.historical_base_credit == 7
    assert "median of 2 similar completed errands" in result.credit_reason


# --- catalog matching and empty fields ----------------------------------------


def test_unmentioned_locations_and_deadline_remain_empty_without_questions():
    now = local(10)
    result = routes._response(
        extraction(
            supplier_id=None,
            delivery_building_id=None,
            expires_at=(now + timedelta(minutes=20)).isoformat(),
        ),
        "Pick up an iced milo and deliver it",
        SUPPLIERS, BUILDINGS, [], 0, now,
    )
    assert result.supplier_id is None
    assert result.supplier_name is None
    assert result.delivery_building_id is None
    assert result.delivery_building_name is None
    assert result.expires_at is None
    assert not hasattr(result, "clarification_questions")


def test_llm_can_select_best_catalog_match_without_exact_name():
    deck_cafe = UUID("33333333-3333-4333-8333-333333333333")
    suppliers = SUPPLIERS + [SupplierCandidate(id=deck_cafe, name="Deck Cafe", building="UTown")]
    result = routes._response(
        extraction(supplier_id=deck_cafe),
        "Pick up iced milo at The Deck Cafe and deliver to COM3",
        suppliers, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id == deck_cafe
    assert result.delivery_building_id == BUILDING_ID
    assert result.expires_at is None


def test_ids_outside_the_catalog_are_dropped():
    result = routes._response(
        extraction(supplier_id=UUID(int=99), delivery_building_id=UUID(int=98)),
        "milo from somewhere to somewhere", SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id is None
    assert result.delivery_building_id is None


CHONG_PANG = UUID("44444444-4444-4444-8444-444444444444")
FONG_SENG = UUID("55555555-5555-4555-8555-555555555555")
COOL_SPOT = UUID("66666666-6666-4666-8666-666666666666")
DECK_FOOD_COURT = [
    SupplierCandidate(id=CHONG_PANG, name="Chong Pang Tai Zhi Wei", building="The Deck"),
    SupplierCandidate(id=FONG_SENG, name="Fong Seng Nasi Lemak", building="The Deck"),
    SupplierCandidate(id=COOL_SPOT, name="Cool Spot", building="Com2"),
]


def test_building_with_several_suppliers_leaves_supplier_empty():
    # "deck" is a food court with several stalls; the LLM guessing one is not accepted.
    result = routes._response(
        extraction(supplier_id=CHONG_PANG),
        "get iced milo from deck to com2 by 5pm tmr",
        DECK_FOOD_COURT, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id is None
    assert result.supplier_name is None


def test_supplier_named_in_message_is_kept_even_in_shared_building():
    result = routes._response(
        extraction(supplier_id=CHONG_PANG),
        "get chong pang fried rice from the deck to com2",
        DECK_FOOD_COURT, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id == CHONG_PANG
    assert result.supplier_name == "Chong Pang Tai Zhi Wei"


def test_only_supplier_in_named_building_is_kept():
    # "com 2" names the building; Cool Spot is the only supplier there.
    result = routes._response(
        extraction(supplier_id=COOL_SPOT),
        "grab a drink from com 2 to COM3",
        DECK_FOOD_COURT, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id == COOL_SPOT


def test_supplier_not_mentioned_in_message_is_dropped():
    result = routes._response(
        extraction(supplier_id=COOL_SPOT),
        "get me an iced milo to COM3",
        DECK_FOOD_COURT, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id is None


def test_generic_words_do_not_identify_a_supplier():
    cafe = UUID("77777777-7777-4777-8777-777777777777")
    suppliers = DECK_FOOD_COURT + [
        SupplierCandidate(id=cafe, name="Good Day Cafe", building="Medicine+Science Library"),
    ]
    result = routes._response(
        extraction(supplier_id=cafe),
        "coffee from any cafe to COM3",
        suppliers, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id is None


def test_missing_fields_return_as_null_without_clarification():
    result = routes._response(
        LLMExtraction(
            supplier_id=None,
            required_item=None,
            delivery_building_id=None,
            delivery_floor=None,
            delivery_description=None,
            expires_at=None,
        ),
        "Pick up an item and deliver it", [], [], [], 0, local(10),
    )
    assert result.supplier_id is None
    assert result.delivery_building_id is None
    assert result.expires_at is None
    assert result.required_item is None
    assert result.delivery_floor is None
    assert result.delivery_description == routes.ARRIVAL_NOTE
    assert not hasattr(result, "clarification_questions")


# --- delivery instructions --------------------------------------------------


def test_arrival_note_is_added_when_llm_omits_it():
    result = routes._response(
        extraction(delivery_description="Meet at the lift"),
        "milo to COM3", SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    assert result.delivery_description == "Meet at the lift Please message me when you arrive."


def test_existing_contact_request_is_not_duplicated():
    description = "Meet at the lift. Text me when you're downstairs."
    assert routes._with_arrival_note(description) == description


def test_arrival_note_fits_order_service_limit():
    result = routes._with_arrival_note("x" * 500)
    assert len(result) <= routes.DESCRIPTION_MAX_LENGTH
    assert result.endswith(routes.ARRIVAL_NOTE)


# --- deadlines ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("deliver it by today 5pm", {(17, 0)}),
        ("deliver it tomorrow by 5pm", {(17, 0)}),
        ("deliver it due on 12 Nov 2026 at 17:00", {(17, 0)}),
        ("pick up an item at 5pm", {(17, 0)}),
        ("deliver it at 17:30", {(17, 30)}),
        ("deliver it at noon", {(12, 0)}),
        ("deliver it by 5", {(5, 0), (17, 0)}),
        ("deliver it by 5:30", {(5, 30), (17, 30)}),
        ("deliver it by 12:00", {(0, 0), (12, 0)}),
        # 24-hour forms have a single reading
        ("deliver it by 17:00", {(17, 0)}),
        ("deliver it by 00:30", {(0, 30)}),
        ("deliver it by 08:00", {(8, 0)}),
        ("deliver it by 1700", {(17, 0)}),
        ("deliver it by 1700hrs", {(17, 0)}),
        ("deliver it by 1700 hrs", {(17, 0)}),
        ("deliver it by 0930h", {(9, 30)}),
        ("deliver it by 17:30hrs", {(17, 30)}),
        ("deliver it at 2030", {(20, 30)}),
        # "." as the separator
        ("deliver it by 17.30", {(17, 30)}),
        ("deliver it by 5.30pm", {(17, 30)}),
        ("deliver it by 5.30 p.m.", {(17, 30)}),
        ("deliver it by 9.15am", {(9, 15)}),
        # not times
        ("deliver it by 2460", set()),
        ("deliver it by 2.5km walk", {(2, 0), (14, 0)}),
        ("deliver it today", set()),
        ("pick up an item at The Deck", set()),
        ("deliver it at level 3", set()),
    ],
)
def test_clock_candidates(message, expected):
    assert routes._clock_candidates(message) == expected


def test_every_marker_is_considered_not_just_the_first():
    assert (10, 20) in routes._clock_candidates(
        "Pick up iced milo at The Deck and deliver it to COM3 L2 by today 10:20"
    )
    assert (16, 30) in routes._clock_candidates("drop it at COM3 level 2 at 4:30pm")


def test_year_in_a_date_is_not_read_as_a_time():
    assert routes._clock_candidates("deliver it due 12 Nov 2026 at 1700hrs") == {(17, 0)}
    assert routes._clock_candidates("deliver it by 12 Nov 2026") == set()


@pytest.mark.parametrize(
    ("message", "llm_value", "expected_local"),
    [
        ("deliver it by 1700hrs", "2026-11-09T17:00:00+08:00", (17, 0)),
        ("deliver it by 17.30", "2026-11-09T17:30:00+08:00", (17, 30)),
        ("deliver it by 5.30pm", "2026-11-09T17:30:00+08:00", (17, 30)),
        ("deliver it by 0830 tomorrow", "2026-11-10T08:30:00+08:00", (8, 30)),
    ],
)
def test_24_hour_and_dotted_deadlines_are_accepted(message, llm_value, expected_local):
    deadline = routes._parse_explicit_deadline(llm_value, message, local(8))
    assert deadline is not None
    local_deadline = deadline.astimezone(SGT)
    assert (local_deadline.hour, local_deadline.minute) == expected_local


@pytest.mark.parametrize(
    "message",
    [
        "get iced milo from deck to com2 by 5pm tmr",
        "get iced milo from deck to com2 by 5pm tmrw",
        "get iced milo from deck to com2 by 5pm the day after today",
        "get iced milo from deck to com2 by 5pm on the 11th",
    ],
)
def test_llm_decides_the_deadline_date(message):
    # At 9pm the LLM reads each of these as tomorrow 17:00; the backend keeps its date.
    now = local(21, day=10)
    deadline = routes._parse_explicit_deadline("2026-11-11T17:00:00+08:00", message, now)
    assert deadline == local(17, day=11).astimezone(UTC)


def test_llm_date_in_the_past_is_dropped():
    # If the LLM puts the deadline on today and that time has passed, it is not used.
    now = local(21, day=10)
    assert routes._parse_explicit_deadline(
        "2026-11-10T17:00:00+08:00", "milo to com2 by 5pm", now
    ) is None


def test_llm_date_more_than_seven_days_away_is_dropped():
    now = local(10, day=10)
    assert routes._parse_explicit_deadline(
        "2026-11-20T17:00:00+08:00", "milo to com2 by 5pm", now
    ) is None


def test_leading_zero_time_is_not_moved_to_pm():
    # "08:00" is 24-hour, so an LLM answer of 20:00 does not match it.
    assert routes._parse_explicit_deadline(
        "2026-11-09T20:00:00+08:00", "deliver it by 08:00 tomorrow", local(7)
    ) is None


def test_floor_number_does_not_hide_the_real_deadline():
    # "level 2" is also a candidate, but the LLM picks 17:00 and that is accepted.
    now = local(10)
    deadline = routes._parse_explicit_deadline(
        "2026-11-09T17:00:00+08:00", "deliver by COM3 level 2 by 5pm", now
    )
    assert deadline == local(17).astimezone(UTC)


def test_bare_hour_accepts_the_llm_pm_reading():
    now = local(10)
    assert routes._parse_explicit_deadline(
        "2026-11-09T17:00:00+08:00", "deliver by 5", now
    ) == local(17).astimezone(UTC)


def test_backend_keeps_the_llm_date_and_drops_passed_times():
    now = local(16)
    # The date is the LLM's call; the backend no longer forces it to today.
    today = routes._parse_explicit_deadline("2026-11-09T17:00:00+08:00", "deliver it by 5pm", now)
    assert today == local(17).astimezone(UTC)
    later = routes._parse_explicit_deadline("2026-11-10T17:00:00+08:00", "deliver it by 5pm", now)
    assert later == local(17, day=10).astimezone(UTC)

    passed = routes._parse_explicit_deadline("2026-11-09T15:00:00+08:00", "deliver it by 3pm", now)
    assert passed is None


def test_explicit_clock_must_match_llm_deadline():
    now = local(10)
    assert routes._parse_explicit_deadline(
        "2026-11-09T17:00:00+08:00", "deliver it by 5pm", now
    ) is not None
    assert routes._parse_explicit_deadline(
        "2026-11-09T18:00:00+08:00", "deliver it by 5pm", now
    ) is None


def test_deadline_without_clock_or_duration_is_unset():
    now = local(10)
    assert routes._parse_explicit_deadline(
        "2026-11-09T17:00:00+08:00", "deliver it today", now
    ) is None
    assert routes._parse_explicit_deadline("not a date", "deliver it by 5pm", now) is None
    assert routes._parse_explicit_deadline(None, "deliver it by 5pm", now) is None


def test_relative_deadline_is_computed_by_backend_from_llm_minutes():
    now = local(10)
    assert routes._relative_deadline(60, now) == (now + timedelta(hours=1)).astimezone(UTC)
    assert routes._relative_deadline(30, now) == (now + timedelta(minutes=30)).astimezone(UTC)


@pytest.mark.parametrize("minutes", [None, 0, -5, 7 * 24 * 60 + 1, 99999999999999])
def test_invalid_or_too_distant_relative_deadline_is_ignored(minutes):
    assert routes._relative_deadline(minutes, local(10)) is None


def test_relative_deadline_without_clock_time_is_not_taken_from_expires_at():
    # A relative phrase has no clock time to verify, so a computed expires_at is rejected.
    now = local(10)
    assert routes._parse_explicit_deadline(
        "2026-11-09T11:00:00+08:00", "get iced milo in 1h", now
    ) is None


def test_in_1h_sets_deadline_and_urgency():
    # "get iced milo in 1h": the LLM returns 60 minutes; the deadline is now + 1h,
    # and the 5-credit default gets the 1.5x two-hour urgency multiplier.
    now = local(10)
    result = routes._response(
        extraction(
            supplier_id=None, delivery_building_id=None, delivery_floor=None,
            deadline_in_minutes=60,
        ),
        "get iced milo in 1h", SUPPLIERS, BUILDINGS, [], 0, now,
    )
    assert result.expires_at == (now + timedelta(hours=1)).astimezone(UTC)
    assert result.credit_value == 8
    assert "Applied 1.5x for the deadline." in result.credit_reason


def test_clock_deadline_takes_priority_over_relative_minutes():
    now = local(10)
    result = routes._response(
        extraction(expires_at="2026-11-09T17:00:00+08:00", deadline_in_minutes=30),
        "milo to COM3 by 5pm", SUPPLIERS, BUILDINGS, [], 0, now,
    )
    assert result.expires_at == local(17).astimezone(UTC)


# --- endpoint ----------------------------------------------------------------


@pytest.fixture
def fresh_rate_limiter(monkeypatch):
    limiter = RateLimiter(max_requests=100, window_seconds=60)
    monkeypatch.setattr(routes, "draft_rate_limiter", limiter)
    return limiter


@pytest.fixture
def authenticated(fresh_rate_limiter):
    app.dependency_overrides[verified_claims] = lambda: {"sub": str(USER_ID)}
    yield
    app.dependency_overrides.clear()


def post_draft(client, message="iced milo from the Deck to COM3 level 2", token="test-token"):
    return client.post(
        "/errands/draft",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message},
    )


def test_draft_endpoint_uses_auth_and_returns_resolved_catalog_values(monkeypatch, authenticated):
    async def fake_catalog(access_token):
        assert access_token == "test-token"
        return SUPPLIERS, BUILDINGS

    async def fake_history(access_token, requester_id):
        assert access_token == "test-token"
        assert requester_id == USER_ID
        created_at = "2026-11-08T10:00:00+08:00"
        return 2, [
            {
                "supplier_id": str(SUPPLIER_ID),
                "required_item": "iced milo",
                "credit_value": 7,
                "created_at": created_at,
                "expires_at": "2026-11-08T12:00:00+08:00",
            },
            {
                "supplier_id": str(SUPPLIER_ID),
                "required_item": "coffee",
                "credit_value": 5,
                "created_at": created_at,
                "expires_at": "2026-11-08T14:00:00+08:00",
            },
        ]

    async def fake_extraction(message, now, suppliers, buildings, history_context):
        assert message == "iced milo from the Deck to COM3 level 2"
        assert len(suppliers) == 1
        assert len(buildings) == 1
        assert history_context[0]["credit_value"] == 7
        assert history_context[0]["supplier_name"] == "The Deck"
        assert history_context[0]["history_index"] == 0
        assert history_context[0]["deadline_lead_minutes"] == 120
        return extraction(
            delivery_description="Deliver to COM3",
            expires_at=(now + timedelta(hours=4)).isoformat(),
            similar_history_indices=[1],
        )

    monkeypatch.setattr(routes, "fetch_supplier_catalog", fake_catalog)
    monkeypatch.setattr(routes, "fetch_completed_history", fake_history)
    monkeypatch.setattr(routes, "generate_extraction", fake_extraction)
    with TestClient(app) as client:
        response = post_draft(client)

    assert response.status_code == 200
    body = response.json()
    assert body["supplier_id"] == str(SUPPLIER_ID)
    assert body["supplier_name"] == "The Deck"
    assert body["delivery_building_id"] == str(BUILDING_ID)
    assert body["historical_base_credit"] == 5
    assert body["credit_value"] == 5
    assert body["completed_history_count"] == 2
    assert body["delivery_description"].endswith("Please message me when you arrive.")
    # "level 2" in the message must not become a 02:00 deadline; the LLM's +4h
    # value has no matching clock or duration, so the deadline stays unset.
    assert body["expires_at"] is None


def test_draft_endpoint_requires_bearer_token():
    with TestClient(app) as client:
        response = client.post(
            "/errands/draft",
            json={"message": "iced milo from the Deck to COM3 level 2"},
        )
    assert response.status_code == 401


def test_draft_endpoint_rejects_malformed_token_before_any_downstream_call(monkeypatch, fresh_rate_limiter):
    async def must_not_be_called(*args, **kwargs):
        raise AssertionError("downstream service called without a valid token")

    monkeypatch.setattr(routes, "fetch_supplier_catalog", must_not_be_called)
    monkeypatch.setattr(routes, "fetch_completed_history", must_not_be_called)
    monkeypatch.setattr(routes, "generate_extraction", must_not_be_called)
    with TestClient(app) as client:
        response = post_draft(client, token="not-a-jwt")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_draft_endpoint_rejects_token_with_invalid_subject(monkeypatch, fresh_rate_limiter):
    app.dependency_overrides[verified_claims] = lambda: {"sub": "not-a-uuid"}
    try:
        with TestClient(app) as client:
            response = post_draft(client)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 401


def test_draft_endpoint_is_rate_limited_per_user(monkeypatch, authenticated):
    monkeypatch.setattr(routes, "draft_rate_limiter", RateLimiter(max_requests=2, window_seconds=60))
    calls = []

    async def fake_catalog(access_token):
        calls.append("catalog")
        return SUPPLIERS, BUILDINGS

    async def fake_history(access_token, requester_id):
        return 0, []

    async def fake_extraction(*args):
        return extraction()

    monkeypatch.setattr(routes, "fetch_supplier_catalog", fake_catalog)
    monkeypatch.setattr(routes, "fetch_completed_history", fake_history)
    monkeypatch.setattr(routes, "generate_extraction", fake_extraction)
    with TestClient(app) as client:
        statuses = [post_draft(client).status_code for _ in range(3)]
        limited = post_draft(client)

    assert statuses == [200, 200, 429]
    assert int(limited.headers["Retry-After"]) >= 1
    # Rejected requests never reach downstream services or the LLM.
    assert len(calls) == 2


def test_health_needs_no_auth():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# --- unstated locations --------------------------------------------------------

ARISE = UUID("88888888-8888-4888-8888-888888888888")
ARISE_AND_SHINE = [SupplierCandidate(id=ARISE, name="Arise and Shine", building="Frontier")]


def test_floor_not_stated_in_message_is_dropped():
    # "1" from "in 1h" is a duration, not a floor.
    result = routes._response(
        extraction(supplier_id=None, delivery_building_id=None, delivery_floor="1"),
        "get iced milo in 1h", SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    assert result.delivery_floor is None


@pytest.mark.parametrize("message,floor", [
    ("milo to COM3 level 2", "2"),
    ("milo to COM3 L2", "L2"),
    ("milo to COM3 lvl 2", "Level 2"),
    ("milo to COM3 #02-10", "2"),
    ("milo to COM3 2nd floor", "2"),
    ("milo to COM3 B1", "B1"),
    ("milo to COM3 ground floor", "Ground"),
])
def test_floor_stated_in_message_is_kept(message, floor):
    result = routes._response(
        extraction(delivery_floor=floor), message, SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    assert result.delivery_floor == floor


@pytest.mark.parametrize("message", ["milo to COM3 by 5pm", "2 milos to COM3", "milo to COM3 for 2cr"])
def test_times_quantities_and_credits_are_not_floors(message):
    result = routes._response(
        extraction(delivery_floor="5" if "5pm" in message else "2"),
        message, SUPPLIERS, BUILDINGS, [], 0, local(10),
    )
    # A bare "2" in "2 milos" is a word of its own, so only fused numbers are rejected.
    expected = "2" if message.startswith("2 milos") else None
    assert result.delivery_floor == expected


def test_description_drops_supplier_the_user_never_named():
    result = routes._response(
        extraction(
            supplier_id=ARISE,
            delivery_building_id=None,
            delivery_floor=None,
            delivery_description=(
                "Hi there! Please pick up an iced milo from Arise and Shine and deliver it to me. "
                "Please message me when you arrive."
            ),
        ),
        "get iced milo in 1h", ARISE_AND_SHINE, BUILDINGS, [], 0, local(10),
    )
    assert result.supplier_id is None
    assert "Arise" not in result.delivery_description
    assert result.delivery_description == "Hi there! Please message me when you arrive."


def test_description_keeps_places_the_user_named():
    description = "Please pick up an iced milo from Arise and Shine and bring it to COM3."
    result = routes._response(
        extraction(supplier_id=ARISE, delivery_description=description),
        "iced milo from arise and shine to com3", ARISE_AND_SHINE, BUILDINGS, [], 0, local(10),
    )
    assert result.delivery_description == f"{description} {routes.ARRIVAL_NOTE}"

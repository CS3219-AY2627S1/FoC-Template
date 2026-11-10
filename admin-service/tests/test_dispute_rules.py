# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-11-10
# Scope: Added tests for dispute workflow rules and request fingerprints; covered withdrawal and
# derived dispute IDs.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F3.3.1-N2F3.3.3 workflow rules and N2NFR3.3 request fingerprints."""

from uuid import uuid4

import pytest

from app.admin.disputes import (
    InvalidTransition,
    ReasonRequired,
    check_transition,
    dispute_id_for,
    request_fingerprint,
)


@pytest.mark.parametrize(
    "current,target",
    [
        ("OPEN", "UNDER_REVIEW"),
        ("OPEN", "WITHDRAWN"),
        ("UNDER_REVIEW", "ACCEPTED"),
        ("UNDER_REVIEW", "REJECTED"),
    ],
)
def test_allowed_transitions(current, target):
    check_transition(current, target, "Checked the chat and the courier's photo.")


@pytest.mark.parametrize(
    "current,target",
    [
        ("OPEN", "ACCEPTED"),
        ("OPEN", "REJECTED"),
        ("OPEN", "OPEN"),
        ("UNDER_REVIEW", "OPEN"),
        ("UNDER_REVIEW", "UNDER_REVIEW"),
        # Once an administrator is reviewing, the reporter can no longer withdraw.
        ("UNDER_REVIEW", "WITHDRAWN"),
        ("ACCEPTED", "REJECTED"),
        ("ACCEPTED", "UNDER_REVIEW"),
        ("REJECTED", "ACCEPTED"),
        ("WITHDRAWN", "OPEN"),
        ("WITHDRAWN", "UNDER_REVIEW"),
    ],
)
def test_other_transitions_are_rejected(current, target):
    with pytest.raises(InvalidTransition):
        check_transition(current, target, "A reason")


@pytest.mark.parametrize(
    "current,target",
    [("UNDER_REVIEW", "ACCEPTED"), ("UNDER_REVIEW", "REJECTED"), ("OPEN", "WITHDRAWN")],
)
@pytest.mark.parametrize("reason", [None, ""])
def test_closing_requires_a_reason(current, target, reason):
    with pytest.raises(ReasonRequired):
        check_transition(current, target, reason)


def test_starting_a_review_needs_no_reason():
    check_transition("OPEN", "UNDER_REVIEW", None)


def test_fingerprint_changes_with_any_recorded_field():
    order_id = uuid4()
    text = "Nothing arrived."
    original = request_fingerprint(order_id, "OTHER", text, ["chat:1"])
    assert original == request_fingerprint(order_id, "OTHER", text, ["chat:1"])
    assert original != request_fingerprint(uuid4(), "OTHER", text, ["chat:1"])
    assert original != request_fingerprint(order_id, "ITEM_DAMAGED", text, ["chat:1"])
    assert original != request_fingerprint(order_id, "OTHER", text + "!", ["chat:1"])
    assert original != request_fingerprint(order_id, "OTHER", text, [])


def test_dispute_ids_are_stable_per_creator_and_key():
    creator, key = uuid4(), uuid4()
    assert dispute_id_for(creator, key) == dispute_id_for(creator, key)
    assert dispute_id_for(creator, key) != dispute_id_for(uuid4(), key)
    assert dispute_id_for(creator, key) != dispute_id_for(creator, uuid4())

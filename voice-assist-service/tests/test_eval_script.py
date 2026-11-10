# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""The N3NFR4.2 scoring is checked offline; the live evaluation itself spends credit."""

import json
from datetime import datetime

from scripts.eval_drafts import FIXTURES, draft_values, score_case, suppliers_from
from tests.test_api import extraction

DATA = json.loads(FIXTURES.read_text())


def test_fixture_set_is_large_enough_and_well_formed():
    assert len(DATA["cases"]) >= 20
    ids = [case["id"] for case in DATA["cases"]]
    assert len(ids) == len(set(ids))
    for case in DATA["cases"]:
        assert case["expected"]["outcome"] in {"DRAFT", "MULTIPLE_ERRANDS"}


def test_a_perfect_draft_scores_fully():
    transcript = DATA["cases"][0]["transcript"]
    now = datetime.fromisoformat(DATA["requestTime"].replace("Z", "+00:00"))
    values = draft_values(
        extraction(
            item_description="an iced latte",
            delivery_location="COM3 level 1",
            acceptance_time=extraction().acceptance_time.model_copy(
                update={"raw": "Accept in 20 minutes"}
            ),
            delivery_time=extraction().delivery_time.model_copy(
                update={"raw": "deliver by 3pm", "day": None}
            ),
            reward=extraction().reward.model_copy(update={"raw": "5 credits"}),
        ),
        transcript,
        now,
        suppliers_from(DATA["suppliers"]),
    )
    result = score_case(DATA["cases"][0]["expected"], "DRAFT", values)
    assert (result["correct"], result["stated"], result["invented"]) == (6, 6, [])


def test_values_for_unsaid_fields_count_as_invented():
    expected = {"outcome": "DRAFT", "reward": None, "supplier": "Smooy"}
    result = score_case(expected, "DRAFT", {"reward": 5, "supplier": "Smooy"})
    assert result["invented"] == ["reward"]
    assert (result["correct"], result["stated"]) == (1, 1)

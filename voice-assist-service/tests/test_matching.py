# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""N3F2.2.1 and N3F2.2.3: the supplier name decides; the building only breaks ties or vetoes."""

import pytest

from app.voice_assist.matching import match_supplier
from tests.seed import BRANCHES, SEED, named


@pytest.mark.parametrize(
    ("spoken", "expected"),
    [
        ("anna soup", "Anna's x Soup Union"),
        ("tomoro coffee", "TOMORO COFFEE"),
        ("tomorrow coffee", "TOMORO COFFEE"),  # transcription variation
        ("co op", "NUS Co-op"),
        ("printer at com 2", "Printer @ Com 2"),
        ("smoothy", "Smooy"),
        ("insta chef", "InstaChef"),
        ("cheers", "Cheers Unmanned Convenience Store"),
        ("the coffee roaster", "The Coffee Roaster"),
    ],
)
def test_name_variations_match_one_supplier(spoken, expected):
    result = match_supplier(spoken, None, SEED)
    assert result.status == "FILLED"
    assert result.supplier == named(expected)


@pytest.mark.parametrize("area", ["Central Library", "central lib", "Prince George's Park", "PGP"])
def test_building_alone_never_selects_a_supplier(area):
    result = match_supplier(None, area, SEED)
    assert result.status == "MISSING"
    assert result.supplier is None
    assert "building" in result.note


def test_unknown_supplier_is_missing():
    assert match_supplier("mcdonalds", None, SEED).status == "MISSING"


def test_matching_area_keeps_the_match():
    result = match_supplier("anna soup", "central library", SEED)
    assert result.supplier == named("Anna's x Soup Union")


def test_contradicting_area_vetoes_a_single_name_match():
    result = match_supplier("smooy", "central library", SEED)
    assert result.status == "AMBIGUOUS"
    assert result.supplier is None
    assert result.candidates == [named("Smooy")]
    assert "COM3" in result.note


@pytest.mark.parametrize(
    ("area", "building"), [("utown", "University Town"), ("com3", "COM3"), ("COM 3", "COM3")]
)
def test_area_chooses_between_branches(area, building):
    result = match_supplier("starbucks", area, BRANCHES)
    assert result.status == "FILLED"
    assert result.supplier.building_area == building


def test_branches_without_area_stay_ambiguous():
    result = match_supplier("starbucks", None, BRANCHES)
    assert result.status == "AMBIGUOUS"
    assert {s.building_area for s in result.candidates} == {"University Town", "COM3"}


def test_branches_with_unrelated_area_stay_ambiguous():
    result = match_supplier("starbucks", "the ridge", BRANCHES)
    assert result.status == "AMBIGUOUS"
    assert result.supplier is None


def test_supplier_service_outage_means_no_suggestion():
    assert match_supplier("tomoro", None, []).status == "MISSING"

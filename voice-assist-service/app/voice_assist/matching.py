# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Implemented deterministic Supplier matching for voice drafts.
# Author review: I validated correctness, and added boundary checks.

"""Supplier suggestion: name first, then building/campus area (N3F2.2.1, N3F2.2.3).

Only the spoken pickup supplier name and pickup area are used. A building alone never selects a
supplier, and the delivery location is never an input."""

import re
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from app.voice_assist.schemas import SupplierCandidate

NAME_THRESHOLD = 80
AREA_MATCH_THRESHOLD = 80
AREA_VETO_THRESHOLD = 60
MARGIN = 10
MAX_CANDIDATES = 3

# Common NUS abbreviations people say instead of the building names Supplier stores.
_AREA_ALIASES = {
    "pgp": "prince george s park",
    "pgpr": "prince george s park",
    "utown": "university town",
    "yih": "yusof ishak house",
    "clb": "central library",
    "central lib": "central library",
    "medsci lib": "medicine science library",
    "i4": "innovation4 0",
}


def normalize(text: str) -> str:
    words = " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())
    # "3 p.m." and "3pm" are the same time.
    words = re.sub(r"\b(\d+) ?([ap]) ?m\b", r"\1\2m", words)
    # "COM 3" and "Com3" are the same building.
    return re.sub(r"(?<=[a-z]) (?=\d)", "", words)


def _area(text: str) -> str:
    value = normalize(text)
    return _AREA_ALIASES.get(value, value)


def _supplier_area(supplier: SupplierCandidate) -> str:
    return normalize(f"{supplier.building_area} {supplier.floor or ''}")


@dataclass
class MatchResult:
    status: str
    supplier: SupplierCandidate | None = None
    candidates: list[SupplierCandidate] = field(default_factory=list)
    note: str | None = None


def match_supplier(
    name: str | None, area: str | None, suppliers: list[SupplierCandidate]
) -> MatchResult:
    spoken = normalize(name or "")
    if len(spoken) < 2:
        note = (
            "A building alone is not enough. Choose the pickup supplier."
            if area and normalize(area)
            else "No pickup supplier was mentioned. Choose one."
        )
        return MatchResult("MISSING", note=note)

    scored = sorted(
        ((fuzz.WRatio(spoken, normalize(s.name)), s) for s in suppliers),
        key=lambda pair: pair[0],
        reverse=True,
    )
    if not scored or scored[0][0] < NAME_THRESHOLD:
        return MatchResult("MISSING", note="We could not find that supplier. Choose one.")
    best = scored[0][0]
    named = [s for score, s in scored if score >= NAME_THRESHOLD and score >= best - MARGIN]
    spoken_area = _area(area or "")

    if len(named) == 1:
        supplier = named[0]
        if spoken_area and fuzz.WRatio(spoken_area, _supplier_area(supplier)) < AREA_VETO_THRESHOLD:
            return MatchResult(
                "AMBIGUOUS",
                candidates=[supplier],
                note=f"You mentioned {area}, but {supplier.name} is at "
                f"{supplier.building_area}. Check the pickup supplier.",
            )
        return MatchResult("FILLED", supplier=supplier)

    if spoken_area:
        by_area = sorted(
            ((fuzz.WRatio(spoken_area, _supplier_area(s)), s) for s in named),
            key=lambda pair: pair[0],
            reverse=True,
        )
        top, runner_up = by_area[0][0], by_area[1][0]
        if top >= AREA_MATCH_THRESHOLD and top >= runner_up + MARGIN:
            return MatchResult("FILLED", supplier=by_area[0][1])
        named = [s for _, s in by_area]
    return MatchResult(
        "AMBIGUOUS",
        candidates=named[:MAX_CANDIDATES],
        note="More than one supplier matches. Choose the pickup supplier.",
    )

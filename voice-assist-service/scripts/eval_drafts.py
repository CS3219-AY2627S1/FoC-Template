# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
# Scope: Generated and refined the voice-draft evaluation runner.
# Author review: I validated correctness, and added boundary checks.

"""N3NFR4.2 evaluation: run the real drafting model on scripted transcripts and score the result.

Spends OpenAI credit (about 21 short requests, well under US$0.10), so it never runs in the test
suite. From voice-assist-service/ with OPENAI_API_KEY set in the environment or .env:

    .venv/bin/python -m scripts.eval_drafts
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import openai

from app.core.config import Settings
from app.voice_assist.matching import match_supplier, normalize
from app.voice_assist.postprocess import PARAPHRASE_THRESHOLD, build_fields, stated
from app.voice_assist.providers import OpenAIDrafter
from app.voice_assist.schemas import ExtractedDraft, SupplierCandidate

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "eval" / "transcripts.json"
SCORED = [
    "supplier",
    "itemDescription",
    "deliveryLocation",
    "reward",
    "acceptanceDeadline",
    "deliveryDeadline",
]
ACCURACY_TARGET = 0.85


def suppliers_from(rows) -> list[SupplierCandidate]:
    return [
        SupplierCandidate(id=uuid5(NAMESPACE_URL, name), name=name, building_area=area, floor=floor)
        for name, area, floor in rows
    ]


def draft_values(
    extracted: ExtractedDraft, transcript: str, now: datetime, suppliers: list[SupplierCandidate]
) -> dict[str, object]:
    """The values a requester would see filled in, using the service's own post-processing."""
    fields = build_fields(extracted, transcript, now)
    values: dict[str, object] = {
        name: field.value if field.status == "FILLED" else None for name, field in fields.items()
    }
    spoken = [
        value if stated(value, transcript, PARAPHRASE_THRESHOLD) else None
        for value in (extracted.pickup_supplier_name, extracted.pickup_area)
    ]
    match = match_supplier(*spoken, suppliers)
    values["supplier"] = match.supplier.name if match.status == "FILLED" else None
    return values


def matches(field: str, expected, actual) -> bool:
    if expected is None or actual is None:
        return expected is None and actual is None
    if field in ("itemDescription", "deliveryLocation"):
        return normalize(str(expected)) in normalize(str(actual))
    return expected == actual


def score_case(expected: dict, outcome: str, values: dict | None) -> dict:
    """Counts for one case: stated fields correct, and values filled that were never said."""
    result = {
        "outcome_ok": outcome == expected["outcome"],
        "stated": 0,
        "correct": 0,
        "invented": [],
        "wrong": [],
    }
    if expected["outcome"] != "DRAFT" or outcome != "DRAFT" or values is None:
        return result
    for field in SCORED:
        want = expected.get(field, "*")
        if want == "*":
            continue
        got = values.get(field)
        if want is None:
            if got is not None:
                result["invented"].append(field)
            continue
        result["stated"] += 1
        if matches(field, want, got):
            result["correct"] += 1
        else:
            result["wrong"].append(field)
    return result


async def run() -> int:
    settings = Settings()
    if settings.openai_api_key is None:
        print("Set OPENAI_API_KEY to run the evaluation.", file=sys.stderr)
        return 2
    data = json.loads(FIXTURES.read_text())
    now = datetime.fromisoformat(data["requestTime"].replace("Z", "+00:00"))
    suppliers = suppliers_from(data["suppliers"])
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(), max_retries=1)
    drafter = OpenAIDrafter(client, settings.voice_assist_draft_model, 30)

    totals = {"stated": 0, "correct": 0, "invented": 0, "outcomes": 0}
    print(f"Model: {settings.voice_assist_draft_model}\n")
    for case in data["cases"]:
        extracted = await drafter.draft(case["transcript"])
        outcome = {0: "NO_ERRAND", 1: "DRAFT"}.get(extracted.errand_count, "MULTIPLE_ERRANDS")
        values = draft_values(extracted, case["transcript"], now, suppliers)
        result = score_case(case["expected"], outcome, values if outcome == "DRAFT" else None)
        totals["stated"] += result["stated"]
        totals["correct"] += result["correct"]
        totals["invented"] += len(result["invented"])
        totals["outcomes"] += result["outcome_ok"]
        issues = []
        if not result["outcome_ok"]:
            issues.append(f"outcome {outcome}")
        issues += [f"wrong {f}={values.get(f)!r}" for f in result["wrong"]]
        issues += [f"INVENTED {f}={values.get(f)!r}" for f in result["invented"]]
        print(f"{'ok  ' if not issues else 'FAIL'} {case['id']:<32} {'; '.join(issues)}")

    accuracy = totals["correct"] / totals["stated"] if totals["stated"] else 0.0
    print(
        f"\nOutcomes {totals['outcomes']}/{len(data['cases'])} · stated fields correct "
        f"{totals['correct']}/{totals['stated']} ({accuracy:.0%}) · invented values "
        f"{totals['invented']}"
    )
    passed = totals["invented"] == 0 and accuracy >= ACCURACY_TARGET
    print("N3NFR4.2", "met" if passed else "NOT met")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))

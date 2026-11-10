# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""The Milestone D2 supplier seed data, plus a two-branch chain for branch tests."""

from uuid import UUID, uuid5

from app.voice_assist.schemas import SupplierCandidate

_NAMESPACE = UUID("6f0f2b8e-6a43-4d3b-9b5e-4c1c3c8f0a11")

_ROWS = [
    ("Anna's x Soup Union", "Central Library", "1"),
    ("NUS Co-op", "Central Library", "1"),
    ("Printer @ Com 2", "Com 2", "1"),
    ("Cool Spot", "Com2", "1"),
    ("InstaChef", "Terrace", "1"),
    ("Cafe+ Robot Cafe", "Central Library", "1"),
    ("A Hot Hideout", "Prince George's Park", "2"),
    ("Arise and Shine", "Engineering Block E4", "4"),
    ("Bakehaus / Aurea", "The Ridge", "1"),
    ("Central Square @ YIH", "Yusof Ishak House", "1"),
    ("Pasta Express", "Frontier", "1"),
    ("TOMORO COFFEE", "Hon Sui Sen Memorial Library", "2"),
    ("Octobox", "Prince George's Park", "2"),
    ("Smooy", "COM3", "1"),
    ("Goh Bros E-Print Pte Ltd", "Yusof Ishak House", "5"),
    ("Cheers Unmanned Convenience Store", "Engineering Block E3", "4"),
    ("Nami", "innovation4.0", "1"),
    ("Supersnacks", "Prince George's Park", "1"),
    ("Good Day Cafe", "Medicine+Science Library", "1"),
    ("The Coffee Roaster", "Blk AS8", "1"),
    ("he by He Brews", "Engineering Block EA", "1"),
]

SEED = [
    SupplierCandidate(id=uuid5(_NAMESPACE, name), name=name, building_area=area, floor=floor)
    for name, area, floor in _ROWS
]

BRANCHES = SEED + [
    SupplierCandidate(
        id=uuid5(_NAMESPACE, "starbucks-utown"),
        name="Starbucks",
        building_area="University Town",
        floor="1",
    ),
    SupplierCandidate(
        id=uuid5(_NAMESPACE, "starbucks-com3"), name="Starbucks", building_area="COM3", floor="1"
    ),
]


def named(name: str, suppliers=SEED) -> SupplierCandidate:
    return next(s for s in suppliers if s.name == name)

# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29
# Scope: Boilerplate generation — expose the pure validation functions, approved areas, and shared error types for API and CSV callers.
# Author review: Not confirmed.
# Details: ../../ai/usage-log.md; ai-20260929-005

"""Pure domain checks shared by API adapters and CSV importers."""

from app.validation.errors import DomainValidationError, ValidationIssue
from app.validation.locations import validate_coordinates
from app.validation.opening_hours import derive_offset
from app.validation.vocabulary import APPROVED_AREAS

__all__ = [
    "APPROVED_AREAS",
    "DomainValidationError",
    "ValidationIssue",
    "derive_offset",
    "validate_coordinates",
]

# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29
# Scope: Writing implementation code — validate finite numeric coordinates and inclusive bounds, preserve decimal precision, and collect field-specific issues without database dependencies.
# Author review: Not confirmed.
# Details: ../../ai/usage-log.md; ai-20260929-005

"""Validate coordinates without constructing a geographic point."""

from decimal import Decimal, InvalidOperation

from app.validation.errors import DomainValidationError, ValidationIssue


def validate_coordinates(latitude: object, longitude: object) -> tuple[Decimal, Decimal]:
    """Return latitude/longitude as decimals, with no rounding or quantization.

    Accept integers, floats, decimals and numeric strings. Float inputs retain
    their decimal string representation; strings and decimals retain precision.
    Validate both coordinates before raising so independent issues are reported.
    """
    errors = []
    coordinates = []
    for field, value, bound in (
        ("location.latitude", latitude, 90),
        ("location.longitude", longitude, 180),
    ):
        try:
            if isinstance(value, bool) or not isinstance(value, (int, float, Decimal, str)):
                raise ValueError
            coordinate = Decimal(str(value))
            if not coordinate.is_finite():
                raise ValueError
        except (ValueError, InvalidOperation):
            errors.append(ValidationIssue(
                (field,), "INVALID_COORDINATE", "Enter a finite numeric coordinate."
            ))
            continue

        if not -bound <= coordinate <= bound:
            errors.append(ValidationIssue(
                (field,), "COORDINATE_OUT_OF_RANGE",
                f"Coordinate must be between {-bound} and {bound}, inclusive.",
            ))
        coordinates.append(coordinate)

    if errors:
        raise DomainValidationError(errors)
    return coordinates[0], coordinates[1]

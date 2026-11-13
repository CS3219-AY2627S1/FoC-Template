# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — combine parsing and independently detectable domain issues using caller-supplied category UUIDs, derive the schedule offset, and deduplicate valid IDs in first-seen order only after successful validation.
# Scope: Writing implementation code; Refactoring and documentation improvements — add pure merge-and-validate PATCH handling, share complete-value validation with creation, preserve input mappings and category lists, and document how a future update service supplies stored editable values before saving.
# Scope: Writing implementation code; Refactoring and documentation improvements — expose pure seed scalar validation with shared error aggregation and schedule derivation while retaining API category validation.
# Author review: Keith confirmed review of the creation-validation and PATCH-validation changes (ai-20260930-001; ai-20260930-002). Keith also confirmed review of the shared seed scalar validation changes (ai-20260930-006).
# Details: ../../ai/usage-log.md; ai-20260930-001; ai-20260930-002; ai-20260930-006

"""Validate seed scalars, creation, and merged PATCH without persistence."""

from collections.abc import Iterable, Mapping
from uuid import UUID

from pydantic import TypeAdapter, ValidationError

from app.schemas import (
    DailyTime, SupplierCreateInput, SupplierCreateResult, SupplierEditableValues,
    SupplierPatch, SupplierPatchResult,
    SupplierScalarValues, SupplierSeedInput, SupplierSeedResult,
)
from app.validation.errors import DomainValidationError, parsing_issues
from app.validation.opening_hours import derive_offset

_daily_time = TypeAdapter(DailyTime)


def validate_supplier_seed_values(data: object) -> SupplierSeedResult:
    """Validate scalar seed values independently of categories and persistence.

    Input accepts the shared text fields, nested location, and daily times.
    Identity, category fields, and caller-derived offsets are forbidden. Category
    names must be checked separately by the importer. Independent scalar errors
    are collected using the same rules as complete API creation and merged PATCH.
    """
    if isinstance(data, SupplierSeedInput):
        data = data.model_dump()
    return SupplierSeedResult(**_validate_complete(data, SupplierSeedInput))


def validate_supplier_create(
    data: object, existing_category_ids: Iterable[UUID],
) -> SupplierCreateResult:
    """Validate complete creation input, collecting independent errors."""
    if isinstance(data, SupplierCreateInput):
        data = data.model_dump()
    return SupplierCreateResult(**_validate_complete(data, SupplierCreateInput, existing_category_ids))


def validate_supplier_patch(
    patch: object,
    stored_values: Mapping[str, object],
    existing_category_ids: Iterable[UUID],
) -> SupplierPatchResult:
    """Merge a PATCH with a stored editable snapshot and validate before saving.

    The update service must build a mapping containing the stored name,
    area, category UUIDs, optional text, and both daily times, then call
    validate_supplier_patch(raw_body, stored_editable_values, existing_ids).
    Save only the returned result after this call succeeds. Version increments
    and concurrency checks belong to that service, including for an empty patch.

    Do not pass an ORM object or send a stored row through the creation schema.
    Only editable keys are copied from the snapshot; stored location, offset,
    and other server fields are not input to public validation. All keys from
    the PATCH are validated, so those same fields in the body are forbidden.
    Missing patch fields retain stored values; explicit nulls replace them.
    Neither the supplied mapping nor its category list is changed or returned
    by reference. Parse a SupplierPatch with exclude_unset=True if used upstream.
    """
    if isinstance(patch, SupplierPatch):
        patch = patch.model_dump(exclude_unset=True)
    if not isinstance(patch, Mapping):
        # Obtain the same structured root error as the public Pydantic schema.
        try:
            SupplierPatch.model_validate(patch)
        except ValidationError as error:
            raise DomainValidationError(parsing_issues(error)) from error

    merged = {
        field: stored_values[field]
        for field in SupplierEditableValues.model_fields
        if field in stored_values
    }
    merged.update(patch)
    return SupplierPatchResult(**_validate_complete(
        merged, SupplierEditableValues, existing_category_ids,
    ))


def _validate_complete(
    data: object,
    schema: type[SupplierScalarValues],
    existing_category_ids: Iterable[UUID] = (),
) -> dict[str, object]:
    """Collect parsing and independent domain errors before returning any values.

    Category membership runs per entry during parsing, preserving original paths.
    A failed model cannot expose partial values, so parse the two times separately
    to check their relationship even when unrelated fields are invalid.
    """
    errors = []
    parsed = None
    try:
        context = {"category_ids": frozenset(existing_category_ids)}
        parsed = schema.model_validate(data, context=context)
    except ValidationError as error:
        errors.extend(parsing_issues(error))

    offset = None
    if parsed is not None:
        times = (parsed.opening_time, parsed.closing_time)
    elif isinstance(data, Mapping):
        try:
            times = tuple(_daily_time.validate_python(data.get(field)) for field in (
                "opening_time", "closing_time",
            ))
        except ValidationError:
            # The model already reported time errors. An unparseable time is not
            # an absent time, and cannot establish an incomplete schedule.
            times = None
    else:
        times = None

    if times is not None:
        try:
            offset = derive_offset(*times)
        except DomainValidationError as error:
            errors.extend(error.errors)
    if errors:
        raise DomainValidationError(errors)

    values = parsed.model_dump()
    if isinstance(parsed, SupplierEditableValues):
        values["category_ids"] = list(dict.fromkeys(parsed.category_ids))
    values["closing_day_offset"] = offset
    return values

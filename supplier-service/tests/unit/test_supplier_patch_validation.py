# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write tests for the specified PATCH allowlist, presence tracking, text and category rules, schedule transitions from either time, combined failures, input preservation, and the difference between complete creation input and merged PATCH schedules.
# Author review: Keith confirmed review of all affected PATCH-validation changes.
# Details: ../../ai/usage-log.md; ai-20260930-002

from copy import deepcopy
from datetime import time, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas import SupplierPatch, SupplierPatchResult
from app.validation.errors import DomainValidationError
from app.validation.suppliers import validate_supplier_create, validate_supplier_patch

A, B, C = (UUID(int=value) for value in (1, 2, 3))


@pytest.fixture
def stored():
    return {
        'name': 'Campus Café', 'area': 'Science', 'category_ids': [A, C],
        'description': 'Near entrance', 'building': 'S16', 'floor': '01',
        'image_key': 'cafe.png', 'opening_time': time(10), 'closing_time': time(19),
    }


def validate(patch, stored):
    return validate_supplier_patch(patch, stored, [A, C])


def issues(patch, stored):
    original = deepcopy(stored)
    categories = stored['category_ids']
    patch_before = deepcopy(patch)
    with pytest.raises(DomainValidationError) as caught:
        validate(patch, stored)
    assert stored == original
    assert stored['category_ids'] is categories
    assert patch == patch_before
    return [(issue.fields, issue.code) for issue in caught.value.errors]


def test_patch_presence_tracking():
    assert SupplierPatch().model_dump(exclude_unset=True) == {}
    patch = SupplierPatch(description=None)
    assert patch.model_fields_set == {'description'}
    assert patch.model_dump(exclude_unset=True) == {'description': None}
    assert SupplierPatch(description=' ').model_dump(exclude_unset=True) == {'description': None}


def test_empty_patch_keeps_stored_values(stored):
    original = deepcopy(stored)
    result = validate({}, stored)
    assert isinstance(result, SupplierPatchResult)
    assert result.model_dump() == {**original, 'closing_day_offset': 0}
    assert stored == original
    assert result.category_ids is not stored['category_ids']
    result.category_ids.append(B)
    assert stored == original


def test_preparsed_patch_preserves_omission(stored):
    result = validate(SupplierPatch(description=None), stored)
    assert result.description is None
    assert result.name == stored['name']
    assert result.opening_time == stored['opening_time']


@pytest.mark.parametrize('field', ['description', 'building', 'floor', 'image_key'])
@pytest.mark.parametrize('value', [None, '', ' \t\n'])
def test_clear_optional_text(stored, field, value):
    result = validate({field: value}, stored)
    assert result.model_dump() == {**stored, field: None, 'closing_day_offset': 0}


@pytest.mark.parametrize(('field', 'value', 'expected'), [
    ('name', ' New Café ', 'New Café'), ('area', ' SoC ', 'SoC'),
    ('description', ' Door B ', 'Door B'), ('building', ' Com 2 ', 'Com 2'),
    ('floor', ' 1 ', '1'), ('floor', ' 01 ', '01'), ('floor', ' B1 ', 'B1'),
    ('image_key', ' Picture.PNG ', 'Picture.PNG'),
])
def test_trim_without_changing_spelling(stored, field, value, expected):
    assert getattr(validate({field: value}, stored), field) == expected


@pytest.mark.parametrize('field', ['name', 'area'])
@pytest.mark.parametrize(('value', 'code'), [
    (None, 'INVALID_TEXT'), ('', 'BLANK_TEXT'), (' \t', 'BLANK_TEXT'),
])
def test_required_text_cannot_be_cleared(stored, field, value, code):
    assert issues({field: value}, stored) == [((field,), code)]
    with pytest.raises(ValidationError):
        SupplierPatch.model_validate({field: value})


@pytest.mark.parametrize('value', [1, 1.0, True])
def test_floor_must_be_string(stored, value):
    assert issues({'floor': value}, stored) == [(('floor',), 'INVALID_TEXT')]


@pytest.mark.parametrize(('value', 'code'), [(None, 'INVALID_INPUT'), ([], 'EMPTY_CATEGORIES')])
def test_categories_cannot_be_cleared(stored, value, code):
    assert issues({'category_ids': value}, stored) == [(('category_ids',), code)]
    with pytest.raises(ValidationError):
        SupplierPatch(category_ids=value)


def test_categories_replace_and_deduplicate_after_validation(stored):
    patch = {'category_ids': [str(C), C, A, str(A)]}
    original = deepcopy(stored)
    assert validate(patch, stored).category_ids == [C, A]
    assert validate({'category_ids': [C]}, stored).category_ids == [C]
    assert stored == original
    assert patch['category_ids'] == [str(C), C, A, str(A)]


def test_unknown_category_positions_before_deduplication(stored):
    assert issues({'category_ids': [A, A, B, B]}, stored) == [
        (('category_ids.2',), 'UNKNOWN_CATEGORY'), (('category_ids.3',), 'UNKNOWN_CATEGORY'),
    ]


def test_malformed_and_unknown_categories(stored):
    assert issues({'category_ids': ['bad', A, B, None, 'bad']}, stored) == [
        (('category_ids.0',), 'INVALID_UUID'), (('category_ids.2',), 'UNKNOWN_CATEGORY'),
        (('category_ids.3',), 'INVALID_UUID'), (('category_ids.4',), 'INVALID_UUID'),
    ]


@pytest.mark.parametrize('field', [
    'location', 'latitude', 'longitude', 'id', 'created_at', 'updated_at',
    'deleted_at', 'version', 'closing_day_offset', 'expected_version', 'unknown',
])
@pytest.mark.parametrize('value', [None, 'supplied'])
def test_forbidden_patch_fields_even_when_null(stored, field, value):
    assert issues({field: value}, stored) == [((field,), 'FORBIDDEN_FIELD')]
    with pytest.raises(ValidationError):
        SupplierPatch.model_validate({field: value})


def test_nested_location_is_forbidden(stored):
    assert issues({'location': {'latitude': 1, 'longitude': 103}}, stored) == [
        (('location',), 'FORBIDDEN_FIELD'),
    ]


@pytest.mark.parametrize(('opens', 'closes', 'field', 'replacement', 'offset'), [
    (10, 19, 'opening_time', 20, 1),  # same-day -> overnight
    (18, 2, 'opening_time', 1, 0),    # overnight -> same-day
    (10, 19, 'opening_time', 19, 1),  # same-day -> equal
    (10, 10, 'opening_time', 9, 0),   # equal -> same-day
    (10, 10, 'opening_time', 11, 1),  # equal -> overnight
    (18, 2, 'opening_time', 2, 1),    # overnight -> equal
    (10, 19, 'closing_time', 2, 1),
    (18, 2, 'closing_time', 19, 0),
    (10, 19, 'closing_time', 10, 1),
    (10, 10, 'closing_time', 11, 0),
    (10, 10, 'closing_time', 9, 1),
    (18, 2, 'closing_time', 18, 1),
])
def test_single_time_edits_recalculate_schedule(stored, opens, closes, field, replacement, offset):
    stored.update(opening_time=time(opens), closing_time=time(closes))
    original = deepcopy(stored)
    result = validate({field: f'{replacement:02}:00'}, stored)
    assert result.closing_day_offset == offset
    assert getattr(result, field) == time(replacement)
    other = 'closing_time' if field == 'opening_time' else 'opening_time'
    assert getattr(result, other) == stored[other]
    assert stored == original


def test_clear_both_times(stored):
    result = validate({'opening_time': None, 'closing_time': None}, stored)
    assert result.opening_time is result.closing_time is result.closing_day_offset is None
    assert stored['opening_time'] == time(10)


@pytest.mark.parametrize('field', ['opening_time', 'closing_time'])
def test_clear_only_one_time_fails(stored, field):
    assert issues({field: None}, stored) == [
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    ]


@pytest.mark.parametrize('field', ['opening_time', 'closing_time'])
def test_add_only_one_time_to_unknown_hours_fails(stored, field):
    stored.update(opening_time=None, closing_time=None)
    assert issues({field: '10:00'}, stored) == [
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    ]


def test_unrelated_edits_keep_unknown_hours(stored):
    stored.update(opening_time=None, closing_time=None)
    for patch in ({}, {'name': 'Updated'}, {'description': None}):
        result = validate(patch, stored)
        assert result.opening_time is result.closing_time is result.closing_day_offset is None


@pytest.mark.parametrize(('value', 'code'), [
    ('bad', 'INVALID_TIME'), ('25:00', 'INVALID_TIME'), (3600, 'INVALID_TIME'),
    ('10:00Z', 'TIMEZONE_NOT_ALLOWED'),
    (time(10, tzinfo=timezone.utc), 'TIMEZONE_NOT_ALLOWED'),
])
def test_invalid_time_not_reported_as_incomplete(stored, value, code):
    assert issues({'opening_time': value, 'closing_time': None, 'name': ' '}, stored) == [
        (('name',), 'BLANK_TEXT'), (('opening_time',), code),
    ]


def test_combined_errors_and_no_mutation(stored):
    patch = {
        'name': ' ', 'area': 'unknown', 'floor': 1, 'opening_time': None,
        'category_ids': [A, A, B, B, 'bad'], 'version': None, 'location': {},
    }
    assert set(issues(patch, stored)) == {
        (('name',), 'BLANK_TEXT'), (('area',), 'UNKNOWN_AREA'),
        (('floor',), 'INVALID_TEXT'), (('category_ids.2',), 'UNKNOWN_CATEGORY'),
        (('category_ids.3',), 'UNKNOWN_CATEGORY'), (('category_ids.4',), 'INVALID_UUID'),
        (('version',), 'FORBIDDEN_FIELD'), (('location',), 'FORBIDDEN_FIELD'),
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    }


def test_create_complete_input_but_patch_requires_stored_times(stored):
    creation = {**stored, 'location': {'latitude': 1, 'longitude': 103}}
    assert validate_supplier_create(creation, [A, C]).closing_day_offset == 0
    patch = {'closing_time': '02:00'}
    assert SupplierPatch(**patch).model_fields_set == {'closing_time'}
    result = validate(patch, stored)
    assert result.opening_time == time(10)
    assert result.closing_day_offset == 1
    creation.pop('opening_time')
    creation.update(patch)
    with pytest.raises(DomainValidationError) as caught:
        validate_supplier_create(creation, [A, C])
    assert caught.value.errors[0].code == 'INCOMPLETE_SCHEDULE'


def test_stored_server_fields_are_not_validated_as_client_input(stored):
    stored.update(id=A, version=7, closing_day_offset=1, location=object())
    result = validate({}, stored)
    assert result.closing_day_offset == 0
    assert not {'id', 'version', 'location'} & result.model_dump().keys()
    assert stored['version'] == 7
    assert stored['closing_day_offset'] == 1


@pytest.mark.parametrize('patch', [None, [], 'bad', 42])
def test_non_object_patch(stored, patch):
    assert issues(patch, stored) == [((), 'INVALID_INPUT')]

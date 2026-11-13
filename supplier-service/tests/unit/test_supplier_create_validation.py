# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write requirement-based tests for required and null fields, text normalization, forbidden fields, malformed and repeated categories, schedule parsing, combined errors, and cleaned results.
# Author review: Keith confirmed review of the creation-validation changes (ai-20260930-001).
# Details: ../../ai/usage-log.md; ai-20260930-001

from datetime import time, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas import SupplierCreateInput, SupplierCreateResult
from app.validation.errors import DomainValidationError
from app.validation.suppliers import validate_supplier_create

A, B, C = (UUID(int=value) for value in (1, 2, 3))


@pytest.fixture
def data():
    return {
        'name': ' Campus Café ', 'area': ' Science ',
        'location': {'latitude': '1.29612345678901234567890123456789', 'longitude': 103.77},
        'category_ids': [str(A)],
    }


def validate(data):
    return validate_supplier_create(data, [A, C])


def issues(data):
    with pytest.raises(DomainValidationError) as caught:
        validate(data)
    return [(issue.fields, issue.code) for issue in caught.value.errors]


def test_clean_result_and_separate_client_type(data):
    result = validate(data)
    assert isinstance(result, SupplierCreateResult)
    assert not isinstance(result, SupplierCreateInput)
    assert result.name == 'Campus Café'
    assert result.area == 'Science'
    assert result.location.latitude == Decimal('1.29612345678901234567890123456789')
    assert result.location.longitude == Decimal('103.77')
    assert result.category_ids == [A]
    assert result.closing_day_offset is None
    assert result.opening_time is result.closing_time is None
    assert all(getattr(result, field) is None for field in ('description', 'building', 'floor', 'image_key'))
    assert data['name'] == ' Campus Café '
    assert data['category_ids'] == [str(A)]
    assert 'closing_day_offset' not in SupplierCreateInput.model_fields


@pytest.mark.parametrize('field', ['name', 'area', 'location', 'category_ids'])
def test_required_fields(data, field):
    del data[field]
    assert issues(data) == [((field,), 'REQUIRED_FIELD')]


@pytest.mark.parametrize('field', ['name', 'area', 'location', 'category_ids'])
def test_null_required_fields(data, field):
    data[field] = None
    code = 'INVALID_TEXT' if field in ('name', 'area') else 'INVALID_INPUT'
    assert issues(data) == [((field,), code)]


@pytest.mark.parametrize('field', ['latitude', 'longitude'])
def test_required_coordinates(data, field):
    del data['location'][field]
    assert issues(data) == [((f'location.{field}',), 'REQUIRED_FIELD')]


@pytest.mark.parametrize('field', ['latitude', 'longitude'])
@pytest.mark.parametrize('value', [None, True, 'NaN', '-Infinity', 'bad'])
def test_invalid_coordinates(data, field, value):
    data['location'][field] = value
    assert issues(data) == [((f'location.{field}',), 'INVALID_COORDINATE')]


@pytest.mark.parametrize('field', ['name', 'area'])
@pytest.mark.parametrize('value', ['', ' \t\n'])
def test_blank_required_text(data, field, value):
    data[field] = value
    assert issues(data) == [((field,), 'BLANK_TEXT')]


@pytest.mark.parametrize('area', ['Sci', 'science', 'USC', 'UHC', 'KR', 'NUH'])
def test_unknown_area(data, area):
    data['area'] = area
    assert issues(data) == [(('area',), 'UNKNOWN_AREA')]


@pytest.mark.parametrize('area', ['USC/UHC', 'KR/NUH'])
def test_combined_area_labels(data, area):
    data['area'] = area
    assert validate(data).area == area


@pytest.mark.parametrize('field', ['description', 'building', 'floor', 'image_key'])
@pytest.mark.parametrize('value', [None, '', ' \t\n'])
def test_empty_optional_text(data, field, value):
    data[field] = value
    assert getattr(validate(data), field) is None


@pytest.mark.parametrize('field', ['description', 'building', 'floor', 'image_key'])
def test_optional_text_preserves_spelling(data, field):
    data[field] = ' AbC é/01 '
    assert getattr(validate(data), field) == 'AbC é/01'


@pytest.mark.parametrize('floor', ['1', '01', 'B1'])
def test_floor_labels(data, floor):
    data['floor'] = floor
    assert validate(data).floor == floor


@pytest.mark.parametrize('floor', [1, 1.0, True])
def test_numeric_floor_rejected(data, floor):
    data['floor'] = floor
    assert issues(data) == [(('floor',), 'INVALID_TEXT')]


@pytest.mark.parametrize('field', [
    'id', 'created_at', 'updated_at', 'deleted_at', 'version', 'closing_day_offset', 'surprise',
])
@pytest.mark.parametrize('value', [None, 'client value'])
def test_forbidden_fields_including_null(data, field, value):
    data[field] = value
    assert issues(data) == [((field,), 'FORBIDDEN_FIELD')]
    with pytest.raises(ValidationError):
        SupplierCreateInput.model_validate(data)


def test_unknown_nested_field(data):
    data['location']['altitude'] = None
    assert issues(data) == [(('location.altitude',), 'FORBIDDEN_FIELD')]


@pytest.mark.parametrize(('opens', 'closes', 'offset'), [
    ('10:00', '19:00', 0), ('18:00', '02:00', 1), ('10:00', '10:00', 1),
    (time(10), time(19), 0), (time(18), '02:00', 1), (None, None, None),
])
def test_schedule(data, opens, closes, offset):
    data.update(opening_time=opens, closing_time=closes)
    result = validate(data)
    assert result.closing_day_offset == offset
    if opens is not None:
        assert isinstance(result.opening_time, time)
        assert isinstance(result.closing_time, time)


@pytest.mark.parametrize('field', ['opening_time', 'closing_time'])
def test_explicit_null_and_missing_time(data, field):
    data[field] = None
    assert validate(data).closing_day_offset is None


@pytest.mark.parametrize('field', ['opening_time', 'closing_time'])
@pytest.mark.parametrize('other_null', [True, False])
def test_incomplete_schedule(data, field, other_null):
    data[field] = '10:00'
    if other_null:
        data['closing_time' if field == 'opening_time' else 'opening_time'] = None
    assert issues(data) == [(('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE')]


@pytest.mark.parametrize('field', ['opening_time', 'closing_time'])
@pytest.mark.parametrize(('value', 'code'), [
    ('25:00', 'INVALID_TIME'), ('invalid', 'INVALID_TIME'),
    (3600, 'INVALID_TIME'), (True, 'INVALID_TIME'),
    ('10:00Z', 'TIMEZONE_NOT_ALLOWED'), ('10:00+08:00', 'TIMEZONE_NOT_ALLOWED'),
    (time(10, tzinfo=timezone.utc), 'TIMEZONE_NOT_ALLOWED'),
])
def test_invalid_time_does_not_imply_incomplete_schedule(data, field, value, code):
    data[field] = value
    assert issues(data) == [((field,), code)]


def test_both_invalid_times_and_unrelated_errors(data):
    data.update(opening_time='invalid', closing_time='25:00', name=' ')
    assert set(issues(data)) == {
        (('name',), 'BLANK_TEXT'), (('opening_time',), 'INVALID_TIME'),
        (('closing_time',), 'INVALID_TIME'),
    }


def test_empty_categories(data):
    data['category_ids'] = []
    assert issues(data) == [(('category_ids',), 'EMPTY_CATEGORIES')]


def test_unknown_repeated_categories_keep_positions(data):
    data['category_ids'] = [A, A, B, str(B)]
    assert issues(data) == [
        (('category_ids.2',), 'UNKNOWN_CATEGORY'), (('category_ids.3',), 'UNKNOWN_CATEGORY'),
    ]


def test_malformed_and_unknown_categories_checked_together(data):
    data['category_ids'] = ['bad', A, None, B, 'bad', 123]
    assert issues(data) == [
        (('category_ids.0',), 'INVALID_UUID'), (('category_ids.2',), 'INVALID_UUID'),
        (('category_ids.3',), 'UNKNOWN_CATEGORY'), (('category_ids.4',), 'INVALID_UUID'),
        (('category_ids.5',), 'INVALID_UUID'),
    ]


def test_successful_deduplication_preserves_order(data):
    data['category_ids'] = [str(A), A, C, str(C), A]
    assert validate(data).category_ids == [A, C]
    assert len(data['category_ids']) == 5


def test_membership_comes_only_from_caller(data):
    with pytest.raises(DomainValidationError) as caught:
        validate_supplier_create(data, [])
    assert caught.value.errors[0].code == 'UNKNOWN_CATEGORY'
    data['category_ids'] = [B]
    assert validate_supplier_create(data, iter([B])).category_ids == [B]


def test_preparsed_client_input_still_checks_category_membership(data):
    data['opening_time'] = '10:00'
    parsed = SupplierCreateInput.model_validate(data)
    with pytest.raises(DomainValidationError) as caught:
        validate_supplier_create(parsed, [])
    assert [issue.code for issue in caught.value.errors] == [
        'UNKNOWN_CATEGORY', 'INCOMPLETE_SCHEDULE',
    ]


@pytest.mark.parametrize('value', ['not a list', {}, 1])
def test_category_container_type(data, value):
    data['category_ids'] = value
    assert issues(data) == [(('category_ids',), 'INVALID_INPUT')]


def test_missing_coordinate_does_not_hide_other_coordinate_error(data):
    data['location'] = {'longitude': 181}
    assert issues(data) == [
        (('location.latitude',), 'REQUIRED_FIELD'),
        (('location.longitude',), 'COORDINATE_OUT_OF_RANGE'),
    ]


def test_combined_failures(data):
    data.update(name=' ', area='unknown', id=None, closing_day_offset=None,
                opening_time='10:00', floor=1, category_ids=[A, 'bad', B, B])
    data['location'] = {'latitude': 91, 'longitude': None, 'extra': None}
    expected = {
        (('name',), 'BLANK_TEXT'), (('area',), 'UNKNOWN_AREA'),
        (('location.latitude',), 'COORDINATE_OUT_OF_RANGE'),
        (('location.longitude',), 'INVALID_COORDINATE'),
        (('location.extra',), 'FORBIDDEN_FIELD'),
        (('category_ids.1',), 'INVALID_UUID'),
        (('category_ids.2',), 'UNKNOWN_CATEGORY'), (('category_ids.3',), 'UNKNOWN_CATEGORY'),
        (('floor',), 'INVALID_TEXT'), (('id',), 'FORBIDDEN_FIELD'),
        (('closing_day_offset',), 'FORBIDDEN_FIELD'),
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    }
    assert set(issues(data)) == expected
    with pytest.raises(DomainValidationError) as caught:
        validate(data)
    envelope = caught.value.to_dict()['error']
    assert envelope['code'] == 'VALIDATION_ERROR'
    assert envelope['message'] == 'Some fields are invalid.'
    assert len(envelope['details']) == len(expected)
    assert all(set(detail) == {'fields', 'code', 'message'} for detail in envelope['details'])


@pytest.mark.parametrize('data', [None, [], 'invalid', 42])
def test_non_object_input(data):
    assert issues(data) == [((), 'INVALID_INPUT')]

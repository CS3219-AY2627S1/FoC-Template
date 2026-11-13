# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — add factory-based test-only routes covering aggregate create/PATCH failures, original category positions, single schedule-pair issues, safe request errors, invalid JSON, and unchanged stored values without live services.
# Scope: Writing implementation code — correct the stale route-exclusion regression assertion to permit supplier GET routes while continuing to reject supplier mutation and test-only routes. (ai-20260930-022)
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code — permit supplier POST in production route assertions while excluding unimplemented mutations and test-only routes. (ai-20261001-003)
# Author review: Keith confirmed review of all affected HTTP validation changes. Keith confirmed review of public-read registration changes (ai-20260930-022).
# Author review: Keith confirmed review of all retained changes for ai-20261001-003.
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Debugging assistance — correct the stale production route-registration assertion to permit the implemented PATCH endpoint while retaining exclusion of test-only and unimplemented supplier routes. (ai-20261001-007)
# Author review: Keith confirmed review of the retained PATCH adapter changes (ai-20261001-007).
# Scope: Writing implementation code; Debugging assistance — correct the existing production route-registration expectation to include the newly mounted DELETE endpoint while preserving the test-only route exclusion. (ai-20261001-011)
# Author review: Keith confirmed review of the retained DELETE adapter changes (ai-20261001-011).
# Details: ../../ai/usage-log.md; ai-20260930-003; ai-20260930-022; ai-20261001-003; ai-20261001-007; ai-20261001-011

from copy import deepcopy
from datetime import time
from typing import Any
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import Body, Query
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.validation.suppliers import validate_supplier_create, validate_supplier_patch

A, B, C = (UUID(int=value) for value in (1, 2, 3))
SECRET = 'private request content and internal exception details'


class ParsedLocation(BaseModel):
    latitude: float


class ParsedRequest(BaseModel):
    location: ParsedLocation
    category_ids: list[UUID]


@pytest.fixture
def stored():
    return {
        'name': 'Campus Café', 'area': 'Science', 'category_ids': [A, C],
        'opening_time': time(10), 'closing_time': time(19),
    }


@pytest.fixture
def validation_client(app, stored, monkeypatch):
    @app.post('/test/create')
    def create_supplier(payload: Any = Body(...)):
        return validate_supplier_create(payload, [A, C])

    @app.patch('/test/patch')
    def patch_supplier(payload: Any = Body(...)):
        return validate_supplier_patch(payload, stored, [A, C])

    # These routes deliberately exercise FastAPI's automatic parsing handler,
    # separately from the aggregate-validation pattern required by mutations.
    @app.post('/test/parsed')
    def parsed(payload: ParsedRequest):
        return payload

    @app.get('/test/query')
    def query(expected_version: int = Query(..., gt=0)):
        return {'version': expected_version}

    @app.get('/test/private-error')
    def private_error():
        raise RequestValidationError([
            {'type': 'value_error', 'loc': ('body', 'name'), 'msg': SECRET,
             'input': SECRET, 'ctx': {'error': ValueError(SECRET)}},
            {'type': 'PRIVATE_ERROR', 'loc': ('body', 'area'), 'msg': SECRET,
             'input': SECRET},
            {'type': 'BLANK_TEXT', 'loc': ('body', 'description'), 'msg': SECRET,
             'input': SECRET},
        ], body={'private': SECRET})

    with TestClient(app) as client:
        connect = Mock(side_effect=AssertionError('Validation must not access the database'))
        monkeypatch.setattr(app.state.engine, 'connect', connect)
        yield client
        connect.assert_not_called()


def envelope(response):
    assert response.status_code == 422
    payload = response.json()
    assert set(payload) == {'error'}
    error = payload['error']
    assert set(error) == {'code', 'message', 'details'}
    assert error['code'] == 'VALIDATION_ERROR'
    assert error['message'] == 'Some fields are invalid.'
    assert isinstance(error['details'], list)
    for detail in error['details']:
        assert set(detail) == {'fields', 'code', 'message'}
        assert isinstance(detail['fields'], list)
        assert isinstance(detail['code'], str)
        assert isinstance(detail['message'], str)
    assert SECRET not in response.text
    return error['details']


def issue_set(details):
    return {(tuple(issue['fields']), issue['code']) for issue in details}


def test_create_aggregates_domain_and_parsing_errors(validation_client):
    response = validation_client.post('/test/create', json={
        'name': ' ', 'area': 'Unknown', 'location': {'latitude': 91, 'longitude': SECRET},
        'category_ids': [str(A), str(A), str(B), str(B), SECRET],
        'opening_time': '10:00', 'closing_day_offset': None, 'id': None,
    })
    details = envelope(response)
    expected = {
        (('name',), 'BLANK_TEXT'), (('area',), 'UNKNOWN_AREA'),
        (('location.latitude',), 'COORDINATE_OUT_OF_RANGE'),
        (('location.longitude',), 'INVALID_COORDINATE'),
        (('category_ids.2',), 'UNKNOWN_CATEGORY'),
        (('category_ids.3',), 'UNKNOWN_CATEGORY'),
        (('category_ids.4',), 'INVALID_UUID'),
        (('closing_day_offset',), 'FORBIDDEN_FIELD'), (('id',), 'FORBIDDEN_FIELD'),
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    }
    assert issue_set(details) == expected
    assert len(details) == len(expected)


def test_patch_aggregates_and_does_not_change_stored_values(validation_client, stored):
    original = deepcopy(stored)
    response = validation_client.patch('/test/patch', json={
        'name': ' ', 'area': 'Unknown', 'floor': 1, 'opening_time': None,
        'category_ids': [str(A), str(A), str(B), str(B), SECRET],
        'location': {'latitude': 1, 'longitude': 103}, 'version': None,
    })
    details = envelope(response)
    expected = {
        (('name',), 'BLANK_TEXT'), (('area',), 'UNKNOWN_AREA'),
        (('floor',), 'INVALID_TEXT'), (('category_ids.2',), 'UNKNOWN_CATEGORY'),
        (('category_ids.3',), 'UNKNOWN_CATEGORY'), (('category_ids.4',), 'INVALID_UUID'),
        (('location',), 'FORBIDDEN_FIELD'), (('version',), 'FORBIDDEN_FIELD'),
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    }
    assert issue_set(details) == expected
    assert len(details) == len(expected)
    assert stored == original


def test_request_validation_body_paths(validation_client):
    details = envelope(validation_client.post('/test/parsed', json={
        'location': {'latitude': SECRET}, 'category_ids': [str(A), SECRET],
    }))
    assert issue_set(details) == {
        (('location.latitude',), 'INVALID_INPUT'), (('category_ids.1',), 'INVALID_UUID'),
    }


@pytest.mark.parametrize('value', [None, 'bad', '0'])
def test_query_paths_keep_query_prefix(validation_client, value):
    params = {} if value is None else {'expected_version': value}
    details = envelope(validation_client.get('/test/query', params=params))
    assert details[0]['fields'] == ['query.expected_version']
    assert details[0]['code'] == ('REQUIRED_FIELD' if value is None else 'INVALID_INPUT')


@pytest.mark.parametrize('body', ['{', '{"name":', '{"private":"' + SECRET + '",}'])
def test_invalid_json_is_safe(validation_client, body):
    details = envelope(validation_client.post(
        '/test/create', content=body, headers={'Content-Type': 'application/json'},
    ))
    assert details == [{
        'fields': [], 'code': 'INVALID_JSON',
        'message': 'Request body must contain valid JSON.',
    }]


def test_missing_request_body(validation_client):
    details = envelope(validation_client.post('/test/create'))
    assert details[0]['fields'] == []
    assert details[0]['code'] == 'REQUIRED_FIELD'


def test_internal_messages_context_and_body_are_not_exposed(validation_client):
    details = envelope(validation_client.get('/test/private-error'))
    assert [detail['code'] for detail in details] == ['INVALID_INPUT', 'INVALID_INPUT', 'BLANK_TEXT']
    assert details[2]['message'] == 'Enter nonblank text.'


def test_invalid_time_does_not_also_report_incomplete_schedule(validation_client):
    details = envelope(validation_client.patch('/test/patch', json={
        'opening_time': SECRET, 'closing_time': None, 'name': ' ',
    }))
    assert issue_set(details) == {
        (('opening_time',), 'INVALID_TIME'), (('name',), 'BLANK_TEXT'),
    }


def test_successful_create_cleans_and_keeps_unknown_hours(validation_client):
    response = validation_client.post('/test/create', json={
        'name': ' Campus Café ', 'area': ' USC/UHC ', 'floor': ' 01 ', 'description': ' ',
        'location': {'latitude': '1.296', 'longitude': 103.77},
        'category_ids': [str(C), str(C), str(A)],
    })
    assert response.status_code == 200
    body = response.json()
    assert body['name'] == 'Campus Café'
    assert body['area'] == 'USC/UHC'
    assert body['floor'] == '01'
    assert body['description'] is None
    assert body['category_ids'] == [str(C), str(A)]
    assert body['opening_time'] is body['closing_time'] is body['closing_day_offset'] is None


@pytest.mark.parametrize(('patch', 'offset'), [
    ({}, 0), ({'closing_time': '02:00'}, 1), ({'opening_time': '19:00'}, 1),
    ({'opening_time': None, 'closing_time': None}, None),
])
def test_successful_patch_merges_stored_times(validation_client, stored, patch, offset):
    original = deepcopy(stored)
    response = validation_client.patch('/test/patch', json=patch)
    assert response.status_code == 200
    body = response.json()
    assert body['closing_day_offset'] == offset
    assert body['name'] == stored['name']
    assert stored == original


def test_factory_has_no_test_or_unimplemented_supplier_mutation_routes(app):
    assert all(not route.path.startswith('/test/') for route in app.routes)
    assert {(route.path, method) for route in app.routes
            if route.path.startswith('/suppliers') for method in route.methods} == {
        ('/suppliers', 'GET'), ('/suppliers', 'POST'), ('/suppliers/{id}', 'GET'),
        ('/suppliers/{id}', 'PATCH'), ('/suppliers/{id}', 'DELETE'),
    }

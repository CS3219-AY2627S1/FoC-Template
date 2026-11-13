# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code; Boilerplate generation — configure controlled service and User Service responses using existing creation-test fixtures and write 55 mounted-route cases for authentication, request validation, merged body validation, category presence, safe failures, canonical output, session cleanup, and OpenAPI requirements. (ai-20261001-007)
# Author review: Keith confirmed review of the retained PATCH adapter changes (ai-20261001-007).
# Scope: Writing implementation code; Boilerplate generation; Refactoring and documentation improvements — reuse controlled authentication fixtures and add 31 mounted DELETE cases for validation, authentication before session creation, repeat deletion, transaction completion and commit failure, cleanup, safe errors, no retries, unexpected errors, and OpenAPI security/bodyless success; update the module docstring. (ai-20261001-011)
# Author review: Keith confirmed review of the retained DELETE adapter changes (ai-20261001-011).
# Details: ../../ai/usage-log.md; ai-20261001-007; ai-20261001-011

"""Mounted PATCH/DELETE adapters with real auth and controlled dependencies."""

from dataclasses import replace
from datetime import time, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError, TimeoutError

from app.schemas import SupplierResponse
from app.services import suppliers
from tests.api.test_supplier_creates import (
    AUTH, CATEGORIES, PROFILE, SECRET, TOKEN, create_client, issues, supplier,
)

UPDATE = suppliers.update_supplier
DELETE = suppliers.delete_supplier


@pytest.fixture
def update_client(create_client, supplier, monkeypatch):
    create_client.update = Mock(return_value=replace(
        supplier, version=2, updated_at=supplier.updated_at + timedelta(seconds=1),
        categories=(CATEGORIES[1],), description=None,
    ))
    monkeypatch.setattr(suppliers, 'update_supplier', create_client.update)
    create_client.url = f'/suppliers/{supplier.id}?expected_version=1'
    return create_client


def test_admin_receives_canonical_saved_200(update_client, supplier):
    payload = {'description': None, 'category_ids': [str(CATEGORIES[1].id)]}
    response = update_client.client.patch(update_client.url, headers=AUTH, json=payload)
    assert response.status_code == 200
    assert response.json() == SupplierResponse.from_read(update_client.update.return_value).model_dump(mode='json')
    assert response.json()['version'] == 2
    assert response.json()['description'] is None
    assert response.json()['categories'] == [{'id': str(CATEGORIES[1].id), 'name': CATEGORIES[1].name}]
    update_client.update.assert_called_once_with(update_client.sessions[0], supplier.id, 1, payload)
    assert type(update_client.update.call_args.args[3]) is dict
    assert len(update_client.requests) == 1
    update_client.sessions[0].close.assert_called_once_with()
    update_client.create.assert_not_called()


@pytest.mark.parametrize('version,code', [
    (None, 'REQUIRED_FIELD'), ('bad', 'INVALID_INPUT'), ('1.5', 'INVALID_INPUT'),
    ('0', 'INVALID_INPUT'), ('-1', 'INVALID_INPUT'), ('', 'INVALID_INPUT'),
])
def test_expected_version_validation(update_client, supplier, version, code):
    url = f'/suppliers/{supplier.id}'
    response = update_client.client.patch(url, headers=AUTH, json={},
        params={} if version is None else {'expected_version': version})
    assert issues(response) == {(('query.expected_version',), code)}
    update_client.update.assert_not_called()
    for session in update_client.sessions:
        session.close.assert_called_once_with()


def test_invalid_uuid_uses_global_validation(update_client):
    response = update_client.client.patch('/suppliers/not-a-uuid?expected_version=1', headers=AUTH, json={})
    assert issues(response) == {(('path.id',), 'INVALID_UUID')}
    update_client.update.assert_not_called()


@pytest.mark.parametrize('body', ['{', '{"private":"' + SECRET + '",}'])
def test_malformed_json_uses_global_validation(update_client, body):
    response = update_client.client.patch(update_client.url,
        headers={**AUTH, 'Content-Type': 'application/json'}, content=body)
    assert issues(response) == {((), 'INVALID_JSON')}
    update_client.update.assert_not_called()
    update_client.factory.assert_not_called()


@pytest.mark.parametrize('content', ['', 'null'])
def test_missing_body_uses_global_validation(update_client, content):
    response = update_client.client.patch(update_client.url,
        headers={**AUTH, 'Content-Type': 'application/json'}, content=content)
    assert issues(response) == {((), 'REQUIRED_FIELD')}
    update_client.update.assert_not_called()


@pytest.mark.parametrize('authorization', [None, '', 'Basic abc', 'Bearer', 'Bearer two tokens'])
def test_missing_or_invalid_credentials_block_update(update_client, authorization):
    response = update_client.client.patch(update_client.url, json={},
        headers={} if authorization is None else {'Authorization': authorization})
    assert response.status_code == 401
    assert response.json()['error']['code'] == 'AUTHENTICATION_REQUIRED'
    assert response.headers['WWW-Authenticate'] == 'Bearer'
    update_client.update.assert_not_called()
    update_client.factory.assert_not_called()
    update_client.reply.assert_not_called()


@pytest.mark.parametrize('failure,status,code', [
    ('revoked', 401, 'AUTHENTICATION_REQUIRED'), ('user', 403, 'FORBIDDEN'),
    ('outage', 503, 'AUTHENTICATION_UNAVAILABLE'), ('timeout', 503, 'AUTHENTICATION_UNAVAILABLE'),
])
def test_upstream_authentication_blocks_update(update_client, failure, status, code):
    if failure == 'timeout':
        update_client.reply.side_effect = httpx.ReadTimeout(SECRET)
    else:
        update_client.reply.return_value = {
            'revoked': httpx.Response(401, text=SECRET),
            'user': httpx.Response(200, json={**PROFILE, 'role': 'user'}),
            'outage': httpx.Response(503, text=SECRET),
        }[failure]
    response = update_client.client.patch(update_client.url,
        headers={**AUTH, 'X-Role': 'admin'}, json={'role': 'admin'})
    assert response.status_code == status
    assert response.json()['error']['code'] == code
    assert SECRET not in response.text and TOKEN not in response.text
    update_client.update.assert_not_called()
    update_client.factory.assert_not_called()


@pytest.mark.parametrize('error,status,code,message', [
    (suppliers.SupplierNotFound(), 404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.'),
    (suppliers.SupplierVersionConflict(), 409, 'VERSION_CONFLICT',
     'This supplier has changed. Reload it before trying again.'),
    (suppliers.SupplierDuplicate(), 409, 'SUPPLIER_DUPLICATE',
     'An active supplier with this name and location already exists.'),
    (suppliers.SupplierUpdateUnavailable(), 503, 'DATABASE_UNAVAILABLE',
     'Supplier update is temporarily unavailable.'),
])
def test_service_errors_are_safe_and_never_retried(update_client, error, status, code, message):
    error.args = (SECRET + TOKEN,)
    update_client.update.side_effect = error
    response = update_client.client.patch(update_client.url, headers=AUTH, json={})
    assert response.status_code == status
    assert response.json() == {'error': {'code': code, 'message': message}}
    update_client.update.assert_called_once()
    update_client.sessions[0].close.assert_called_once_with()


@pytest.mark.parametrize('error', [RuntimeError('defect'), IntegrityError('SQL', {}, Exception('unrelated'))])
def test_unexpected_errors_are_not_misclassified(update_client, error):
    update_client.update.side_effect = error
    with pytest.raises(type(error)) as caught:
        update_client.client.patch(update_client.url, headers=AUTH, json={})
    assert caught.value is error
    update_client.sessions[0].close.assert_called_once_with()


@pytest.fixture
def aggregate_client(update_client, supplier, monkeypatch):
    # Run the actual service and merged validator; control only repository I/O.
    update_client.update.side_effect = UPDATE
    monkeypatch.setattr(suppliers, 'read_categories', Mock(return_value=CATEGORIES))
    update_client.read = Mock(return_value=supplier)
    update_client.write = Mock(return_value=True)
    update_client.assign = Mock()
    monkeypatch.setattr(suppliers, 'find_active_detail', update_client.read)
    monkeypatch.setattr(suppliers, 'update_active_supplier', update_client.write)
    monkeypatch.setattr(suppliers, 'replace_category_assignments', update_client.assign)
    return update_client


@pytest.mark.parametrize('body', [[], ['supplier'], 'supplier', 42, True])
def test_non_object_body_reaches_aggregate_validator(aggregate_client, body):
    response = aggregate_client.client.patch(aggregate_client.url, headers=AUTH, json=body)
    assert issues(response) == {((), 'INVALID_INPUT')}
    assert aggregate_client.update.call_args.args[3] == body
    aggregate_client.write.assert_not_called()


@pytest.mark.parametrize('field', [
    'location', 'id', 'created_at', 'updated_at', 'deleted_at', 'version',
    'closing_day_offset', 'expected_version', 'unknown',
])
def test_forbidden_fields_reject_before_write(aggregate_client, field):
    response = aggregate_client.client.patch(aggregate_client.url, headers=AUTH, json={field: None})
    assert issues(response) == {((field,), 'FORBIDDEN_FIELD')}
    aggregate_client.write.assert_not_called()
    aggregate_client.assign.assert_not_called()


@pytest.mark.parametrize('body,expected', [
    ({'name': None}, {(('name',), 'INVALID_TEXT')}),
    ({'area': None}, {(('area',), 'INVALID_TEXT')}),
    ({'category_ids': None}, {(('category_ids',), 'INVALID_INPUT')}),
    ({'category_ids': []}, {(('category_ids',), 'EMPTY_CATEGORIES')}),
    ({'closing_time': None}, {(('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE')}),
    ({'opening_time': None}, {(('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE')}),
])
def test_invalid_merged_values_reject_before_write(aggregate_client, body, expected):
    response = aggregate_client.client.patch(aggregate_client.url, headers=AUTH, json=body)
    assert issues(response) == expected
    aggregate_client.write.assert_not_called()
    aggregate_client.assign.assert_not_called()


def test_independent_issues_preserve_original_category_positions(aggregate_client):
    known, unknown = str(CATEGORIES[0].id), str(UUID(int=999))
    body = {'name': ' ', 'area': 'Unknown', 'category_ids': [known, known, unknown, unknown, SECRET],
            'closing_time': None, 'version': 3, 'location': None}
    response = aggregate_client.client.patch(aggregate_client.url, headers=AUTH, json=body)
    expected = {
        (('name',), 'BLANK_TEXT'), (('area',), 'UNKNOWN_AREA'),
        (('category_ids.2',), 'UNKNOWN_CATEGORY'), (('category_ids.3',), 'UNKNOWN_CATEGORY'),
        (('category_ids.4',), 'INVALID_UUID'), (('version',), 'FORBIDDEN_FIELD'),
        (('location',), 'FORBIDDEN_FIELD'),
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    }
    assert issues(response) == expected
    assert len(response.json()['error']['details']) == len(expected)
    aggregate_client.write.assert_not_called()
    aggregate_client.assign.assert_not_called()


@pytest.mark.parametrize('body,changes,category_ids', [
    ({}, {}, None),
    ({'description': None}, {'description': None}, None),
    ({'closing_time': '23:00'}, {'closing_time': time(23), 'closing_day_offset': 0}, None),
    ({'opening_time': '01:00'}, {'opening_time': time(1), 'closing_day_offset': 0}, None),
    ({'opening_time': None, 'closing_time': None},
     {'opening_time': None, 'closing_time': None, 'closing_day_offset': None}, None),
    ({'category_ids': [str(CATEGORIES[1].id)] * 2}, {}, (CATEGORIES[1].id,)),
])
def test_valid_patch_presence_and_merged_schedule(aggregate_client, supplier, body, changes, category_ids):
    saved = replace(supplier, **changes, version=2,
        updated_at=supplier.updated_at + timedelta(seconds=1),
        categories=(CATEGORIES[1],) if category_ids else supplier.categories)
    aggregate_client.read.side_effect = [supplier, saved]
    response = aggregate_client.client.patch(aggregate_client.url, headers=AUTH, json=body)
    assert response.status_code == 200
    assert response.json() == SupplierResponse.from_read(saved).model_dump(mode='json')
    aggregate_client.write.assert_called_once()
    assert aggregate_client.write.call_args.args[:4] == (aggregate_client.sessions[0], supplier.id, 1, changes)
    if category_ids is None:
        aggregate_client.assign.assert_not_called()
    else:
        aggregate_client.assign.assert_called_once_with(aggregate_client.sessions[0], supplier.id, category_ids)
    aggregate_client.sessions[0].close.assert_called_once_with()


def test_openapi_requires_bearer_and_positive_version(update_client):
    schema = update_client.client.get('/openapi.json').json()
    operation = schema['paths']['/suppliers/{id}']['patch']
    assert operation['security'] == [{'HTTPBearer': []}]
    parameter = next(p for p in operation['parameters'] if p['name'] == 'expected_version')
    assert parameter['in'] == 'query' and parameter['required'] is True
    assert parameter['schema']['type'] == 'integer'
    assert parameter['schema']['exclusiveMinimum'] == 0
    assert operation['responses']['200']['content']['application/json']['schema'] == {
        '$ref': '#/components/schemas/SupplierResponse',
    }
    body = operation['requestBody']['content']['application/json']['schema']
    assert '$ref' not in body and 'properties' not in body
    for path in ('/suppliers', '/suppliers/{id}', '/categories', '/areas'):
        assert 'security' not in schema['paths'][path]['get']
    update_client.factory.assert_not_called()


@pytest.fixture
def delete_client(create_client, supplier, monkeypatch):
    create_client.delete = Mock(return_value=None)
    monkeypatch.setattr(suppliers, 'delete_supplier', create_client.delete)
    create_client.url = f'/suppliers/{supplier.id}?expected_version=1'
    return create_client


@pytest.fixture
def deletion_service_client(delete_client, supplier, monkeypatch):
    # Exercise the actual transaction-owning service; control only repository I/O.
    delete_client.delete.side_effect = DELETE
    delete_client.stored = SimpleNamespace(
        deleted_at=None, updated_at=supplier.updated_at, version=supplier.version,
    )
    delete_client.commits = []
    def lock(session, identity):
        event.listen(session, 'after_commit', lambda *_: delete_client.commits.append(identity))
        return delete_client.stored
    delete_client.lock = Mock(side_effect=lock)
    delete_client.write = Mock(wraps=suppliers.soft_delete_supplier)
    monkeypatch.setattr(suppliers, 'lock_supplier', delete_client.lock)
    monkeypatch.setattr(suppliers, 'soft_delete_supplier', delete_client.write)
    return delete_client


def test_delete_and_stale_repeat_return_empty_204_after_completion(deletion_service_client, supplier):
    client = deletion_service_client
    for count in (1, 2):
        response = client.client.delete(client.url, headers=AUTH)
        assert response.status_code == 204
        assert response.content == b''
        assert 'content-type' not in response.headers
        assert client.commits == [supplier.id] * count
        assert client.delete.call_count == count
        client.delete.assert_called_with(client.sessions[-1], supplier.id, 1)
        client.sessions[-1].close.assert_called_once_with()
        assert not client.sessions[-1].in_transaction()
        client.write.assert_called_once()
        if count == 1:
            deleted_at = client.stored.deleted_at
        assert client.stored.deleted_at == client.stored.updated_at == deleted_at
        assert client.stored.version == 2
    assert len(client.sessions) == len(client.requests) == 2
    assert client.sessions[0] is not client.sessions[1]
    client.create.assert_not_called()


@pytest.mark.parametrize('deleted', [False, True])
@pytest.mark.parametrize('version,code', [
    (None, 'REQUIRED_FIELD'), ('bad', 'INVALID_INPUT'), ('1.5', 'INVALID_INPUT'),
    ('0', 'INVALID_INPUT'), ('-1', 'INVALID_INPUT'), ('', 'INVALID_INPUT'),
])
def test_delete_version_validation_before_service(deletion_service_client, supplier, deleted, version, code):
    client = deletion_service_client
    if deleted:
        client.stored.deleted_at = supplier.updated_at
        client.stored.version = 2
    response = client.client.delete(f'/suppliers/{supplier.id}', headers=AUTH,
        params={} if version is None else {'expected_version': version})
    assert issues(response) == {(('query.expected_version',), code)}
    client.delete.assert_not_called()
    client.lock.assert_not_called()
    client.write.assert_not_called()
    for session in client.sessions:
        session.close.assert_called_once_with()


def test_delete_uuid_validation(delete_client):
    response = delete_client.client.delete('/suppliers/not-a-uuid?expected_version=1', headers=AUTH)
    assert issues(response) == {(('path.id',), 'INVALID_UUID')}
    delete_client.delete.assert_not_called()


@pytest.mark.parametrize('authorization', [None, '', 'Basic abc', 'Bearer', 'Bearer two tokens'])
def test_delete_missing_or_invalid_credentials_never_opens_session(delete_client, authorization):
    response = delete_client.client.delete(delete_client.url,
        headers={} if authorization is None else {'Authorization': authorization})
    assert response.status_code == 401
    assert response.json() == {'error': {
        'code': 'AUTHENTICATION_REQUIRED', 'message': 'Invalid authentication credentials',
    }}
    assert response.headers['WWW-Authenticate'] == 'Bearer'
    delete_client.delete.assert_not_called()
    delete_client.factory.assert_not_called()
    delete_client.reply.assert_not_called()


@pytest.mark.parametrize('failure,status,code,message', [
    ('revoked', 401, 'AUTHENTICATION_REQUIRED', 'Invalid authentication credentials'),
    ('user', 403, 'FORBIDDEN', 'Administrator access required'),
    ('outage', 503, 'AUTHENTICATION_UNAVAILABLE', 'Authentication temporarily unavailable'),
    ('timeout', 503, 'AUTHENTICATION_UNAVAILABLE', 'Authentication temporarily unavailable'),
])
def test_delete_upstream_authentication_rejection(delete_client, failure, status, code, message):
    if failure == 'timeout':
        delete_client.reply.side_effect = httpx.ReadTimeout(SECRET)
    else:
        delete_client.reply.return_value = {
            'revoked': httpx.Response(401, text=SECRET),
            'user': httpx.Response(200, json={**PROFILE, 'role': 'user'}),
            'outage': httpx.Response(503, text=SECRET),
        }[failure]
    response = delete_client.client.delete(delete_client.url, headers={**AUTH, 'X-Role': 'admin'})
    assert response.status_code == status
    assert response.json() == {'error': {'code': code, 'message': message}}
    assert SECRET not in response.text and TOKEN not in response.text
    if status == 401:
        assert response.headers['WWW-Authenticate'] == 'Bearer'
    assert len(delete_client.requests) == 1
    delete_client.delete.assert_not_called()
    delete_client.factory.assert_not_called()


@pytest.mark.parametrize('error,status,code,message', [
    (suppliers.SupplierNotFound(), 404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.'),
    (suppliers.SupplierVersionConflict(), 409, 'VERSION_CONFLICT',
     'This supplier has changed. Reload it before trying again.'),
    (suppliers.SupplierDeleteUnavailable(), 503, 'DATABASE_UNAVAILABLE',
     'Supplier deletion is temporarily unavailable.'),
])
def test_delete_safe_service_errors_without_retries(delete_client, error, status, code, message):
    error.args = (SECRET + TOKEN,)
    delete_client.delete.side_effect = error
    response = delete_client.client.delete(delete_client.url, headers=AUTH)
    assert response.status_code == status
    assert response.json() == {'error': {'code': code, 'message': message}}
    delete_client.delete.assert_called_once()
    delete_client.sessions[0].close.assert_called_once_with()


@pytest.mark.parametrize('error', [RuntimeError('defect'), IntegrityError('SQL', {}, Exception('unrelated'))])
def test_delete_unexpected_errors_propagate_and_close_session(delete_client, error):
    delete_client.delete.side_effect = error
    with pytest.raises(type(error)) as caught:
        delete_client.client.delete(delete_client.url, headers=AUTH)
    assert caught.value is error
    delete_client.delete.assert_called_once()
    delete_client.sessions[0].close.assert_called_once_with()


@pytest.mark.parametrize('deleted', [False, True])
def test_delete_commit_failure_cannot_return_204(deletion_service_client, deleted):
    client = deletion_service_client
    if deleted:
        client.stored.deleted_at = client.stored.updated_at
        client.stored.version = 2
    original = client.lock.side_effect
    fail = Mock(side_effect=TimeoutError(SECRET))
    def lock(session, identity):
        event.listen(session, 'before_commit', fail)
        return original(session, identity)
    client.lock.side_effect = lock
    response = client.client.delete(client.url, headers=AUTH)
    assert response.status_code == 503
    assert response.json() == {'error': {
        'code': 'DATABASE_UNAVAILABLE', 'message': 'Supplier deletion is temporarily unavailable.',
    }}
    fail.assert_called_once()
    client.delete.assert_called_once()
    assert client.commits == []
    assert not client.sessions[0].in_transaction()
    client.sessions[0].close.assert_called_once_with()


def test_delete_openapi_security_validation_and_bodyless_success(delete_client):
    schema = delete_client.client.get('/openapi.json').json()
    operation = schema['paths']['/suppliers/{id}']['delete']
    assert operation['security'] == [{'HTTPBearer': []}]
    assert schema['components']['securitySchemes']['HTTPBearer'] == {'type': 'http', 'scheme': 'bearer'}
    parameters = {p['name']: p for p in operation['parameters']}
    assert parameters['id']['in'] == 'path' and parameters['id']['required'] is True
    assert parameters['id']['schema']['format'] == 'uuid'
    version = parameters['expected_version']
    assert version['in'] == 'query' and version['required'] is True
    assert version['schema']['type'] == 'integer'
    assert version['schema']['exclusiveMinimum'] == 0
    assert 'requestBody' not in operation
    assert 'content' not in operation['responses']['204']
    assert '200' not in operation['responses']
    for path in ('/suppliers', '/suppliers/{id}', '/categories', '/areas'):
        assert 'security' not in schema['paths'][path]['get']
    delete_client.factory.assert_not_called()

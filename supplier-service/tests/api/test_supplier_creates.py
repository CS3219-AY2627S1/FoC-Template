# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-01
# Scope: Writing implementation code — test administrator-only POST using controlled User Service responses, real authentication dependencies, raw aggregate validation, canonical output, safe failures, session cleanup, OpenAPI security, and anonymous reads.
# Author review: Keith confirmed review of this file and all retained POST tests.
# Details: ../../ai/usage-log.md; ai-20261001-003

"""Administrator POST adapter with real auth dependencies and controlled upstreams."""

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, time, timezone
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.clients.user_service import UserServiceClient
from app.repositories.suppliers import CategoryRead, SupplierPage, SupplierRead
from app.schemas import SupplierResponse
from app.services import suppliers


TOKEN = 'Opaque.Session_123-abc+/='
AUTH = {'Authorization': f'Bearer {TOKEN}'}
PROFILE = {'id': str(UUID(int=42)), 'role': 'admin', 'status': 'active'}
SECRET = 'private SQL parameters credentials uq_supplier_active_name_location'
CATEGORIES = (CategoryRead(UUID(int=1), 'Coffee'), CategoryRead(UUID(int=2), 'Food'))
CREATE = suppliers.create_supplier


@pytest.fixture
def supplier():
    timestamp = datetime(2026, 10, 1, 2, 3, 4, 123456, tzinfo=timezone.utc)
    return SupplierRead(
        id=UUID('a98f9ffd-1d20-4b9d-88f0-585039d5949a'), name='Campus Café', area='Science',
        description='Near entrance', building='S16', floor='1', image_key='supplier/cafe.png',
        opening_time=time(22, 30), closing_time=time(2, 15), closing_day_offset=1,
        created_at=timestamp, updated_at=timestamp, deleted_at=None, version=1,
        latitude=1.291876, longitude=103.781234, categories=CATEGORIES,
    )


@pytest.fixture
def payload():
    return {
        'name': ' Campus Café ', 'area': ' Science ',
        'location': {'latitude': '1.291876', 'longitude': '103.781234'},
        'category_ids': [str(CATEGORIES[1].id), str(CATEGORIES[0].id), str(CATEGORIES[1].id)],
        'description': ' Near entrance ', 'building': ' S16 ', 'floor': ' 1 ',
        'image_key': ' supplier/cafe.png ', 'opening_time': '22:30', 'closing_time': '02:15',
    }


@pytest.fixture
def create_client(app, monkeypatch, supplier):
    reply = Mock(return_value=httpx.Response(200, json=PROFILE))
    requests = []

    def handle(request):
        requests.append(request)
        assert str(request.url) == 'http://localhost:8000/users/me'
        assert request.headers['Authorization'] == AUTH['Authorization']
        return reply(request)

    monkeypatch.setattr('app.main.UserServiceClient', lambda settings: UserServiceClient(
        settings, transport=httpx.MockTransport(handle),
    ))
    engine = Mock()
    engine.connect.side_effect = AssertionError('API tests must not connect to a database')
    engine.raw_connection.side_effect = AssertionError('API tests must not connect to a database')
    monkeypatch.setattr('app.main.create_db_engine', lambda settings: engine)
    opened = []

    @contextmanager
    def open_session():
        with Session() as session:
            monkeypatch.setattr(session, 'close', Mock(wraps=session.close))
            opened.append(session)
            yield session

    factory = Mock(side_effect=open_session)
    monkeypatch.setattr('app.main.create_session_factory', lambda engine: factory)
    create = Mock(return_value=supplier)
    monkeypatch.setattr(suppliers, 'create_supplier', create)
    assert app.dependency_overrides == {}
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, create=create, reply=reply, requests=requests,
                              sessions=opened, factory=factory, engine=engine)
    for session in opened:
        session.close.assert_called_once_with()
        assert not session.in_transaction()
    engine.connect.assert_not_called()
    engine.raw_connection.assert_not_called()
    engine.dispose.assert_called_once_with()


@pytest.mark.parametrize('nullable', [False, True])
def test_verified_admin_receives_complete_201(create_client, payload, supplier, nullable):
    if nullable:
        supplier = replace(supplier, **dict.fromkeys((
            'description', 'building', 'floor', 'image_key', 'opening_time',
            'closing_time', 'closing_day_offset',
        )))
        create_client.create.return_value = supplier
    original = deepcopy(payload)
    response = create_client.client.post('/suppliers', headers=AUTH, json=payload)
    assert response.status_code == 201
    assert response.json() == SupplierResponse.from_read(supplier).model_dump(mode='json')
    assert set(response.json()) == {
        'id', 'name', 'area', 'description', 'building', 'floor', 'image_key',
        'opening_time', 'closing_time', 'closing_day_offset', 'created_at', 'updated_at',
        'deleted_at', 'version', 'location', 'categories',
    }
    assert response.json()['version'] == 1 and response.json()['deleted_at'] is None
    assert response.json()['categories'] == [
        {'id': str(category.id), 'name': category.name} for category in CATEGORIES
    ]
    assert response.json()['created_at'] == response.json()['updated_at'] == '2026-10-01T02:03:04.123456Z'
    assert response.json()['location'] == {'latitude': 1.291876, 'longitude': 103.781234}
    if nullable:
        assert all(response.json()[field] is None for field in (
            'description', 'building', 'floor', 'image_key', 'opening_time',
            'closing_time', 'closing_day_offset',
        ))
    assert payload == original
    create_client.create.assert_called_once_with(create_client.sessions[0], original)
    assert type(create_client.create.call_args.args[1]) is dict
    assert len(create_client.requests) == 1
    create_client.sessions[0].close.assert_called_once_with()


@pytest.mark.parametrize('authorization', [None, '', 'Basic abc', 'Bearer', 'Bearer two tokens'])
def test_missing_or_malformed_authentication_never_opens_session(create_client, payload, authorization):
    headers = {} if authorization is None else {'Authorization': authorization}
    response = create_client.client.post('/suppliers', headers=headers, json=payload)
    assert response.status_code == 401
    assert response.json()['error']['code'] == 'AUTHENTICATION_REQUIRED'
    assert response.headers['WWW-Authenticate'] == 'Bearer'
    create_client.reply.assert_not_called()
    create_client.create.assert_not_called()
    create_client.factory.assert_not_called()


@pytest.mark.parametrize('failure,status,code', [
    ('revoked', 401, 'AUTHENTICATION_REQUIRED'), ('user', 403, 'FORBIDDEN'),
    ('outage', 503, 'AUTHENTICATION_UNAVAILABLE'), ('timeout', 503, 'AUTHENTICATION_UNAVAILABLE'),
    ('untrusted_role', 503, 'AUTHENTICATION_UNAVAILABLE'),
])
def test_controlled_upstream_rejections_block_creation(create_client, payload, failure, status, code):
    if failure == 'timeout':
        create_client.reply.side_effect = httpx.ReadTimeout(SECRET)
    else:
        replies = {
            'revoked': httpx.Response(401, text=SECRET),
            'user': httpx.Response(200, json={**PROFILE, 'role': 'user'}),
            'outage': httpx.Response(503, text=SECRET),
            'untrusted_role': httpx.Response(200, json={**PROFILE, 'role': SECRET}),
        }
        create_client.reply.return_value = replies[failure]
    # Client-selected role hints cannot confer permission.
    response = create_client.client.post('/suppliers?role=admin',
        headers={**AUTH, 'X-Role': 'admin'}, json={**payload, 'role': 'admin'})
    assert response.status_code == status
    assert response.json()['error']['code'] == code
    assert SECRET not in response.text
    assert response.headers.get('WWW-Authenticate') == ('Bearer' if status == 401 else None)
    assert len(create_client.requests) == 1
    create_client.create.assert_not_called()
    create_client.factory.assert_not_called()


@pytest.mark.parametrize('error,status,code,message', [
    (suppliers.SupplierDuplicate(), 409, 'SUPPLIER_DUPLICATE',
     'An active supplier with this name and location already exists.'),
    (suppliers.SupplierCreateUnavailable(), 503, 'DATABASE_UNAVAILABLE',
     'Supplier creation is temporarily unavailable.'),
])
def test_safe_service_errors_ignore_private_exception_details(create_client, payload, error, status, code, message):
    error.args = (SECRET,)
    create_client.create.side_effect = error
    response = create_client.client.post('/suppliers', headers=AUTH, json=payload)
    assert response.status_code == status
    assert response.json() == {'error': {'code': code, 'message': message}}
    assert SECRET not in response.text
    create_client.create.assert_called_once()
    create_client.sessions[0].close.assert_called_once_with()


@pytest.mark.parametrize('error', [RuntimeError('defect'), IntegrityError('SQL', {}, Exception('unrelated'))])
def test_unexpected_errors_are_not_misclassified(create_client, payload, error):
    create_client.create.side_effect = error
    with pytest.raises(type(error)) as caught:
        create_client.client.post('/suppliers', headers=AUTH, json=payload)
    assert caught.value is error
    create_client.sessions[0].close.assert_called_once_with()


@pytest.fixture
def aggregate_client(create_client, monkeypatch):
    # Execute the real creation service and validator. Only category storage is
    # controlled; every payload below must fail before either insert helper runs.
    create_client.create.side_effect = CREATE
    categories = Mock(return_value=CATEGORIES)
    inserts = Mock(side_effect=AssertionError('Invalid payload must not insert'))
    monkeypatch.setattr(suppliers, 'read_categories', categories)
    monkeypatch.setattr(suppliers, 'insert_supplier', inserts)
    monkeypatch.setattr(suppliers, 'insert_category_assignments', inserts)
    yield create_client
    inserts.assert_not_called()


def issues(response):
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {'error'}
    assert set(body['error']) == {'code', 'message', 'details'}
    assert body['error']['code'] == 'VALIDATION_ERROR'
    assert body['error']['message'] == 'Some fields are invalid.'
    assert SECRET not in response.text
    for issue in body['error']['details']:
        assert set(issue) == {'fields', 'code', 'message'}
    return {(tuple(issue['fields']), issue['code']) for issue in body['error']['details']}


@pytest.mark.parametrize('body', ['{', '{"name":', '{"private":"' + SECRET + '",}'])
def test_malformed_json_uses_global_handler(create_client, body):
    response = create_client.client.post('/suppliers', headers={**AUTH, 'Content-Type': 'application/json'}, content=body)
    assert issues(response) == {((), 'INVALID_JSON')}
    create_client.create.assert_not_called()
    create_client.factory.assert_not_called()


@pytest.mark.parametrize('body', [[], ['supplier'], 'supplier', 42, True])
def test_non_object_json_reaches_service_unchanged(aggregate_client, body):
    response = aggregate_client.client.post('/suppliers', headers=AUTH, json=body)
    assert issues(response) == {((), 'INVALID_INPUT')}
    aggregate_client.create.assert_called_once_with(aggregate_client.sessions[0], body)


@pytest.mark.parametrize('content', ['', 'null'])
def test_missing_and_null_body_use_global_validation(create_client, content):
    response = create_client.client.post('/suppliers', headers={**AUTH, 'Content-Type': 'application/json'}, content=content)
    assert issues(response) == {((), 'REQUIRED_FIELD')}
    create_client.create.assert_not_called()


@pytest.mark.parametrize('field', ['id', 'created_at', 'updated_at', 'deleted_at', 'version', 'closing_day_offset'])
def test_server_managed_fields_are_forbidden(aggregate_client, payload, field):
    payload[field] = None
    response = aggregate_client.client.post('/suppliers', headers=AUTH, json=payload)
    assert issues(response) == {((field,), 'FORBIDDEN_FIELD')}
    aggregate_client.create.assert_called_once()


@pytest.mark.parametrize('changes,expected', [
    ({'location': {'latitude': 91, 'longitude': SECRET}}, {
        (('location.latitude',), 'COORDINATE_OUT_OF_RANGE'),
        (('location.longitude',), 'INVALID_COORDINATE'),
    }),
    ({'category_ids': []}, {(('category_ids',), 'EMPTY_CATEGORIES')}),
    ({'category_ids': [str(CATEGORIES[0].id), str(UUID(int=999))]}, {
        (('category_ids.1',), 'UNKNOWN_CATEGORY'),
    }),
    ({'closing_time': None}, {(('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE')}),
    ({'closing_time': SECRET}, {(('closing_time',), 'INVALID_TIME')}),
    ({'closing_time': '02:15:00+08:00'}, {(('closing_time',), 'TIMEZONE_NOT_ALLOWED')}),
])
def test_invalid_domain_values_use_aggregate_validation(aggregate_client, payload, changes, expected):
    payload.update(changes)
    response = aggregate_client.client.post('/suppliers', headers=AUTH, json=payload)
    assert issues(response) == expected
    aggregate_client.create.assert_called_once_with(aggregate_client.sessions[0], payload)


def test_missing_categories_reaches_service(aggregate_client, payload):
    del payload['category_ids']
    response = aggregate_client.client.post('/suppliers', headers=AUTH, json=payload)
    assert issues(response) == {(('category_ids',), 'REQUIRED_FIELD')}
    aggregate_client.create.assert_called_once_with(aggregate_client.sessions[0], payload)


def test_independent_field_category_and_schedule_issues_are_combined(aggregate_client, payload):
    known, unknown = str(CATEGORIES[0].id), str(UUID(int=999))
    payload.update(name=' ', area='Unknown', location={'latitude': 91, 'longitude': SECRET},
        category_ids=[known, known, unknown, unknown, SECRET], closing_time=None, version=7)
    response = aggregate_client.client.post('/suppliers', headers=AUTH, json=payload)
    expected = {
        (('name',), 'BLANK_TEXT'), (('area',), 'UNKNOWN_AREA'),
        (('location.latitude',), 'COORDINATE_OUT_OF_RANGE'),
        (('location.longitude',), 'INVALID_COORDINATE'),
        (('category_ids.2',), 'UNKNOWN_CATEGORY'), (('category_ids.3',), 'UNKNOWN_CATEGORY'),
        (('category_ids.4',), 'INVALID_UUID'), (('version',), 'FORBIDDEN_FIELD'),
        (('opening_time', 'closing_time'), 'INCOMPLETE_SCHEDULE'),
    }
    assert issues(response) == expected
    assert len(response.json()['error']['details']) == len(expected)
    aggregate_client.create.assert_called_once_with(aggregate_client.sessions[0], payload)


def test_post_openapi_requires_bearer_and_declares_canonical_201(create_client):
    schema = create_client.client.get('/openapi.json').json()
    operation = schema['paths']['/suppliers']['post']
    assert operation['security'] == [{'HTTPBearer': []}]
    assert schema['components']['securitySchemes']['HTTPBearer'] == {'type': 'http', 'scheme': 'bearer'}
    assert operation['responses']['201']['content']['application/json']['schema'] == {
        '$ref': '#/components/schemas/SupplierResponse',
    }
    assert '200' not in operation['responses']
    body = operation['requestBody']['content']['application/json']['schema']
    assert '$ref' not in body and 'properties' not in body
    for path in ('/suppliers', '/suppliers/{id}', '/categories', '/areas'):
        assert 'security' not in schema['paths'][path]['get']
    create_client.factory.assert_not_called()
    create_client.reply.assert_not_called()


def test_public_reads_stay_anonymous_during_auth_outage(create_client, monkeypatch, supplier):
    create_client.reply.side_effect = httpx.ConnectError(SECRET)
    monkeypatch.setattr(suppliers, 'list_suppliers', Mock(return_value=SupplierPage((supplier,), 1, 20, 0)))
    monkeypatch.setattr(suppliers, 'get_supplier', Mock(return_value=supplier))
    monkeypatch.setattr(suppliers, 'list_categories', Mock(return_value=CATEGORIES))
    for path in ('/suppliers', f'/suppliers/{supplier.id}', '/categories', '/areas'):
        assert create_client.client.get(path).status_code == 200
    create_client.reply.assert_not_called()
    create_client.create.assert_not_called()
    assert len(create_client.sessions) == 3

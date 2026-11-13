"""Integration tests for the administrator account listing and lookup."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User
from app.schemas import UserCreate
from app.services.users import register_user


@pytest.fixture
def database():
    """Provide an isolated in-memory database."""

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        db.add(AdminStateLock(lock_name=ADMIN_STATE_LOCK_NAME))
        db.commit()
        yield db
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(database):
    """Use the isolated database for HTTP requests."""

    def override_database():
        yield database

    app.dependency_overrides[get_db] = override_database
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def create_user(database, number: str, name: str, **fields) -> User:
    """Create an account with a unique student number and email."""

    user = register_user(
        UserCreate(
            nus_student_number=number,
            email=f"{number.lower()}@example.com",
            display_name=name,
            password="Password1!",
        ),
        database,
    )
    for key, value in fields.items():
        setattr(user, key, value)
    database.commit()
    return user


def auth_header(client, number: str) -> dict[str, str]:
    """Log in and return the bearer header."""

    response = client.post(
        "/login", json={"nus_student_number": number, "password": "Password1!"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def accounts(database):
    """An administrator plus regular accounts in each status."""

    return {
        "admin": create_user(database, "A0000001X", "Platform Admin", role="admin"),
        "alice": create_user(database, "A0000002X", "Alice Tan"),
        "bob": create_user(database, "A0000003X", "Bob Lim", status="suspended"),
        "carol": create_user(database, "A0000004X", "Carol Ng", status="deactivated"),
    }


def test_admin_lists_accounts_in_every_status(client, accounts):
    response = client.get("/admin/users", headers=auth_header(client, "A0000001X"))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert body["limit"] == 20 and body["offset"] == 0
    assert {item["status"] for item in body["items"]} == {
        "active",
        "suspended",
        "deactivated",
    }
    assert "password_hash" not in body["items"][0]


def test_admin_filters_accounts_by_status(client, accounts):
    response = client.get(
        "/admin/users",
        params={"status": "suspended"},
        headers=auth_header(client, "A0000001X"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(accounts["bob"].id)


@pytest.mark.parametrize(
    "query, expected",
    [
        ("alice", "alice"),
        ("A0000003", "bob"),
        ("a0000004x@EXAMPLE", "carol"),
    ],
)
def test_admin_searches_name_student_number_and_email(
    client, accounts, query, expected
):
    response = client.get(
        "/admin/users", params={"q": query}, headers=auth_header(client, "A0000001X")
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [
        str(accounts[expected].id)
    ]


@pytest.mark.parametrize("wildcard", ["%", "_"])
def test_search_treats_like_wildcards_literally(client, accounts, wildcard):
    response = client.get(
        "/admin/users",
        params={"q": wildcard},
        headers=auth_header(client, "A0000001X"),
    )

    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_admin_list_pages_results(client, accounts):
    headers = auth_header(client, "A0000001X")
    first = client.get("/admin/users", params={"limit": 3}, headers=headers).json()
    rest = client.get(
        "/admin/users", params={"limit": 3, "offset": 3}, headers=headers
    ).json()

    assert first["total"] == rest["total"] == 4
    assert len(first["items"]) == 3 and len(rest["items"]) == 1
    ids = [item["id"] for item in first["items"] + rest["items"]]
    assert len(set(ids)) == 4


@pytest.mark.parametrize(
    "params",
    [{"status": "deleted"}, {"limit": 0}, {"limit": 101}, {"offset": -1}],
)
def test_admin_list_rejects_invalid_parameters(client, accounts, params):
    response = client.get(
        "/admin/users", params=params, headers=auth_header(client, "A0000001X")
    )

    assert response.status_code == 422


def test_regular_user_cannot_list_accounts(client, accounts):
    response = client.get("/admin/users", headers=auth_header(client, "A0000002X"))

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin privileges required"}


def test_admin_list_requires_authentication(client, accounts):
    assert client.get("/admin/users").status_code == 401


def test_admin_reads_a_suspended_account(client, accounts):
    bob = accounts["bob"]
    response = client.get(
        f"/admin/users/{bob.id}", headers=auth_header(client, "A0000001X")
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(bob.id)
    assert body["status"] == "suspended"
    assert body["email"] == "a0000003x@example.com"


def test_admin_read_of_unknown_account_is_404(client, accounts):
    response = client.get(
        f"/admin/users/{uuid4()}", headers=auth_header(client, "A0000001X")
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "User not found"}


def test_regular_user_cannot_read_another_account(client, accounts):
    response = client.get(
        f"/admin/users/{accounts['bob'].id}", headers=auth_header(client, "A0000002X")
    )

    assert response.status_code == 403


def test_admin_rights_are_rechecked_on_each_read(client, database, accounts):
    headers = auth_header(client, "A0000001X")
    accounts["admin"].role = "user"
    database.commit()

    assert client.get("/admin/users", headers=headers).status_code == 403
    assert (
        client.get(f"/admin/users/{accounts['bob'].id}", headers=headers).status_code
        == 403
    )

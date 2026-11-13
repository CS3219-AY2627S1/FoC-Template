"""Tests for user registration and login behavior."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from argon2 import PasswordHasher
from pydantic import ValidationError

from app.models import User
from app.schemas import UserCreate, UserLogin
from app.services.users import hash_password, login_user, reactivate_user, register_user


class FakeSession:
    """Minimal session double for testing registration without a database."""

    def __init__(self, existing=None, lookup_error=None, commit_error=None):
        self.existing = existing
        self.lookup_error = lookup_error
        self.commit_error = commit_error
        self.user = None
        self.rollback_called = False

    def scalar(self, _query):
        """Return the configured result for the duplicate lookup."""

        if self.lookup_error:
            raise self.lookup_error
        return self.existing

    def add(self, value):
        """Capture the account passed for persistence."""

        if isinstance(value, User):
            self.user = value

    def commit(self):
        """Simulate a successful commit or raise the configured database error."""

        if self.commit_error:
            raise self.commit_error

    def refresh(self, _user):
        """Simulate refreshing the persisted user, including ORM defaults."""

        self.user.role = self.user.role or "user"
        self.user.status = self.user.status or "active"

    def rollback(self):
        """Record that the failed transaction was rolled back."""

        self.rollback_called = True


class FakeLoginSession:
    """Minimal session double for testing authentication without a database."""

    def __init__(self, existing=None, lookup_error=None, commit_error=None):
        self.existing = existing
        self.lookup_error = lookup_error
        self.commit_error = commit_error
        self.session = None
        self.rollback_called = False

    def execute(self, _statement):
        """Simulate a successful session cleanup query."""

        return type("FakeResult", (), {"rowcount": 0})()

    def scalar(self, _query):
        """Return the configured user lookup result."""

        if self.lookup_error:
            raise self.lookup_error
        return self.existing

    def add(self, session):
        """Capture the session passed for persistence."""

        self.session = session

    def commit(self):
        """Simulate a successful commit or raise the configured error."""

        if self.commit_error:
            raise self.commit_error

    def rollback(self):
        """Record that the failed transaction was rolled back."""

        self.rollback_called = True


def make_payload(**overrides):
    """Build a valid registration payload, allowing individual fields to vary."""

    values = {
        "nus_student_number": "A0123456X",
        "email": "student@example.com",
        "display_name": "Student",
        "password": "Password1!",
    }
    values.update(overrides)
    return UserCreate(**values)


def make_user(password="Password1!", status="active"):
    """Build a persisted-looking user for authentication tests."""

    now = datetime.now(timezone.utc)
    return User(
        id=uuid4(),
        nus_student_number="A0123456X",
        email="student@example.com",
        display_name="Student",
        password_hash=hash_password(password),
        role="user",
        status=status,
        created_at=now,
        updated_at=now,
    )


def test_register_user_hashes_password_before_persistence():
    """Registration stores an Argon2id hash instead of the plaintext password."""

    password = "Password1!"
    db = FakeSession()
    payload = make_payload(password=password)

    register_user(payload, db)

    assert db.user.password_hash != password
    assert db.user.password_hash.startswith("$argon2id$")
    assert PasswordHasher().verify(db.user.password_hash, password)


def test_login_user_verifies_password_and_persists_hashed_session_token():
    """Successful login returns a token while storing only its hash."""

    db = FakeLoginSession(existing=make_user())

    result = login_user(
        UserLogin(nus_student_number="a0123456x", password="Password1!"),
        db,
    )

    assert result.token_type == "bearer"
    assert result.expires_in == 30 * 60
    assert result.user.email == "student@example.com"
    assert len(result.access_token) > 20
    assert db.session.token_hash != result.access_token
    assert db.session.user_id == result.user.id
    assert db.session.token_hash
    assert db.session.expires_at > db.session.last_activity_at
    assert db.session.absolute_expires_at > db.session.expires_at


def test_registration_and_login_audit_events_contain_no_credentials(caplog):
    """Authentication audit fields contain only safe identifiers and reasons."""

    with caplog.at_level(logging.INFO, logger="app.services.users"):
        registered = register_user(make_payload(), FakeSession())
        registered.created_at = datetime.now(timezone.utc)
        registered.updated_at = registered.created_at
        login_user(
            UserLogin(nus_student_number="A0123456X", password="Password1!"),
            FakeLoginSession(existing=registered),
        )
        with pytest.raises(HTTPException):
            login_user(
                UserLogin(nus_student_number="A0123456X", password="WrongPassword1!"),
                FakeLoginSession(existing=registered),
            )

    records = {
        record.event: record
        for record in caplog.records
        if getattr(record, "event", None)
        in {"user_registered", "login_succeeded", "login_failed"}
    }
    assert records["user_registered"].fields == {"user_id": str(registered.id)}
    assert records["login_succeeded"].fields == {"user_id": str(registered.id)}
    assert records["login_failed"].fields == {"reason": "invalid_credentials"}
    assert "A0123456X" not in caplog.text
    assert "Password1!" not in caplog.text
    assert "WrongPassword1!" not in caplog.text


@pytest.mark.parametrize("status", ["deactivated", "suspended"])
def test_login_user_rejects_non_active_accounts_without_creating_session(status):
    """Deactivated and suspended accounts receive the generic auth error."""

    db = FakeLoginSession(existing=make_user(status=status))

    with pytest.raises(HTTPException) as error:
        login_user(
            UserLogin(nus_student_number="A0123456X", password="Password1!"),
            db,
        )

    assert error.value.status_code == 401
    assert error.value.detail == "Invalid credentials"
    assert db.session is None


def test_login_user_rejects_unknown_or_incorrect_credentials_generically():
    """Unknown users and wrong passwords do not disclose account existence."""

    for user in (None, make_user()):
        db = FakeLoginSession(existing=user)

        with pytest.raises(HTTPException) as error:
            login_user(
                UserLogin(nus_student_number="A0123456X", password="wrong"),
                db,
            )

        assert error.value.status_code == 401
        assert error.value.detail == "Invalid credentials"
        assert db.session is None


def test_login_user_maps_lookup_database_errors():
    """A failed credential lookup returns a service-unavailable response."""

    db = FakeLoginSession(lookup_error=SQLAlchemyError("SELECT failed"))

    with pytest.raises(HTTPException) as error:
        login_user(
            UserLogin(nus_student_number="A0123456X", password="Password1!"),
            db,
        )

    assert db.rollback_called
    assert error.value.status_code == 503
    assert error.value.detail == "Database temporarily unavailable"


def test_login_user_maps_generic_database_commit_errors():
    """A failed session write returns a service-unavailable response."""

    db = FakeLoginSession(
        existing=make_user(),
        commit_error=SQLAlchemyError("INSERT failed"),
    )

    with pytest.raises(HTTPException) as error:
        login_user(
            UserLogin(nus_student_number="A0123456X", password="Password1!"),
            db,
        )

    assert db.rollback_called
    assert error.value.status_code == 503
    assert error.value.detail == "Database temporarily unavailable"


def test_reactivate_user_maps_lookup_database_errors():
    """A failed reactivation lookup returns a service-unavailable response."""

    db = FakeLoginSession(lookup_error=SQLAlchemyError("SELECT failed"))

    with pytest.raises(HTTPException) as error:
        reactivate_user(
            UserLogin(nus_student_number="A0123456X", password="Password1!"),
            db,
        )

    assert db.rollback_called
    assert error.value.status_code == 503
    assert error.value.detail == "Database temporarily unavailable"


def test_register_user_normalizes_fields_and_applies_defaults():
    """Registration stores normalized identity fields and safe account defaults."""

    db = FakeSession()
    payload = make_payload(
        email="STUDENT@EXAMPLE.COM",
        display_name="  Student  ",
        nus_student_number="  A0123456X  ",
    )

    user = register_user(payload, db)

    assert user is db.user
    assert user.email == "student@example.com"
    assert user.nus_student_number == "A0123456X"
    assert user.display_name == "Student"
    assert user.role == "user"
    assert user.status == "active"


@pytest.mark.parametrize(
    "student_number",
    [
        "123456789",
        "A12345678",
        "A1234567",
        "A1234567!",
        "B1234567X",
        "A１２３４５６７X",
        "!!!!!!!!!",
    ],
)
def test_user_create_rejects_invalid_student_number_formats(student_number):
    """Registration accepts only the expected NUS student number shape."""

    with pytest.raises(ValidationError):
        make_payload(nus_student_number=student_number)


def test_user_create_normalizes_student_number_case():
    """Student numbers are stored in uppercase for consistent identity matching."""

    payload = make_payload(nus_student_number="a0123456x")

    assert payload.nus_student_number == "A0123456X"


@pytest.mark.parametrize(
    "password",
    ["password", "Password1", "Password!", "12345678!", "Password١!"],
)
def test_user_create_rejects_passwords_that_do_not_meet_policy(password):
    """Passwords must contain letters, numbers, and special characters."""

    with pytest.raises(ValidationError, match="password must contain"):
        make_payload(password=password)


def test_user_login_rejects_non_ascii_student_number_digits():
    """Login accepts only ASCII digits in student numbers."""

    with pytest.raises(ValidationError):
        UserLogin(nus_student_number="A１２３４５６７X", password="Password1!")


@pytest.mark.parametrize("email", ["not-an-email", "student@", "@example.com"])
def test_user_create_rejects_malformed_email_addresses(email):
    """Registration rejects malformed email addresses."""

    with pytest.raises(ValidationError):
        make_payload(email=email)


@pytest.mark.parametrize(
    "display_name",
    ["Student!", "Alice@NUS", "Alice\\NUS", "Student123", "Student\nName"],
)
def test_user_create_rejects_display_names_with_unsupported_characters(display_name):
    """Registration rejects display names outside the supported English format."""

    with pytest.raises(ValidationError, match="display_name contains unsupported"):
        make_payload(display_name=display_name)


@pytest.mark.parametrize("field", ["nus_student_number", "display_name"])
@pytest.mark.parametrize("value", [None, 123, [], {}])
def test_user_create_rejects_non_string_text_fields(field, value):
    """Non-string text fields return validation errors instead of server errors."""

    with pytest.raises(ValidationError, match="must be a string"):
        make_payload(**{field: value})


def test_user_create_rejects_unknown_fields():
    """Registration rejects fields that are not part of its public contract."""

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        make_payload(role="admin", status="active")


def test_register_user_trims_trailing_whitespace_from_identity_fields():
    """Registration does not persist trailing whitespace in identity fields."""

    db = FakeSession()
    payload = make_payload(
        nus_student_number="A0123456X   ",
        email="student@example.com   ",
        display_name="Student   ",
    )

    register_user(payload, db)

    assert db.user.nus_student_number == "A0123456X"
    assert db.user.email == "student@example.com"
    assert db.user.display_name == "Student"


def test_register_user_rejects_an_existing_user_before_writing():
    """A duplicate identity returns 409 without adding another user."""

    db = FakeSession(existing=object())

    with pytest.raises(HTTPException) as error:
        register_user(make_payload(), db)

    assert error.value.status_code == 409
    assert error.value.detail == "Unable to create account"
    assert db.user is None


def test_register_user_maps_lookup_database_errors():
    """A failed duplicate lookup returns a service-unavailable response."""

    db = FakeSession(
        lookup_error=SQLAlchemyError("SELECT failed")
    )

    with pytest.raises(HTTPException) as error:
        register_user(make_payload(), db)

    assert db.rollback_called
    assert error.value.status_code == 503
    assert error.value.detail == "Database temporarily unavailable"


def test_user_model_protects_required_fields_and_account_defaults():
    """The database schema protects required registration data and account state."""

    columns = User.__table__.c

    for name in (
        "id",
        "nus_student_number",
        "email",
        "display_name",
        "password_hash",
        "role",
        "status",
        "created_at",
        "updated_at",
    ):
        assert columns[name].nullable is False

    assert str(columns.role.server_default.arg) == "user"
    assert str(columns.status.server_default.arg) == "active"
    constraint_names = {constraint.name for constraint in User.__table__.constraints}
    assert "ck_users_nus_student_number_length" in constraint_names
    assert "ck_users_role" in constraint_names
    assert "ck_users_status" in constraint_names


@pytest.mark.parametrize(
    ("database_error", "status_code", "detail"),
    [
        (
            IntegrityError("INSERT", {}, Exception("duplicate")),
            409,
            "Unable to create account",
        ),
        (
            SQLAlchemyError("INSERT failed"),
            503,
            "Database temporarily unavailable",
        ),
    ],
)
def test_register_user_rolls_back_and_maps_database_errors(
    database_error, status_code, detail
):
    """Database failures roll back the transaction and expose safe API errors."""

    db = FakeSession(commit_error=database_error)

    with pytest.raises(HTTPException) as error:
        register_user(make_payload(), db)

    assert db.rollback_called
    assert error.value.status_code == status_code
    assert error.value.detail == detail

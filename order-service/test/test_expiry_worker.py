# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import expiry_worker
from main.database import Base
from main.models import Errand, ErrandStatus
from test.test_accept_errand import seed
from test.outbox_support import outbox_events


@pytest.fixture
def database(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(expiry_worker, "SessionLocal", factory)
    try:
        yield factory
    finally:
        engine.dispose()


def test_open_errand_becomes_expired_and_emits_event(database):
    target = seed(
        database,
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )

    assert expiry_worker.expire_overdue_errands() == 1

    with database() as db:
        errand = db.get(Errand, target["id"])
        assert errand.status == ErrandStatus.EXPIRED
        assert errand.failure_reason is None

    events = outbox_events(database)
    assert len(events) == 1
    assert events[0].type == "errand.expired"
    assert events[0].payload["resultingStatus"] == "EXPIRED"


def test_accepted_errand_becomes_failed_and_emits_reason(database):
    target = seed(
        database,
        status=ErrandStatus.ACCEPTED,
        courier_id=uuid4(),
        accepted_at=datetime.now(timezone.utc) - timedelta(hours=1),
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )

    assert expiry_worker.expire_overdue_errands() == 1

    with database() as db:
        errand = db.get(Errand, target["id"])
        assert errand.status == ErrandStatus.FAILED
        assert errand.failed_at is not None
        assert errand.failure_reason == expiry_worker.ACCEPTED_EXPIRY_REASON

    events = outbox_events(database)
    assert events[0].payload["resultingStatus"] == "FAILED"
    assert events[0].payload["failureReason"] == expiry_worker.ACCEPTED_EXPIRY_REASON


def test_repeated_runs_do_not_emit_duplicate_events(database):
    seed(
        database,
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )

    assert expiry_worker.expire_overdue_errands() == 1
    assert expiry_worker.expire_overdue_errands() == 0
    assert len(outbox_events(database)) == 1



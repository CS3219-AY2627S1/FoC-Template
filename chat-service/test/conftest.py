# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Generated and refined Chat Service test support.

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main.database import Base
from main.models import Conversation


@pytest.fixture
def factory():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        yield session_factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def active_conversation(factory):
    requester_id = uuid4()
    courier_id = uuid4()
    conversation = Conversation(
        id=uuid4(),
        errand_id=uuid4(),
        requester_id=requester_id,
        courier_id=courier_id,
        delivery_status="ACCEPTED",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        accepted_at=datetime.now(timezone.utc),
        next_sequence=1,
    )
    with factory.begin() as db:
        db.add(conversation)
    return conversation, requester_id, courier_id


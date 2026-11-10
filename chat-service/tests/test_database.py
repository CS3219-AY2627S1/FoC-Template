# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Added tests for database readiness, transactional behavior, and runtime grants.
# Author review: I validated correctness and added boundary checks where needed.

from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.integration


async def test_runtime_restrictions_and_pair_constraint(database):
    async with database.transaction() as session:
        assert not (
            await session.execute(
                text("SELECT has_schema_privilege(current_user,'chat_service','CREATE')")
            )
        ).scalar_one()
        assert not (
            await session.execute(
                text("SELECT has_table_privilege(current_user,'chat_service.messages','UPDATE')")
            )
        ).scalar_one()
        assert not (
            await session.execute(
                text(
                    "SELECT has_column_privilege(current_user,'chat_service.outbox_events',"
                    "'payload','UPDATE')"
                )
            )
        ).scalar_one()
        assert not (
            await session.execute(
                text("SELECT has_table_privilege(current_user,'chat_service.messages','DELETE')")
            )
        ).scalar_one()
    low, high = sorted((uuid4(), uuid4()))
    async with database.sessions() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await session.execute(
                    text(
                        "INSERT INTO chat_service.conversations (id,user_low,user_high) "
                        "VALUES (:cid,:low,:high)"
                    ),
                    {"cid": uuid4(), "low": low, "high": high},
                )

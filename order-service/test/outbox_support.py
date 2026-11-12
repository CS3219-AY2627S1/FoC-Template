# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

"""Reads the outbox rows Debezium would relay to Kafka."""

from sqlalchemy import select

from main.models import OutboxEvent


def outbox_events(factory):
    with factory() as db:
        return db.scalars(select(OutboxEvent)).all()


def assert_single_event(factory, event_type, errand_id):
    events = outbox_events(factory)
    assert [(e.aggregatetype, e.aggregateid, e.type) for e in events] == [
        ("errand", str(errand_id), event_type)
    ]
    return events[0].payload



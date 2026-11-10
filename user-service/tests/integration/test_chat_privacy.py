# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Added or extended tests for Chat lookup privacy.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import json
import logging
from io import StringIO
from uuid import uuid4

import pytest

from app.core.logging import JsonFormatter, RedactingFilter, logger

pytestmark = pytest.mark.integration


async def test_logs_contain_counts_timings_and_correlation_without_identity_payloads(
    chat_harness,
) -> None:
    h = chat_harness
    query = uuid4().hex[:12]
    caller_id = await h.seed_user("Caller-" + query)
    private_name = "PrivateName-" + query
    username = "PrivateUsername-" + query
    private_email = f"private-{query}@u.nus.edu"
    participant = await h.seed_user(username, display_name=private_name, email=private_email)
    headers = await h.login(caller_id)
    headers["X-Correlation-ID"] = "privacy-trace"
    log_output = StringIO()
    handler = logging.StreamHandler(log_output)
    handler.addFilter(RedactingFilter())
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    try:
        await exercise_interfaces(h, query, participant, headers)
    finally:
        logger.removeHandler(handler)
    output = log_output.getvalue()
    for sensitive in (
        query,
        username,
        private_name,
        private_email,
        str(participant),
        headers["Authorization"],
        headers["X-FoC-Service-Secret"],
        "private-field-name",
        "private-field-value",
    ):
        assert sensitive not in output
    records = [json.loads(line) for line in output.splitlines() if line.strip()]
    assert records and all(record["correlationId"] == "privacy-trace" for record in records)
    search_log = next(
        record for record in records if record.get("event") == "chat_username_search_completed"
    )
    assert search_log["context"]["resultCount"] == 1
    lookup_log = next(
        record for record in records if record.get("event") == "chat_participant_lookup_completed"
    )
    assert lookup_log["context"]["batchSize"] == 2
    assert lookup_log["context"]["missingCount"] == 1
    assert lookup_log["context"]["queryDurationMs"] >= 0


async def exercise_interfaces(h, query, participant, headers):
    search = await h.client.get(
        "/v1/internal/chat/users", headers=headers, params={"username": query}
    )
    assert search.status_code == 200
    lookup = await h.client.post(
        "/v1/internal/chat/participants",
        headers={
            "X-FoC-Service-Secret": headers["X-FoC-Service-Secret"],
            "X-Correlation-ID": "privacy-trace",
        },
        json={"userIds": [str(participant), str(uuid4())]},
    )
    assert lookup.status_code == 200
    bad = await h.client.get(
        "/v1/internal/chat/users",
        headers=headers,
        params={
            "username": query,
            "private-field-name": "private-field-value",
        },
    )
    assert bad.status_code == 422

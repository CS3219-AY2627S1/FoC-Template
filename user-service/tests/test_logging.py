# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added or extended tests for structured logging and secret redaction.
# Author review: I validated correctness and added boundary checks where needed.

import json
import logging

from app.core.correlation import current_correlation_id
from app.core.logging import JsonFormatter, RedactingFilter, redact_context


def test_structured_log_context_redacts_nested_secrets() -> None:
    context = {
        "request": {
            "password": "not-for-logs",
            "safeField": "safe",
        },
        "refreshToken": "not-for-logs",
    }
    assert redact_context(context) == {
        "request": {
            "password": "[REDACTED]",
            "safeField": "safe",
        },
        "refreshToken": "[REDACTED]",
    }


def test_structured_log_context_redacts_camel_case_sensitive_keys() -> None:
    context = {
        "databaseUrl": "postgresql://not-for-logs",
        "privateKey": "not-for-logs",
        "nested": {"refresh_token": "not-for-logs"},
    }

    assert redact_context(context) == {
        "databaseUrl": "[REDACTED]",
        "privateKey": "[REDACTED]",
        "nested": {"refresh_token": "[REDACTED]"},
    }


def test_structured_logs_include_request_correlation_id_without_secrets() -> None:
    record = logging.LogRecord(
        "user_service",
        logging.INFO,
        __file__,
        0,
        "registration request received",
        (),
        None,
    )
    record.context = {"password": "not-for-logs"}
    token = current_correlation_id.set("request-99")
    try:
        RedactingFilter().filter(record)
        output = JsonFormatter().format(record)
    finally:
        current_correlation_id.reset(token)

    assert json.loads(output)["correlationId"] == "request-99"
    assert "not-for-logs" not in output


def test_formatter_never_interpolates_or_preserves_labelled_secret_messages() -> None:
    secret = "not-for-logs"
    record = logging.LogRecord(
        "user_service",
        logging.INFO,
        __file__,
        0,
        "password=%s privateKey=also-not-for-logs",
        (secret,),
        None,
    )

    output = JsonFormatter().format(record)

    assert secret not in output
    assert "also-not-for-logs" not in output

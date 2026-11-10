# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented request correlation ID handling.
# Author review: I validated correctness and added boundary checks where needed.

from contextvars import ContextVar

correlation_id = ContextVar("chat_correlation_id", default="")

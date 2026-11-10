# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Test doubles shared by ASGI tests. They never call User, Supplier or OpenAI."""

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from app.voice_assist.errors import SupplierLookupError
from app.voice_assist.schemas import Principal, SupplierDetail

NOW = datetime(2026, 10, 30, 5, 20, tzinfo=UTC)  # 13:20 SGT


class FakeIdentity:
    def __init__(self, error=None):
        self.error = error
        self.tokens = []
        self.user_id = uuid4()

    async def identity(self, token):
        self.tokens.append(token)
        if self.error is not None:
            raise self.error
        return Principal(user_id=self.user_id, system_role="USER", account_status="ACTIVE")


class FakeSuppliers:
    def __init__(self, suppliers, inactive=(), error=False):
        self.suppliers = suppliers
        self.inactive = set(inactive)
        self.error = error
        self.details = []
        self.listed = 0

    async def active(self, token):
        self.listed += 1
        if self.error:
            raise SupplierLookupError
        return self.suppliers

    async def detail(self, supplier_id, token):
        self.details.append(supplier_id)
        if self.error:
            raise SupplierLookupError
        supplier = next((s for s in self.suppliers if s.id == supplier_id), None)
        if supplier is None or supplier_id in self.inactive:
            return None
        return SupplierDetail(
            **supplier.model_dump(), pickup_location_description="Main counter", status="ACTIVE"
        )


class ScriptedTranscriber:
    def __init__(self, text="", error=None, delay=0.0):
        self.text, self.error, self.delay = text, error, delay
        self.calls = []

    async def transcribe(self, audio, content_type):
        self.calls.append((audio, content_type))
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error is not None:
            raise self.error
        return self.text


class ScriptedDrafter:
    def __init__(self, draft=None, error=None):
        self.draft_value, self.error = draft, error
        self.calls = []

    async def draft(self, transcript):
        self.calls.append(transcript)
        if self.error is not None:
            raise self.error
        return self.draft_value

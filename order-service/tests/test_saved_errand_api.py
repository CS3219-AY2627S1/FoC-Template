"""Saved-errand API contract, written before its implementation."""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_authenticated_user
from auth.models import UserRoleResponse
from common.db import get_session
from orders import views


class SavedErrandAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.user = UserRoleResponse(user_id=uuid4(), role="user")
        self.session = AsyncMock(spec=AsyncSession)
        self.supplier_id = uuid4()
        self.template_id = uuid4()
        self.payload = {
            "name": "Usual coffee run",
            "supplier_id": str(self.supplier_id),
            "items": [{"name": "Iced latte", "quantity": 1}],
            "delivery_location": "COM2, Level 2, lift lobby",
            "pickup_notes": "Less ice, please",
            "credits": 8,
        }
        self.template = SimpleNamespace(
            id=self.template_id,
            owner_id=self.user.user_id,
            name=self.payload["name"],
            supplier_id=self.supplier_id,
            items=self.payload["items"],
            delivery_location=self.payload["delivery_location"],
            pickup_notes=self.payload["pickup_notes"],
            credits=self.payload["credits"],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.create_saved_errand = self._patch_repository(
            "create_saved_errand", self.template,
        )
        self.list_saved_errands = self._patch_repository("list_saved_errands", [])
        self.get_saved_errand = self._patch_repository("get_saved_errand", self.template)
        self.update_saved_errand = self._patch_repository("update_saved_errand", None)
        self.delete_saved_errand = self._patch_repository("delete_saved_errand", False)
        self.app = FastAPI()
        self.app.include_router(views.router)
        self.app.dependency_overrides = {
            get_authenticated_user: lambda: self.user,
            get_session: lambda: self.session,
        }
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url="http://test",
        )
        self.addAsyncCleanup(self.client.aclose)

    def _patch_repository(self, name, return_value):
        mock = AsyncMock(return_value=return_value)
        patcher = patch.object(views, name, mock)
        patcher.start()
        self.addCleanup(patcher.stop)
        return mock

    async def test_create_template_returns_only_reusable_request_fields(self):
        response = await self.client.post("/orders/saved-errands", json=self.payload)

        self.assertEqual(response.status_code, 201)
        saved = response.json()
        self.assertEqual(saved["name"], self.payload["name"])
        self.assertEqual(saved["supplier_id"], str(self.supplier_id))
        self.assertEqual(saved["items"], self.payload["items"])
        self.assertEqual(saved["delivery_location"], self.payload["delivery_location"])
        self.assertEqual(saved["pickup_notes"], self.payload["pickup_notes"])
        self.assertEqual(saved["credits"], self.payload["credits"])
        for order_only_field in (
            "status", "courier_id", "expires_at", "credit_status", "credit_operation",
        ):
            self.assertNotIn(order_only_field, saved)
        self.create_saved_errand.assert_awaited_once()

    async def test_list_returns_only_the_authenticated_users_templates(self):
        response = await self.client.get("/orders/saved-errands")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        self.list_saved_errands.assert_awaited_once_with(self.session, self.user.user_id)

    async def test_update_requires_ownership(self):
        created = await self.client.post("/orders/saved-errands", json=self.payload)
        self.assertEqual(created.status_code, 201)
        other_user = UserRoleResponse(user_id=uuid4(), role="user")
        self.app.dependency_overrides[get_authenticated_user] = lambda: other_user

        response = await self.client.patch(
            f"/orders/saved-errands/{created.json()['id']}", json={"name": "Changed"},
        )

        self.assertEqual(response.status_code, 404)
        self.update_saved_errand.assert_awaited_once()
        self.assertEqual(self.update_saved_errand.await_args.args[2], other_user.user_id)

    async def test_delete_requires_ownership(self):
        created = await self.client.post("/orders/saved-errands", json=self.payload)
        self.assertEqual(created.status_code, 201)
        other_user = UserRoleResponse(user_id=uuid4(), role="user")
        self.app.dependency_overrides[get_authenticated_user] = lambda: other_user

        response = await self.client.delete(f"/orders/saved-errands/{created.json()['id']}")

        self.assertEqual(response.status_code, 404)
        self.delete_saved_errand.assert_awaited_once_with(
            self.session, self.template_id, other_user.user_id,
        )

    async def test_template_selection_returns_an_editable_order_draft(self):
        response = await self.client.get(f"/orders/saved-errands/{self.template_id}")

        self.assertEqual(response.status_code, 200)
        draft = response.json()
        self.assertEqual(set(draft), {
            "supplier_id", "items", "delivery_location", "pickup_notes", "credits",
        })
        self.get_saved_errand.assert_awaited_once_with(
            self.session, self.template_id, self.user.user_id,
        )

    async def test_patch_rejects_explicit_null_for_required_fields(self):
        for field in ("name", "supplier_id", "items", "delivery_location", "credits"):
            with self.subTest(field=field):
                response = await self.client.patch(
                    f"/orders/saved-errands/{self.template_id}", json={field: None},
                )
                self.assertEqual(response.status_code, 422)
        self.update_saved_errand.assert_not_awaited()

    async def test_patch_allows_omission_and_explicit_null_notes(self):
        self.update_saved_errand.return_value = self.template
        for changes in ({"name": "Renamed"}, {"pickup_notes": None}, {}):
            with self.subTest(changes=changes):
                response = await self.client.patch(
                    f"/orders/saved-errands/{self.template_id}", json=changes,
                )
                self.assertEqual(response.status_code, 200)
                payload = self.update_saved_errand.await_args.args[3]
                self.assertEqual(payload.model_dump(exclude_unset=True), changes)

"""Authorization for participant identity lookup."""

import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from auth.dependencies import get_admin_manager_user, get_admin_user
from auth.views import router


class ParticipantLookupTests(unittest.IsolatedAsyncioTestCase):
    async def test_admins_and_managers_can_lookup_but_users_cannot(self):
        for role in ("admin", "admin_manager"):
            user = SimpleNamespace(role=role)
            self.assertIs(await get_admin_user(user), user)
        with self.assertRaises(HTTPException) as rejected:
            await get_admin_user(SimpleNamespace(role="user"))
        self.assertEqual(rejected.exception.status_code, 403)

    async def test_lookup_does_not_grant_user_management(self):
        with self.assertRaises(HTTPException) as rejected:
            await get_admin_manager_user(SimpleNamespace(role="admin"))
        self.assertEqual(rejected.exception.status_code, 403)

    def test_endpoint_requires_admin_dependency(self):
        route = next(route for route in router.routes if route.path == "/authentication/users/lookup")
        self.assertEqual(route.methods, {"POST"})
        self.assertIn(get_admin_user, [dependency.call for dependency in route.dependant.dependencies])


if __name__ == "__main__":
    unittest.main()

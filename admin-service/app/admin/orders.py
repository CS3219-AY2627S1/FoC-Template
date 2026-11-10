# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Implemented the Order client for errand checks and participation; added the internal
# calls that hold and release disputed errands.
# Author review: I validated correctness and supplied additional boundary checks.

"""Order Service calls: errand checks (N2F3.2.2) and disputed errands (N2F3)."""

import asyncio
from uuid import UUID

import httpx

from app.admin.disputes import DisputeAlreadyOpen, ErrandChanged, OrderNotFound, ReportNotAllowed
from app.admin.errors import ApiError, unavailable
from app.core.config import Settings


class OrderDirectory:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def exists(self, order_id: UUID, token: str) -> bool:
        """Forward the administrator's own token; Order re-checks the role itself."""
        response = await self._send("GET", f"/v1/admin/orders/{order_id}", token)
        return response.status_code != 404

    async def participation(self, order_id: UUID, token: str, user_id: UUID):
        """The caller's role and the errand state from Order's participant view, or None.

        Order shows requester and courier identities only to the errand's participants.
        """
        response = await self._send("GET", f"/v1/orders/{order_id}", token)
        if response.status_code == 404:
            return None
        try:
            body = response.json()
            state = body["state"]
            requester, courier = body.get("requesterId"), body.get("courierId")
        except (ValueError, KeyError, TypeError, AttributeError):
            raise unavailable("ORDER_UNAVAILABLE") from None
        if requester == str(user_id):
            return "REQUESTER", state
        if courier == str(user_id):
            return "COURIER", state
        return None

    async def open_dispute(
        self, order_id: UUID, dispute_id: UUID, actor_type: str, token: str
    ) -> None:
        """Hold the errand in DISPUTED for this dispute. Repeating it is a safe replay."""
        await self._internal(
            order_id,
            "",
            {"disputeId": str(dispute_id), "actorType": actor_type},
            token,
            conflict=ReportNotAllowed,
        )

    async def restore(self, order_id: UUID, dispute_id: UUID, actor_type: str, token: str) -> None:
        """Return the errand to its earlier state (USER: withdrawn, ADMIN: rejected)."""
        await self._internal(
            order_id, f"/{dispute_id}/restore", {"actorType": actor_type}, token
        )

    async def accept(
        self, order_id: UUID, dispute_id: UUID, problem: str, details: str | None, token: str
    ) -> None:
        """Fail the errand with the reporter's selected problem; Credit follows the errand."""
        body = {"reason": problem, **({"details": details} if details else {})}
        await self._internal(order_id, f"/{dispute_id}/accept", body, token)

    async def _internal(self, order_id, suffix, body, token, *, conflict=ErrandChanged) -> None:
        secret = self.settings.order_service_secret
        if secret is None:
            raise unavailable("ORDER_UNAVAILABLE")
        response = await self._send(
            "POST",
            f"/v1/internal/orders/{order_id}/disputes{suffix}",
            token,
            json=body,
            secret=secret.get_secret_value(),
        )
        if response.status_code == 404:
            raise OrderNotFound()
        if response.status_code == 409:
            if error_code(response) == "DISPUTE_OPEN":
                raise DisputeAlreadyOpen()
            raise conflict()

    async def _send(
        self, method: str, path: str, token: str, json=None, secret: str | None = None
    ) -> httpx.Response:
        base = self.settings.order_service_base_url
        if not base:
            raise unavailable("ORDER_UNAVAILABLE")
        headers = {"Authorization": f"Bearer {token}"}
        if secret is not None:
            headers["X-FoC-Service-Secret"] = secret
        try:
            async with asyncio.timeout(self.settings.dependency_timeout_seconds):
                response = await self.http.request(
                    method,
                    base + path,
                    headers=headers,
                    json=json,
                    follow_redirects=False,
                    timeout=self.settings.dependency_timeout_seconds,
                )
        except (httpx.HTTPError, TimeoutError):
            raise unavailable("ORDER_UNAVAILABLE") from None
        if response.status_code in (200, 404) or (response.status_code == 409 and secret):
            return response
        if response.status_code == 401 and error_code(response) != "UNAUTHENTICATED_SERVICE":
            raise ApiError(401, "UNAUTHENTICATED", "A current active session is required.")
        if response.status_code == 403:
            raise ApiError(403, "FORBIDDEN", "You are not allowed to change this errand.")
        # A rejected or missing service credential is a deployment fault, never the caller's.
        raise unavailable("ORDER_UNAVAILABLE")


def error_code(response: httpx.Response) -> str | None:
    try:
        return response.json()["error"]["code"]
    except (ValueError, KeyError, TypeError):
        return None

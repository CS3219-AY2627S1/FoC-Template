# AI-influenced: Resolve order detail names through Supplier and User Service APIs.
from __future__ import annotations

import asyncio
import logging

from app.services.client_manager import get_supplier_client, get_user_client

logger = logging.getLogger(__name__)


async def get_order_names(
    supplier_id: str, requester_id: str, courier_id: str | None
) -> tuple[str | None, str | None, str | None]:
    """Keep order details available when one of the name lookups fails."""
    lookups = [
        get_supplier_client().get_supplier(supplier_id),
        get_user_client().get_user_name(requester_id),
    ]
    if courier_id is not None:
        lookups.append(get_user_client().get_user_name(courier_id))
    results = await asyncio.gather(*lookups, return_exceptions=True)
    for result in results:
        if isinstance(result, asyncio.CancelledError):
            raise result
        if isinstance(result, BaseException):
            logger.warning("Order detail name lookup failed: %s", result)
    supplier = results[0]
    requester = results[1]
    courier = results[2] if courier_id is not None else None
    return (
        supplier.name if not isinstance(supplier, BaseException) else None,
        requester if isinstance(requester, str) else None,
        courier if isinstance(courier, str) else None,
    )

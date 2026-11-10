# AI-INFLUENCED: Manage Supplier, Credit, and User Service clients for order workflows.
import httpx

from app.config import settings
from app.services.clients.credit.client import CreditClient
from app.services.clients.supplier.client import SupplierClient
from app.services.clients.transport import JsonHttpTransport
from app.services.clients.user.client import UserClient

supplier_base_url = settings.supplier_service_url
credit_base_url = settings.credit_service_url
user_base_url = settings.user_service_url

_http_client: httpx.AsyncClient | None = None
_supplier_client: SupplierClient | None = None
_credit_client: CreditClient | None = None
_user_client: UserClient | None = None


def _start_remote_clients():
    global _http_client, _supplier_client, _credit_client, _user_client

    _http_client = httpx.AsyncClient(timeout=2.5)

    transport = JsonHttpTransport(_http_client)

    _supplier_client = SupplierClient(base_url=f"{supplier_base_url}", transport=transport)

    _credit_client = CreditClient(base_url=f"{credit_base_url}", transport=transport)
    _user_client = UserClient(base_url=user_base_url, transport=transport)


async def close_remote_clients():
    global _http_client, _supplier_client, _credit_client, _user_client

    if _http_client is not None:
        await _http_client.aclose()
    _http_client = None
    _supplier_client = None
    _credit_client = None
    _user_client = None


def get_supplier_client():
    if _supplier_client is None:
        raise RuntimeError("Remote clients have not been started.")
    return _supplier_client


def get_credit_client():
    if _credit_client is None:
        raise RuntimeError("Remote clients have not been started.")
    return _credit_client


def get_user_client() -> UserClient:
    if _user_client is None:
        raise RuntimeError("Remote clients have not been started.")
    return _user_client

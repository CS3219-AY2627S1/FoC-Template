import os
import httpx
from dotenv import load_dotenv
from fastapi import Request

load_dotenv()

SESSION_COOKIE = "relay_session"
USER_SERVICE_URL = os.environ["USER_SERVICE_URL"]



async def verify_auth_header(request: Request):

    session_cookie_value = request.cookies.get(SESSION_COOKIE)
    if not session_cookie_value:
        return {"kind": "unauthenticated"}

    try:
        payload = {"token": session_cookie_value, "requiredRole": "member"}
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.post(f"{USER_SERVICE_URL}/internal/authorize", json=payload)
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return {"kind": "denied"}

    if (
        response.status_code == 200
        and isinstance(data, dict)
        and data.get("decision") == "authorized"
        and data.get("accountId")
    ):
        return {"kind": "authorized", "accountId": data["accountId"]}

    return {"kind": "denied"}

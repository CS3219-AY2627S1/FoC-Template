from fastapi import Response
from fastapi.responses import JSONResponse

from common.config_manager import settings


def clear_access_token_cookie(response: Response) -> None:
    response.delete_cookie(
        "access_token",
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def unauthorized_response() -> JSONResponse:
    response = JSONResponse(
        status_code=401,
        content={"message": "Invalid or expired token. Please sign in."},
    )
    clear_access_token_cookie(response)
    return response

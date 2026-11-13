from fastapi import Request
from fastapi.responses import JSONResponse
from ..services.auth_service import verify_auth_header

# Listing the public paths means a new route is protected unless it is added here.
PUBLIC_PATHS = {"/", "/health/", "/docs", "/openapi.json"}


async def verify_auth_header_middleware(request: Request, call_next):

    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    authentication = await verify_auth_header(request)
    if authentication.get("kind") == "authorized":
        # The controller limits questions per account, so it needs to know whose request this is.
        request.state.account_id = authentication["accountId"]
        return await call_next(request)

    if authentication.get("kind") == "unauthenticated":
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "UNAUTHENTICATED", "message": "Log in to use the assistant"}},
        )

    return JSONResponse(
        status_code=403,
        content={"error": {"code": "FORBIDDEN", "message": "You are not allowed to do this"}},
    )

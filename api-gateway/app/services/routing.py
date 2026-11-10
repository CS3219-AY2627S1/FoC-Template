from __future__ import annotations

import re

from app.exposed_routes import EXPOSED_ROUTES, EXPOSED_WEBSOCKET_ROUTES, ROUTE_TABLE

__all__ = [
    "EXPOSED_ROUTES",
    "EXPOSED_WEBSOCKET_ROUTES",
    "ROUTE_TABLE",
    "is_canonical",
    "is_exposed",
    "resolve_upstream",
    "resolve_websocket_upstream",
]


def _compile(template: str) -> re.Pattern[str]:
    return re.compile("^" + re.sub(r"\\\{[a-z_]+\\\}", "[^/]+", re.escape(template)) + "$")


_EXPOSED: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (method, _compile(template)) for method, template in EXPOSED_ROUTES
)


def is_canonical(path: str) -> bool:
    """Reject paths that mean something else once normalised.

    httpx resolves "." and ".." segments before sending, so a path that does
    not look like an exposed route here could still land on one upstream.
    Empty segments ("//") and trailing slashes are rejected too: exposed
    routes are matched exactly as written.
    """
    if not path.startswith("/") or path.endswith("/"):
        return False
    return all(segment not in ("", ".", "..") for segment in path.split("/")[1:])


def is_exposed(method: str, path: str) -> bool:
    if not is_canonical(path):
        return False
    method = "GET" if method.upper() == "HEAD" else method.upper()
    return any(m == method and pattern.match(path) for m, pattern in _EXPOSED)


def _upstream_for(path: str) -> str | None:
    for prefix, base_url in ROUTE_TABLE.items():
        if path == prefix or path.startswith(prefix + "/"):
            return base_url
    return None


def resolve_upstream(method: str, path: str) -> str | None:
    if not is_exposed(method, path):
        return None
    return _upstream_for(path)


def resolve_websocket_upstream(path: str) -> str | None:
    if not is_canonical(path) or path not in EXPOSED_WEBSOCKET_ROUTES:
        return None
    return _upstream_for(path)

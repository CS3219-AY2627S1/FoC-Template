#!/usr/bin/env python3
# AI-influenced: written with Claude (Opus 5.5); see ai/usage-log.md.
"""End-to-end check of requester-courier chat through the API gateway.

Registers a requester, a courier and an outsider (OTP read from Mailpit), creates an
order, has the courier accept it, then checks that:

* the OrderAccepted event opened an order chat for exactly those two users,
* WebSocket tickets are one-time, required, and refused for foreign origins,
* a message sent by the courier reaches the requester live,
* OrderPickedUp appears in the chat as a system message,
* a photo uploaded and sent by the courier reaches the requester and can be read back,
* the outsider cannot read the chat or its photos.

Needs a running stack (`docker compose up`) and `pip install websockets`.
Overridable: GATEWAY (default http://localhost:8080), MAILPIT (default
http://localhost:8025). Exits non-zero on the first failed check.
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from websockets.exceptions import InvalidStatus
from websockets.sync.client import ClientConnection, connect

GATEWAY = os.environ.get("GATEWAY", "http://localhost:8080").rstrip("/")
MAILPIT = os.environ.get("MAILPIT", "http://localhost:8025").rstrip("/")
WS_BASE = "ws" + GATEWAY[4:]
PASSWORD = "Passw0rd1"
# A 1x1 PNG (no Pillow on the CI runner).
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def log(msg: str) -> None:
    print(f"[chat-e2e] {msg}", file=sys.stderr, flush=True)


def check(condition: bool, msg: str) -> None:
    if not condition:
        log(f"FAIL: {msg}")
        sys.exit(1)
    log(f"ok: {msg}")


def call(method: str, url: str, token: str | None = None, body: Any = None) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            raw = res.read()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return err.code, raw.decode(errors="replace")


def api(method: str, path: str, token: str | None = None, body: Any = None) -> tuple[int, Any]:
    return call(method, GATEWAY + path, token, body)


def upload_photo(token: str, conversation_id: str) -> tuple[int, Any]:
    boundary = uuid.uuid4().hex
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="e2e.png"\r\n'
            "Content-Type: image/png\r\n\r\n"
        ).encode()
        + PNG
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(
        f"{GATEWAY}/api/chat/conversations/{conversation_id}/attachments", data=body, method="POST"
    )
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(errors="replace")


def fetch_photo(token: str, conversation_id: str, attachment_id: str) -> tuple[int, str, bytes]:
    req = urllib.request.Request(
        f"{GATEWAY}/api/chat/conversations/{conversation_id}/attachments/{attachment_id}"
    )
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, res.headers.get("Content-Type", ""), res.read()
    except urllib.error.HTTPError as err:
        return err.code, "", b""


def register(label: str) -> tuple[str, str]:
    email = f"chate2e{int(time.time())}_{random.randint(0, 99999)}@u.nus.edu"
    log(f"registering {label} ({email})")
    api(
        "POST",
        "/api/users/register",
        body={
            "email": email,
            "password": PASSWORD,
            "display_name": f"Chat E2E {label}",
            "contact_number": "91234567",
        },
    )
    query = urllib.parse.quote(f'to:"{email}"')
    code = ""
    for _ in range(20):
        _, found = call("GET", f"{MAILPIT}/api/v1/search?query={query}")
        snippet = ((found or {}).get("messages") or [{}])[0].get("Snippet", "")
        match = re.search(r"\b(\d{6})\b", snippet)
        if match:
            code = match.group(1)
            break
        time.sleep(1)
    check(bool(code), f"OTP received for {label}")
    api("POST", "/api/users/otp/verify", body={"email": email, "code": code})
    status, login = api("POST", "/api/users/login", body={"email": email, "password": PASSWORD})
    check(status == 200, f"{label} logged in")
    token = login["access_token"]
    _, me = api("GET", "/api/users/me", token)
    return token, me["id"]


def wait_for(fn, what: str, timeout_s: float = 20.0):  # noqa: ANN001, ANN201
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(0.5)
    check(False, what)
    return None


def ticket(token: str) -> str:
    status, body = api("POST", "/api/chat/ws-ticket", token)
    check(status == 201, "ticket issued")
    return body["ticket"]


@contextmanager
def open_socket(token: str) -> Iterator[ClientConnection]:
    with connect(f"{WS_BASE}/api/chat/ws?ticket={ticket(token)}", open_timeout=10) as ws:
        ready = json.loads(ws.recv(timeout=10))
        check(ready["type"] == "ready", "socket ready")
        yield ws


def next_event(ws: ClientConnection, type_: str, timeout_s: float = 15.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        frame = json.loads(ws.recv(timeout=max(0.1, deadline - time.monotonic())))
        if frame["type"] == type_:
            return frame
    raise TimeoutError(type_)


def refused(url: str, **kwargs: Any) -> bool:
    try:
        with connect(url, open_timeout=10, **kwargs):
            pass
    except InvalidStatus as exc:
        return exc.response.status_code == 403
    return False


def main() -> None:
    req_token, req_id = register("requester")
    cour_token, cour_id = register("courier")
    out_token, _ = register("outsider")

    def credits_ready() -> bool:
        _, bal = api("GET", f"/api/credits/{req_id}/balance", req_token)
        return isinstance(bal, dict) and bal.get("available_balance", 0) >= 10

    wait_for(credits_ready, "requester credits allocated")
    _, suppliers = api("GET", "/api/suppliers?page_size=50", req_token)
    supplier_id = next(s["id"] for s in suppliers["items"] if s["active"])
    deadline = (dt.datetime.now(dt.UTC) + dt.timedelta(hours=1)).isoformat()
    status, order = api(
        "POST",
        "/api/orders",
        req_token,
        {
            "name": "Chat E2E Order",
            "details": "chat demo",
            "reward": 10,
            "deadline": deadline,
            "supplier_id": supplier_id,
            "pickup_location": "COM1",
            "delivery_location": "COM2",
        },
    )
    check(status in (200, 201), "order created")
    order_id = order["order_id"]
    status, _ = api("POST", f"/api/orders/{order_id}/accept", cour_token)
    check(status == 200, "courier accepted the order")

    def order_chat(token: str) -> dict[str, Any] | None:
        _, inbox = api("GET", "/api/chat/conversations", token)
        return next(
            (c for c in inbox or [] if c.get("metadata", {}).get("order_id") == order_id), None
        )

    conv = wait_for(lambda: order_chat(req_token), "OrderAccepted opened an order chat")
    members = {m["user_id"]: m["label"] for m in conv["members"]}
    check(members == {req_id: "requester", cour_id: "courier"}, "chat members are both parties")
    check(order_chat(cour_token) is not None, "courier sees the chat too")
    status, _ = api("GET", f"/api/chat/conversations/{conv['id']}", out_token)
    check(status == 403, "outsider cannot read the chat")

    # Ticket security.
    status, _ = api("POST", "/api/chat/ws-ticket")
    check(status == 401, "ticket needs a login")
    check(refused(f"{WS_BASE}/api/chat/ws?ticket=forged"), "forged ticket refused (403)")
    check(refused(f"{WS_BASE}/api/chat/ws"), "missing ticket refused (403)")
    one_time = ticket(cour_token)
    with connect(f"{WS_BASE}/api/chat/ws?ticket={one_time}", open_timeout=10):
        pass
    check(refused(f"{WS_BASE}/api/chat/ws?ticket={one_time}"), "used ticket refused (403)")
    check(
        refused(
            f"{WS_BASE}/api/chat/ws?ticket={ticket(cour_token)}", origin="https://evil.example"
        ),
        "foreign Origin refused (403)",
    )

    # Live messaging.
    with open_socket(req_token) as req_ws, open_socket(cour_token) as cour_ws:
        client_msg_id = str(uuid.uuid4())
        cour_ws.send(
            json.dumps(
                {
                    "type": "send",
                    "req_id": "s1",
                    "data": {
                        "conversation_id": conv["id"],
                        "client_msg_id": client_msg_id,
                        "kind": "text",
                        "body": "On my way to COM1!",
                    },
                }
            )
        )
        ack = next_event(cour_ws, "ack")
        check(ack["data"]["message"]["body"] == "On my way to COM1!", "courier's send acked")
        got = next_event(req_ws, "message.new")["data"]["message"]
        check(got["body"] == "On my way to COM1!" and got["sender_id"] == cour_id, "live delivery")

        status, _ = api("POST", f"/api/orders/{order_id}/pickup", cour_token)
        check(status == 200, "courier picked up")
        while True:
            msg = next_event(req_ws, "message.new")["data"]["message"]
            if msg["kind"] == "system" and msg["payload"]["key"] == "order.picked_up":
                break
        check(True, "OrderPickedUp shown in the chat")

        # Photos: upload, send by attachment_id, receive live, read back.
        status, photo = upload_photo(cour_token, conv["id"])
        check(status == 201, f"courier uploaded a photo ({status} {photo})")
        cour_ws.send(
            json.dumps(
                {
                    "type": "send",
                    "req_id": "p1",
                    "data": {
                        "conversation_id": conv["id"],
                        "client_msg_id": str(uuid.uuid4()),
                        "kind": "image",
                        "body": "At the counter",
                        "payload": {"attachment_id": photo["attachment_id"]},
                    },
                }
            )
        )
        check(next_event(cour_ws, "ack")["data"]["message"]["kind"] == "image", "photo sent")
        while True:
            msg = next_event(req_ws, "message.new")["data"]["message"]
            if msg["kind"] == "image":
                break
        check(msg["payload"]["attachment_id"] == photo["attachment_id"], "photo delivered live")
        status, ctype, data = fetch_photo(req_token, conv["id"], photo["attachment_id"])
        check(status == 200 and ctype == "image/png" and data[:4] == b"\x89PNG", "photo readable")
        status, _, _ = fetch_photo(out_token, conv["id"], photo["attachment_id"])
        check(status == 403, "outsider cannot read the photo")

    log("PASS")


if __name__ == "__main__":
    main()

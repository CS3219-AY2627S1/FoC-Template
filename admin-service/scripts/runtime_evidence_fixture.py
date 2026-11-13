"""TEST ONLY Chat timeline fixture for the UUID-named runtime smoke project.

No production fallback, producer reconciliation or Chat authentication is implemented.
The smoke mounts this server on a private internal network with no published port.
Only explicitly configured case UUIDs have evidence; unknown cases fail closed.
"""

from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
import uuid


def timeline(case_id, fixture):
    now = datetime.now(timezone.utc)
    stamp = now.isoformat().replace("+00:00", "Z")
    order_id, requester = fixture["orderId"], fixture["requesterId"]
    courier = fixture.get("courierId")
    participants = [dict(userId=requester, relationship="REQUESTER", assignedAt=None, unassignedAt=None)]
    for user in set(fixture.get("historicalCourierIds", [])) | ({courier} if courier else set()):
        participants.append(dict(userId=user, relationship="HISTORICAL_COURIER",
                                 assignedAt=(now - timedelta(hours=1)).isoformat(),
                                 unassignedAt=None if user == courier else stamp))
    order = dict(orderId=order_id, requesterId=requester, courierId=courier, status="OPEN",
                 title="TEST ONLY runtime evidence", description="Synthetic transport fixture, not producer history",
                 creditReward=10, pickupDeadline=(now + timedelta(hours=1)).isoformat(),
                 pickupLocationId=order_id, dropoffLocationId=case_id,
                 pickupLocationName=None, dropoffLocationName=None)
    checkpoints = [dict(source=source, stream=stream, aggregateId=aggregate,
                        committedSequence=2, projectedSequence=2, checkedAt=stamp)
                   for source, stream, aggregate in (
                       ("order-service", "order.lifecycle.events", order_id),
                       ("credit-service", "credit.events", order_id),
                       ("admin-service", "admin.events", case_id))]
    return dict(caseId=case_id, orderId=order_id, evidenceRevision="TEST-ONLY-runtime-evidence-v1",
                order=order, participants=participants, records=[], nextCursor=None,
                coverage=dict(status=fixture.get("coverage", "COMPLETE"), asOf=stamp,
                              checkpoints=checkpoints, blockingGaps=[]))


def server(directory, address=("0.0.0.0", 8090)):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log delegated credentials or private request content.

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/health":
                self.respond(200, {"testOnly": True})
                return
            parts = path.split("/")
            if len(parts) != 6 or parts[1:4] != ["internal", "chat", "cases"] or parts[5] != "timeline":
                self.respond(404, {})
                return
            if not self.headers.get("Authorization") or not self.headers.get("X-Actor-Token"):
                self.respond(401, {})
                return
            try:
                case_id = str(uuid.UUID(parts[4]))
                fixture = json.loads((directory / (case_id + ".json")).read_text(encoding="utf-8"))
                if fixture.get("unavailable"):
                    raise ValueError("TEST ONLY source outage")
                self.respond(200, timeline(case_id, fixture))
            except (OSError, ValueError, KeyError):
                self.respond(503, {"detail": "TEST ONLY evidence unavailable"})

        def respond(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return ThreadingHTTPServer(address, Handler)


if __name__ == "__main__":
    server(Path(sys.argv[1])).serve_forever()

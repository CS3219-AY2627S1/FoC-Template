"""Exercise the smoke fixture's HTTP boundary, never real Chat completeness."""

import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid

from runtime_evidence_fixture import server


class RuntimeEvidenceFixtureTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.server = server(Path(self.directory.name), ("127.0.0.1", 0))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.case, self.order, self.requester, self.courier = (str(uuid.uuid4()) for _ in range(4))
        self.path = f"/internal/chat/cases/{self.case}/timeline?limit=100"

    def stop(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def get(self, path=None, delegate=True):
        headers = {"Authorization": "Bearer TEST-ONLY", "X-Actor-Token": "TEST-ONLY"} if delegate else {}
        request = urllib.request.Request(f"http://127.0.0.1:{self.server.server_port}" + (path or self.path), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            with response:
                return response.code, json.load(response)

    def write(self, **extra):
        fixture = dict(orderId=self.order, requesterId=self.requester, historicalCourierIds=[self.courier])
        fixture.update(extra)
        (Path(self.directory.name) / (self.case + ".json")).write_text(json.dumps(fixture), encoding="utf-8")

    def test_missing_unknown_and_unavailable_cases_never_fabricate_evidence(self):
        self.assertEqual(503, self.get()[0])
        self.write(unavailable=True)
        self.assertEqual(503, self.get()[0])
        self.write()
        self.assertEqual(503, self.get(self.path.replace(self.case, str(uuid.uuid4())))[0])

    def test_complete_snapshot_includes_non_reporting_historical_and_current_couriers(self):
        current = str(uuid.uuid4())
        self.write(courierId=current)
        status, evidence = self.get()
        self.assertEqual(200, status)
        self.assertEqual(self.case, evidence["caseId"])
        self.assertEqual(self.order, evidence["orderId"])
        self.assertEqual({self.requester, self.courier, current}, {p["userId"] for p in evidence["participants"]})
        self.assertEqual("COMPLETE", evidence["coverage"]["status"])
        self.assertTrue(evidence["evidenceRevision"].startswith("TEST-ONLY"))

    def test_incomplete_coverage_is_not_silently_upgraded(self):
        self.write(coverage="INCOMPLETE")
        self.assertEqual("INCOMPLETE", self.get()[1]["coverage"]["status"])

    def test_route_and_delegation_checks(self):
        self.write()
        self.assertEqual(401, self.get(delegate=False)[0])
        self.assertEqual(404, self.get("/internal/chat/orders/unknown/timeline")[0])
        self.assertEqual(503, self.get("/internal/chat/cases/not-a-uuid/timeline")[0])
        self.assertEqual(200, self.get("/health", delegate=False)[0])


if __name__ == "__main__":
    unittest.main()

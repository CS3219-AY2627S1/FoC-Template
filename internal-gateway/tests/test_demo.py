"""Controller unit tests; no Docker required."""

import importlib.util
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location(
    "gateway_demo", Path(__file__).parents[1] / "demo" / "server.py"
)
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        demo.STATE_DIR = Path(self.temp.name)
        self.server = demo.ThreadingHTTPServer(("127.0.0.1", 0), demo.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, body=None, headers=None):
        options = {"Origin": self.url, "Content-Type": "application/json"}
        options.update(headers or {})
        req = Request(self.url + path, data=body, headers=options,
                      method="GET" if body is None else "PUT")
        try:
            response = urlopen(req, timeout=2)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.read()

    def test_all_services_toggle_idempotently(self):
        status, raw = self.request("/api/services")
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(raw)["services"]), 4)
        for service in demo.SERVICES:
            for enabled in (False, False, True, True):
                status, raw = self.request(f"/api/services/{service}", json.dumps({"enabled": enabled}).encode())
                self.assertEqual(status, 200)
                self.assertIs(json.loads(raw)["enabled"], enabled)
                self.assertEqual((demo.STATE_DIR / f"{service}.disabled").exists(), not enabled)

    def test_invalid_input_does_not_change_state(self):
        for body in (b"{}", b"null", b"[]", b'{"enabled":1}', b'{"enabled":"false"}', b"bad", b'{"enabled":false,"other":1}'):
            self.assertEqual(self.request("/api/services/user", body)[0], 400)
        self.assertEqual(self.request("/api/services/unknown", b'{"enabled":false}')[0], 404)
        self.assertEqual(list(demo.STATE_DIR.iterdir()), [])

    def test_origin_and_host_protection(self):
        for headers in ({"Origin": ""}, {"Origin": "http://evil.example"},
                        {"Host": "evil.example", "Origin": "http://evil.example"}):
            self.assertEqual(self.request("/api/services/user", b'{"enabled":false}', headers)[0], 403)
        self.assertEqual(self.request("/api/services", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("/api/services/user", b'{"enabled":false}', {"Content-Type": "text/plain"})[0], 415)

    def test_dashboard_assets(self):
        for path in ("/", "/dashboard.js", "/style.css"):
            self.assertEqual(self.request(path)[0], 200)
        self.assertEqual(self.request("/../server.py")[0], 404)


if __name__ == "__main__":
    unittest.main()

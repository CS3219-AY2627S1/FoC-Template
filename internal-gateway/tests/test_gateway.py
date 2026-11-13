"""Run with: python3 -m unittest discover -s internal-gateway/tests -v."""

import json
import os
import subprocess
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


COMPOSE_FILE = Path(__file__).with_name("compose.yaml")


def request(url, *, method="GET", body=None, headers=None):
    req = Request(url, data=body, headers=headers or {}, method=method)
    try:
        response = urlopen(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def wait_for(url):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            status, _, body = request(url)
            if status == 200:
                return json.loads(body)
        except (URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(0.25)
    raise AssertionError(f"Timed out waiting for {url}")


class GatewayTests(unittest.TestCase):
    @classmethod
    def compose(cls, *args):
        result = subprocess.run(
            ["docker", "compose", "--env-file", os.devnull, "-p", cls.project,
             "-f", str(COMPOSE_FILE), *args],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        return result.stdout.strip()

    @classmethod
    def setUpClass(cls):
        cls.project = f"foc-gateway-test-{uuid4().hex[:8]}"
        cls.addClassCleanup(cls.compose, "down", "--volumes", "--remove-orphans")
        # Start proxies without peers: nginx must not require them at startup.
        cls.compose(
            "up", "-d", "--build", "--wait", "internal-gateway", "ui", "gateway-demo"
        )
        cls.ui_url = "http://" + cls.compose("port", "ui", "80")
        cls.demo_url = "http://" + cls.compose("port", "gateway-demo", "8080")
        wait_for(cls.demo_url + "/api/services")
        cls.startup_health = json.loads(
            cls.compose(
                "exec", "-T", "internal-gateway", "wget", "-q", "-O", "-",
                "http://127.0.0.1/health",
            )
        )
        cls.compose("exec", "-T", "internal-gateway", "nginx", "-t")
        cls.unavailable_status = request(cls.ui_url + "/user-api/health")[0]
        cls.compose(
            "up", "-d", "user-service", "supplier-service", "order-service", "credit-service"
        )
        for service in ("user", "supplier", "order", "credit"):
            wait_for(cls.ui_url + f"/{service}-api/health")

    def set_route(self, service, enabled):
        return request(
            self.demo_url + f"/api/services/{service}",
            method="PUT",
            body=json.dumps({"enabled": enabled}).encode(),
            headers={"Content-Type": "application/json", "Origin": self.demo_url},
        )

    def test_demo_dashboard_and_service_list(self):
        status, headers, body = request(self.demo_url + "/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"<html", body.lower())
        status, _, raw = request(self.demo_url + "/api/services")
        self.assertEqual(status, 200)
        services = {item["id"]: item for item in json.loads(raw)["services"]}
        self.assertEqual(set(services), {"user", "supplier", "order", "credit"})
        for service, item in services.items():
            self.assertEqual(item["route"], f"/{service}-api/")
            self.assertIs(item["enabled"], True)

    def test_demo_toggles_routes_without_stopping_backends(self):
        for service in ("user", "supplier", "order", "credit"):
            with self.subTest(service=service):
                try:
                    self.assertEqual(self.set_route(service, False)[0], 200)
                    for method in ("GET", "POST", "PATCH", "DELETE"):
                        self.assertEqual(
                            request(self.ui_url + f"/{service}-api/health", method=method)[0],
                            503,
                        )
                    status, _, raw = request(self.demo_url + "/api/services")
                    self.assertEqual(status, 200)
                    states = {item["id"]: item["enabled"] for item in json.loads(raw)["services"]}
                    self.assertIs(states[service], False)
                    for other in states.keys() - {service}:
                        self.assertIs(states[other], True)
                        self.assertEqual(request(self.ui_url + f"/{other}-api/health")[0], 200)
                    # The service itself is still running; only gateway routing is disabled.
                    port = "5005" if service == "user" else "3001" if service == "supplier" else "3002"
                    direct = self.compose(
                        "exec", "-T", service + "-service", "python", "-c",
                        "from urllib.request import urlopen; "
                        f"print(urlopen('http://127.0.0.1:{port}/health').status)",
                    )
                    self.assertEqual(direct, "200")
                    health = self.compose(
                        "exec", "-T", "internal-gateway", "wget", "-q", "-O", "-",
                        "http://127.0.0.1/health",
                    )
                    self.assertEqual(json.loads(health)["status"], "healthy")
                finally:
                    self.assertEqual(self.set_route(service, True)[0], 200)
                self.assertEqual(request(self.ui_url + f"/{service}-api/health")[0], 200)

    def test_demo_rejects_unsafe_mutations(self):
        url = self.demo_url + "/api/services/user"
        for headers in (
            {"Content-Type": "application/json"},
            {"Content-Type": "application/json", "Origin": "http://evil.example"},
            {"Content-Type": "text/plain", "Origin": self.demo_url},
        ):
            with self.subTest(headers=headers):
                status, _, _ = request(
                    url, method="PUT", body=b'{"enabled":false}', headers=headers
                )
                self.assertGreaterEqual(status, 400)
                self.assertLess(status, 500)
        headers = {"Content-Type": "application/json", "Origin": self.demo_url}
        for body in (b'{"enabled":"false"}', b'{"enabled":0}', b'{}', b'[]', b'{'):
            with self.subTest(body=body):
                status, _, _ = request(url, method="PUT", body=body, headers=headers)
                self.assertGreaterEqual(status, 400)
                self.assertLess(status, 500)
        self.assertEqual(self.set_route("unknown", False)[0], 404)
        self.assertEqual(request(self.ui_url + "/user-api/health")[0], 200)

    def test_gateway_is_internal_only(self):
        result = subprocess.run(
            ["docker", "inspect", self.compose("ps", "-q", "internal-gateway")],
            capture_output=True, text=True, check=True, timeout=10,
        )
        container = json.loads(result.stdout)[0]
        self.assertIn(self.project + "_default", container["NetworkSettings"]["Networks"])
        self.assertFalse(container["HostConfig"]["ExtraHosts"])
        self.assertFalse(container["HostConfig"]["PortBindings"])
        self.assertFalse(container["NetworkSettings"]["Ports"].get("80/tcp"))

    def test_gateway_starts_without_backends(self):
        self.assertEqual(
            self.startup_health,
            {"status": "healthy", "service": "internal-gateway"},
        )
        self.assertEqual(self.unavailable_status, 502)

    def test_routes_preserve_requests_through_both_proxies(self):
        for prefix, service in (
            ("/user-api", "user-service"),
            ("/supplier-api", "supplier-service"),
        ):
            for method in ("GET", "POST", "PATCH", "DELETE"):
                with self.subTest(service=service, method=method):
                    path = "/resource/123?query=a%20b&limit=2"
                    body = b'{"name":"Test Cafe"}' if method != "GET" else None
                    status, headers, raw = request(
                        self.ui_url + prefix + path,
                        method=method,
                        body=body,
                        headers={
                            "Authorization": "Bearer test-token",
                            "Cookie": "access_token=cookie-token",
                            "Content-Type": "application/json",
                        },
                    )
                    result = json.loads(raw)
                    self.assertEqual(status, 200)
                    self.assertEqual(result["service"], service)
                    self.assertEqual(result["path"], path)
                    self.assertEqual(result["method"], method)
                    self.assertEqual(result["body"], (body or b"").decode())
                    self.assertEqual(
                        result["headers"]["authorization"], "Bearer test-token"
                    )
                    self.assertEqual(
                        result["headers"]["cookie"], "access_token=cookie-token"
                    )
                    self.assertIn("access_token=upstream-token", headers["Set-Cookie"])

    def test_upstream_status_codes_are_not_intercepted(self):
        for prefix in ("/user-api", "/supplier-api"):
            for expected in (401, 403, 404, 503):
                with self.subTest(prefix=prefix, status=expected):
                    status, _, _ = request(f"{self.ui_url}{prefix}/status/{expected}")
                    self.assertEqual(status, expected)

    def test_unknown_gateway_routes_are_rejected(self):
        # Call from a peer container: the gateway has no published host port.
        script = (
            "import sys\n"
            "from urllib.request import urlopen\n"
            "from urllib.error import HTTPError\n"
            "try:\n"
            "    response = urlopen(sys.argv[1], timeout=5)\n"
            "except HTTPError as error:\n"
            "    response = error\n"
            "with response:\n"
            "    print(response.status)\n"
        )
        for path in ("/", "/unknown/health", "/user-api-other/health"):
            with self.subTest(path=path):
                status = self.compose(
                    "exec", "-T", "user-service", "python", "-c", script,
                    "http://internal-gateway" + path,
                )
                self.assertEqual(int(status), 404)

    def test_nginx_images_require_runtime_configuration(self):
        for service, variable in (
            ("internal-gateway", "USER_SERVICE_UPSTREAM"),
            ("internal-gateway", "SUPPLIER_SERVICE_UPSTREAM"),
            ("internal-gateway", "NGINX_DNS_RESOLVER"),
            ("ui", "INTERNAL_GATEWAY_URL"),
            ("ui", "NGINX_DNS_RESOLVER"),
        ):
            with self.subTest(service=service, variable=variable):
                with self.assertRaisesRegex(AssertionError, variable + " must be set"):
                    self.compose(
                        "run", "--rm", "--no-deps", "-e", variable + "=",
                        service, "nginx", "-t",
                    )

    def test_ui_keeps_spa_fallback(self):
        status, headers, body = request(self.ui_url + "/suppliers")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"<html", body)


if __name__ == "__main__":
    unittest.main()

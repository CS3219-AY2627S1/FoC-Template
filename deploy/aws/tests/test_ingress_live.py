# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented and debugged private/public ingress behavior tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Opt-in checks against a disposable Nginx proxy and echo upstream, never real APIs."""

from __future__ import annotations

import http.client
import json
import os
import unittest


@unittest.skipUnless(os.environ.get("CLOUD_INGRESS_SMOKE") == "1", "disposable Nginx network only")
class IngressTests(unittest.TestCase):
    def request(self, port, path, headers=None):
        client = http.client.HTTPConnection("cloud-config-proxy", port, timeout=10)
        self.addCleanup(client.close)
        client.request("GET", path, headers=headers or {})
        return client.getresponse()

    def test_public_and_private_health_and_internal_route_blocking(self):
        for port in (80, 8080):
            with self.subTest(port=port):
                response = self.request(port, "/healthz")
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read()), {"status": "ok"})
                for path in ("/v1/internal/users/test", "/v1/internal/orders/test"):
                    self.assertEqual(self.request(port, path).status, 404)

    def test_credentials_queries_and_refresh_cookie_survive_proxying(self):
        for port, protocol in ((80, "http"), (8080, "https")):
            for path in (
                "/v1/session?test=1",
                "/v1/orders?status=OPEN&limit=5",
                "/v1/wallets?test=1",
                "/api/v1/suppliers?search=COM3",
                "/v1/chat?test=1",
                "/v1/admin/disputes?test=1",
                "/v1/voice-assist?test=1",
            ):
                with self.subTest(port=port, path=path):
                    response = self.request(
                        port,
                        path,
                        {
                            "Authorization": "Bearer ingress-test",
                            "Cookie": "refresh=ingress-test",
                            "Origin": "https://dexample.cloudfront.net",
                            "X-Forwarded-Proto": "spoofed",
                        },
                    )
                    self.assertEqual(response.status, 200)
                    self.assertIn("Secure", response.getheader("Set-Cookie"))
                    data = json.loads(response.read())
                    self.assertEqual(data["authorization"], "Bearer ingress-test")
                    self.assertEqual(data["cookie"], "refresh=ingress-test")
                    self.assertEqual(data["uri"], path)
                    self.assertEqual(data["proto"], protocol)

    def test_chat_websocket_upgrade_survives_public_listener(self):
        response = self.request(
            8080,
            "/v1/chat/live",
            {
                "Connection": "Upgrade",
                "Upgrade": "websocket",
                "Sec-WebSocket-Version": "13",
                "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
                "Origin": "https://dexample.cloudfront.net",
            },
        )
        self.assertEqual(response.status, 101)
        self.assertEqual(response.getheader("Upgrade"), "websocket")
        self.assertEqual(response.getheader("Sec-WebSocket-Accept"), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")


if __name__ == "__main__":
    unittest.main()

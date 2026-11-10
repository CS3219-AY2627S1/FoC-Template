"""Local-only demo controls. No Docker socket, shell commands, or nginx reloads."""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit

SERVICES = ("user", "supplier", "order", "credit")
STATE_DIR = Path(os.environ.get("STATE_DIR", "/var/run/gateway-demo"))
LOCK = Lock()


def service_state(service):
    return {"id": service, "route": f"/{service}-api/",
            "enabled": not (STATE_DIR / f"{service}.disabled").exists()}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type="application/json"):
        data = json.dumps(body).encode() if content_type == "application/json" else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)

    def allowed_host(self):
        # Reject DNS-rebinding hosts; this unauthenticated tool is loopback-only.
        try:
            return urlsplit("http://" + self.headers.get("Host", "")).hostname in (
                "localhost", "127.0.0.1", "::1",
            )
        except ValueError:
            return False

    def do_GET(self):
        if not self.allowed_host():
            self.reply(403, {"error": "Loopback host required"})
            return
        if self.path == "/api/services":
            with LOCK:
                self.reply(200, {"services": [service_state(s) for s in SERVICES]})
        elif self.path in ("/", "/dashboard.js", "/style.css"):
            filename, content_type = {
                "/": ("index.html", "text/html; charset=utf-8"),
                "/dashboard.js": ("dashboard.js", "text/javascript; charset=utf-8"),
                "/style.css": ("style.css", "text/css; charset=utf-8"),
            }[self.path]
            self.reply(200, Path(__file__).with_name(filename).read_bytes(), content_type)
        else:
            self.reply(404, {"error": "Not found"})

    def do_PUT(self):
        # No CORS: require a same-origin browser request as an additional CSRF guard.
        host = self.headers.get("Host", "")
        if not self.allowed_host() or self.headers.get("Origin") != f"http://{host}":
            self.reply(403, {"error": "Same-origin request required"})
            return
        service = self.path.removeprefix("/api/services/")
        if self.path != f"/api/services/{service}" or service not in SERVICES:
            self.reply(404, {"error": "Unknown service"})
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            self.reply(415, {"error": "Expected application/json"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1024 or self.headers.get("Transfer-Encoding"):
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict) or set(body) != {"enabled"} or type(body["enabled"]) is not bool:
                raise ValueError()
        except (ValueError, UnicodeError):
            self.reply(400, {"error": "Expected {enabled: boolean}"})
            return
        try:
            with LOCK:
                flag = STATE_DIR / f"{service}.disabled"
                if body["enabled"]:
                    flag.unlink(missing_ok=True)
                else:
                    flag.touch(mode=0o644, exist_ok=True)
                self.reply(200, service_state(service))
        except OSError:
            self.reply(500, {"error": "Unable to update routing state"})

    def setup(self):
        super().setup()
        self.connection.settimeout(5)


if __name__ == "__main__":
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.daemon_threads = True
    server.serve_forever()

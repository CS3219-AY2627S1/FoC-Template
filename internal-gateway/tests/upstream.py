"""Small HTTP echo backend for nginx routing tests; standard library only."""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


class EchoHandler(BaseHTTPRequestHandler):
    def respond(self):
        path = urlsplit(self.path).path
        status = int(path.rsplit("/", 1)[1]) if path.startswith("/status/") else 200
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        payload = json.dumps(
            {
                "service": os.environ["SERVICE"],
                "method": self.command,
                "path": self.path,
                "headers": {key.lower(): value for key, value in self.headers.items()},
                "body": body.decode(),
            }
        ).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Set-Cookie", "access_token=upstream-token; Path=/; HttpOnly")
        self.end_headers()
        self.wfile.write(payload)

    do_GET = do_POST = do_PATCH = do_DELETE = respond


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ["PORT"])), EchoHandler).serve_forever()

# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

import os


os.environ.setdefault("USER_SERVICE_URL", "http://localhost:8081")
os.environ.setdefault("SUPPLIER_SERVICE_URL", "http://localhost:8080")
os.environ.setdefault("JWT_ISSUER", "campuscouriers-user-service")



# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated Supplier application configuration, errors and package setup.
# Author review: I validated correctness, and added boundary checks.

"""Environment-backed settings for this independently deployed service."""

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    database_url: str
    user_service_base_url: str
    supplier_service_shared_secret: str
    jwt_issuer: str
    jwt_audience: str


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv("SUPPLIER_DATABASE_URL", ""),
        user_service_base_url=os.getenv("USER_SERVICE_BASE_URL", ""),
        supplier_service_shared_secret=os.getenv("SUPPLIER_SERVICE_SHARED_SECRET", ""),
        jwt_issuer=os.getenv("USER_SERVICE_JWT_ISSUER", "foc-user-service"),
        jwt_audience=os.getenv("USER_SERVICE_JWT_AUDIENCE", "foc-services"),
    )

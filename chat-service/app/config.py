# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented Chat Service runtime settings and validation.
# Author review: I validated correctness and added boundary checks where needed.

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )
    database_url: SecretStr | None = None
    rabbitmq_url: SecretStr | None = None
    chat_service_shared_secret: SecretStr | None = None
    user_service_base_url: str = "http://127.0.0.1:8000"
    jwt_issuer: str = "foc-user-service"
    jwt_audience: str = "foc-services"
    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    user_timeout_seconds: float = Field(default=3, ge=0.1, le=10)
    jwks_ttl_seconds: int = Field(default=300, ge=1, le=3600)
    websocket_auth_timeout_seconds: float = Field(default=5, gt=0, le=5)
    websocket_session_check_seconds: float = Field(default=15, ge=0.1, le=60)
    outgoing_buffer_size: int = Field(default=64, ge=1, le=256)
    exchange_name: str = "foc.chat.events"
    outbox_poll_seconds: float = Field(default=0.5, ge=0.1, le=60)
    outbox_lease_seconds: int = Field(default=30, ge=5, le=300)
    outbox_retry_max_seconds: int = Field(default=60, ge=1, le=3600)

# AI-influenced: chat-service upstream added with Claude (Opus 5.5); see ai/usage-log.md.
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    service_name: str = "api-gateway"
    log_level: str = "info"
    jwt_secret: str = "change-me-in-dev-only"
    user_service_url: str = "http://user-service:8000"
    supplier_service_url: str = "http://supplier-service:8000"
    order_service_url: str = "http://order-service:8000"
    credit_service_url: str = "http://credit-service:8000"
    notification_service_url: str = "http://notification-service:8000"
    chat_service_url: str = "http://chat-service:8000"
    cors_allowed_origins: str = "http://localhost:5173"
    metrics_port: int = Field(default=9100, validation_alias="GATEWAY_METRICS_PORT")

    @property
    def allowed_origins(self) -> list[str]:
        """CORS_ALLOWED_ORIGINS as browsers send Origin: lowercase, no trailing slash."""
        origins = (o.strip().lower().rstrip("/") for o in self.cors_allowed_origins.split(","))
        return [o for o in origins if o]


settings = Settings()

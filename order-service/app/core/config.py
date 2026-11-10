# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Scope: Implemented Order runtime settings and configuration validation.
# Author review: I validated correctness and added boundary checks where needed.

"""Typed configuration; no credentials are embedded in the application."""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: SecretStr | None = None
    user_service_base_url: str | None = None
    supplier_service_base_url: str | None = None
    credit_service_base_url: str | None = None
    credit_service_secret: SecretStr | None = None
    # Must equal Admin Service's ORDER_SERVICE_SECRET. Only Admin Service may move errands into
    # or out of DISPUTED through /v1/internal routes.
    admin_service_secret: SecretStr | None = None
    dependency_timeout_seconds: float = Field(default=2, gt=0, le=10)
    recovery_interval_seconds: float = Field(default=5, gt=0, le=60)
    recovery_batch_size: int = Field(default=50, ge=1, le=100)
    expiry_interval_seconds: float = Field(default=5, gt=0, le=30)
    expiry_batch_size: int = Field(default=50, ge=1, le=100)
    rabbitmq_url: SecretStr | None = None
    outbox_exchange_name: str = Field(default="foc.events", min_length=1, max_length=255)
    outbox_poll_interval_seconds: float = Field(default=1, gt=0, le=30)
    outbox_publish_timeout_seconds: float = Field(default=5, gt=0, le=10)
    outbox_lease_seconds: float = Field(default=30, ge=10, le=300)

    @model_validator(mode="after")
    def publication_lease(self):
        if self.outbox_lease_seconds <= 2 * self.outbox_publish_timeout_seconds:
            raise ValueError("Outbox lease must exceed publication and cleanup timeouts combined")
        return self

    @field_validator(
        "user_service_base_url", "supplier_service_base_url", "credit_service_base_url"
    )
    @classmethod
    def service_origin(cls, value):
        if not value or not value.strip():
            return None
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise ValueError("Service URLs must be HTTP(S) origins without credentials or paths")
        return value.rstrip("/")

    @field_validator("credit_service_secret", "admin_service_secret", mode="before")
    @classmethod
    def blank_credit_secret(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("database_url", "rabbitmq_url", mode="before")
    @classmethod
    def blank_database_url(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Implemented typed service settings for the database, User and Order integrations.
# Author review: I validated correctness and supplied additional boundary checks.

"""Typed configuration; no credentials are embedded in the application."""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
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
    order_service_base_url: str | None = None
    # Must equal Order's ADMIN_SERVICE_SECRET: Order accepts dispute changes only from Admin.
    order_service_secret: SecretStr | None = None
    dependency_timeout_seconds: float = Field(default=2, gt=0, le=10)

    @field_validator("user_service_base_url", "order_service_base_url")
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

    @field_validator("database_url", "order_service_secret", mode="before")
    @classmethod
    def blank_is_unset(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

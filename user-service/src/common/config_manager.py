# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Added the RabbitMQ setting used by registration-event publication
# Author review: I reviewed correctness and edited the changes to fit the project

from pathlib import Path
from typing import Literal

from pydantic import SecretStr, EmailStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Campus Errands User Service"
    database_url: SecretStr | None = None
    rabbitmq_url: SecretStr | None = None
    initial_admin_username: str | None = None
    initial_admin_email: EmailStr | None = None
    initial_admin_password: SecretStr | None = None
    access_token_secret: SecretStr | None = None
    access_token_duration_seconds: int = 6 * 60 * 60
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

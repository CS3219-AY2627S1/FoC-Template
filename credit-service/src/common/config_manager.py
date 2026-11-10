# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-06
# Scope: Generated the initial environment-settings loader for Credit Service
# Author review: I reviewed correctness and edited the changes to fit the project

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Campus Errands Credit Service"
    database_url: SecretStr | None = None
    rabbitmq_url: SecretStr | None = None
    internal_gateway_url: str | None = None
    initial_credit_allocation: int = Field(default=100, ge=1, le=9_223_372_036_854_775_807)

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

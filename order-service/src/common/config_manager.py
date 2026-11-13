from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Campus Errands Order Service"
    database_url: SecretStr | None = None
    rabbitmq_url: SecretStr | None = None
    internal_gateway_url: str | None = None
    credit_result_timeout_seconds: int = Field(default=60, ge=5)
    # One countdown for OPEN, fulfilment progress and credit settlement.
    timeout_duration: int = Field(default=900, ge=1)

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


settings = Settings()

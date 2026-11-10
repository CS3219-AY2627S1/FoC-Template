from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Campus Errands Order Service"
    database_url: SecretStr | None = None
    rabbitmq_url: SecretStr | None = None
    internal_gateway_url: str | None = None
    credit_result_timeout_seconds: int = Field(default=60, ge=5)
    order_init_timeout_seconds: int = Field(default=60, ge=1)
    # Specific overrides take precedence over the shared countdown duration.
    order_settlement_timeout_seconds: int = Field(
        default=900, ge=1,
        validation_alias=AliasChoices('ORDER_SETTLEMENT_TIMEOUT_SECONDS', 'TIMEOUT_DURATION'),
    )
    order_open_timeout_seconds: int = Field(
        default=900, ge=1,
        validation_alias=AliasChoices('ORDER_OPEN_TIMEOUT_SECONDS', 'TIMEOUT_DURATION'),
    )
    order_progress_timeout_seconds: int = Field(
        default=900, ge=1,
        validation_alias=AliasChoices('ORDER_PROGRESS_TIMEOUT_SECONDS', 'TIMEOUT_DURATION'),
    )

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


settings = Settings()

from typing import Literal
from pydantic import AnyHttpUrl, Field, PostgresDsn, field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "production"

    database_url: PostgresDsn

    user_service_url: AnyHttpUrl

    auth_timeout_seconds: float = Field(
        default=3.0,
        gt=0,
        allow_inf_nan=False,
    )

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    @model_validator(mode="after")
    def require_production_https(self) -> "Settings":
        if self.app_env == "production" and self.user_service_url.scheme != "https":
            raise ValueError("USER_SERVICE_URL must use HTTPS when APP_ENV is production")
        return self

    @field_validator("database_url", mode="after")
    @classmethod
    def require_psycopg_driver(cls, value: PostgresDsn) -> PostgresDsn:
        # Inspect value.scheme, if it is not our chosen PostgreSQL/Psycopg scheme, raise ValueError with a message naming the required scheme
        if value.scheme != "postgresql+psycopg":
            raise ValueError(
                "DATABASE_URL must use the postgresql+psycopg scheme"
            )

        # Return the validated URL
        return value

# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Added SES provider settings and email configuration validation.
# Author review: I validated correctness and added boundary checks where needed.

# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented service settings for startup, registration, sessions, role guards,
# publishing, and Chat.
# Author review: I validated correctness and added boundary checks where needed.

"""Typed, local-file-aware service configuration."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Configuration kept outside application source and container images."""

    model_config = SettingsConfigDict(
        env_file=SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    app_name: str = "foc-user-service"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    database_url: str | None = None
    jwt_private_key_path: Path | None = None
    jwt_public_key_path: Path | None = None
    jwt_issuer: str = "foc-user-service"
    jwt_audience: str = "foc-services"
    jwt_access_token_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    jwt_refresh_token_ttl_seconds: int = Field(default=86_400, ge=300, le=2_592_000)
    jwt_session_idle_timeout_seconds: int = Field(default=1_800, ge=60, le=1_800)
    otp_hmac_secret: SecretStr | None = None
    chat_service_shared_secret: SecretStr | None = None
    supplier_service_shared_secret: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "SUPPLIER_SERVICE_SHARED_SECRET",
            "INTERNAL_SERVICE_SECRET",
        ),
    )
    rabbitmq_url: SecretStr | None = None
    outbox_exchange_name: str = "foc.events"
    outbox_poll_interval_seconds: float = Field(default=1.0, ge=0.1, le=60.0)
    outbox_lease_seconds: int = Field(default=30, ge=5, le=300)
    outbox_retry_initial_delay_seconds: int = Field(default=1, ge=1, le=60)
    outbox_retry_max_delay_seconds: int = Field(default=60, ge=1, le=3600)
    bootstrap_super_admin_username: str | None = None
    bootstrap_super_admin_email: str | None = None
    bootstrap_super_admin_password: SecretStr | None = None
    bootstrap_super_admin_display_name: str | None = None
    otp_ttl_seconds: int = Field(default=600, ge=60, le=3600)
    otp_max_attempts: int = Field(default=5, ge=1, le=10)
    otp_max_resends: int = Field(default=3, ge=0, le=10)
    otp_resend_cooldown_seconds: int = Field(default=60, ge=0, le=3600)
    bcrypt_rounds: int = Field(default=12, ge=4, le=31)
    smtp_host: str = "127.0.0.1"
    smtp_port: int = Field(default=1025, ge=1, le=65535)
    smtp_from: str = "no-reply@foc.local"
    otp_email_provider: Literal["smtp", "ses"] = "smtp"
    ses_region: str | None = Field(default=None, pattern=r"^[a-z]{2}(?:-[a-z]+)+-\d+$")
    ses_from_address: str | None = None

    @field_validator("ses_region", "ses_from_address", mode="before")
    @classmethod
    def normalize_optional_email_configuration(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def validate_ses_configuration(self) -> Settings:
        if self.otp_email_provider == "ses":
            if not self.ses_region or not self.ses_from_address:
                raise ValueError("SES email requires SES_REGION and SES_FROM_ADDRESS.")
            try:
                self.ses_from_address = validate_email(
                    self.ses_from_address, check_deliverability=False
                ).normalized
            except EmailNotValidError:
                raise ValueError("SES_FROM_ADDRESS must be a valid sender email address.") from None
        return self

    @field_validator("database_url", mode="before")
    @classmethod
    def empty_database_url_is_unconfigured(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("jwt_private_key_path", "jwt_public_key_path", mode="before")
    @classmethod
    def resolve_jwt_key_path(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        path = Path(value)
        return path if path.is_absolute() else SERVICE_ROOT / path

    @field_validator(
        "otp_hmac_secret",
        "chat_service_shared_secret",
        "bootstrap_super_admin_password",
        "rabbitmq_url",
        mode="before",
    )
    @classmethod
    def empty_secret_is_unconfigured(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator(
        "bootstrap_super_admin_username",
        "bootstrap_super_admin_email",
        "bootstrap_super_admin_display_name",
        mode="before",
    )
    @classmethod
    def empty_bootstrap_value_is_unconfigured(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    """Return one immutable settings instance for the running process."""

    return Settings()

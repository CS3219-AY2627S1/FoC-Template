# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""Typed configuration; no credentials are embedded in the application."""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_RETENTION_NOTICE = (
    "When recording stops, either when you stop it or automatically at 60 seconds, your audio "
    "is sent to OpenAI to transcribe it and draft your errand. OpenAI may keep API data for up "
    "to 30 days to detect abuse and does not use it to train its models. FoC does not store "
    "your recording."
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    environment: Literal["development", "test", "production"] = "development"
    user_service_base_url: str | None = None
    supplier_service_base_url: str | None = None
    dependency_timeout_seconds: float = Field(default=2, gt=0, le=10)

    # "fake" returns a canned draft without any provider call, for UI work and demos.
    voice_assist_provider: Literal["openai", "fake"] = "openai"
    openai_api_key: SecretStr | None = None
    voice_assist_transcribe_model: str = "gpt-4o-mini-transcribe"
    voice_assist_draft_model: str = "gpt-4.1-mini"
    # N3NFR2.1: the browser waits 30 s, so the server gives up first.
    voice_assist_transcribe_timeout_seconds: float = Field(default=12, gt=0, le=30)
    voice_assist_draft_timeout_seconds: float = Field(default=12, gt=0, le=30)
    voice_assist_total_timeout_seconds: float = Field(default=25, gt=0, le=29)
    voice_assist_max_audio_bytes: int = Field(default=2_000_000, gt=0, le=10_000_000)
    # N3NFR4.1: per-requester sliding window plus a platform-wide daily cap.
    voice_assist_user_limit: int = Field(default=10, ge=1)
    voice_assist_user_window_seconds: int = Field(default=600, ge=1)
    voice_assist_daily_limit: int = Field(default=500, ge=1)
    voice_assist_retention_notice: str = DEFAULT_RETENTION_NOTICE

    @field_validator("user_service_base_url", "supplier_service_base_url")
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

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def blank_is_unset(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @property
    def provider_configured(self) -> bool:
        return self.voice_assist_provider == "fake" or self.openai_api_key is not None


@lru_cache
def get_settings() -> Settings:
    return Settings()

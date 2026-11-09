# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration.

    Variables shared with the rest of FoC keep their repo-wide names
    (``DATABASE_URL``, ``RABBITMQ_URL``, ``JWT_SECRET``, ``LOG_LEVEL``,
    ``ORDER_EVENTS_EXCHANGE``). Chat-specific knobs start with ``CHAT_``.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "chat-service"
    log_level: str = "info"
    database_url: str = "postgresql+asyncpg://foc:foc@chat-db:5432/chat_db"

    # RabbitMQ. When unset the service runs single-instance: socket fan-out stays
    # in-process and outbox events are logged instead of published.
    rabbitmq_url: str | None = None
    chat_fanout_exchange: str = "foc.chat.fanout"  # cross-instance delivery to sockets
    chat_events_exchange: str = "foc.chat.events"  # domain events (outbox) for other services

    # Who is the caller?
    #   gateway: trust the X-User-Id header injected by the API gateway (FoC default).
    #   jwt:     verify a bearer JWT here (running the service on its own).
    chat_auth_mode: Literal["gateway", "jwt"] = "gateway"
    jwt_secret: str = "change-me-in-dev-only"
    jwt_algorithm: str = "HS256"

    # Comma-separated keys accepted in X-Service-Key on /internal routes (allows rotation).
    chat_service_keys: str = "change-me-chat-service-key"

    # WebSocket tickets: one-time, short-lived credentials for opening /chat/ws.
    chat_ws_ticket_ttl_s: int = 30
    # Sockets are closed with 4002 after this long so clients re-authenticate
    # (fetch a new ticket with a still-valid login). 0 disables the limit.
    chat_ws_max_session_s: int = 3600

    # Optional integration: open/close conversations from order lifecycle events.
    chat_order_events_enabled: bool = False
    order_events_exchange: str = "foc.order.events"
    chat_order_events_queue: str = "chat-service.order-events"
    # Closed order chats are deleted this many days later. 0 keeps them forever.
    chat_closed_retention_days: int = 0  # 0 = keep closed chats

    # Photos. Stored in a private S3 bucket (in FoC the same bucket as proof-of-delivery
    # photos, under this prefix). Empty bucket = photo sharing switched off.
    chat_photo_bucket: str = ""
    chat_photo_region: str = "ap-southeast-1"
    chat_photo_prefix: str = "chat"
    # Uploads not sent within this time are deleted; and each user may hold at most
    # this many uploaded-but-unsent photos.
    chat_photo_unsent_ttl_s: int = 3600
    chat_photo_max_unsent: int = 10

    # Tuning (defaults are fine for FoC).
    send_rate_per_s: float = 10.0
    send_burst: int = 20
    max_rate_violations: int = 20  # close with 4008 after this many rejected frames
    outbound_queue_size: int = 1000  # per socket; a slower client gets disconnected
    max_body_length: int = 4000
    history_page_max: int = 100
    typing_min_interval_s: float = 1.0
    outbox_poll_interval_s: float = 1.0
    outbox_batch_size: int = 100
    purge_interval_s: float = 60.0

    @property
    def service_key_set(self) -> set[str]:
        return {k.strip() for k in self.chat_service_keys.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()

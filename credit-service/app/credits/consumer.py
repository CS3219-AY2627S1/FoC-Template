# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-15
# Scope: Implemented the RabbitMQ event consumer with deduplication, delayed retries and dead-
# lettering; kept retrying while the database is unreachable.
# Author review: I validated correctness and supplied additional boundary checks.

"""RabbitMQ consumer: inbox dedupe, delayed retries and a dead-letter queue."""

import asyncio
import json
import logging
import time

import aio_pika
from asyncpg import PostgresError
from asyncpg.exceptions import AdminShutdownError, CannotConnectNowError, PostgresConnectionError
from pydantic import ValidationError
from sqlalchemy.exc import InterfaceError, OperationalError, SQLAlchemyError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from app.core.config import Settings, get_settings
from app.credits.errors import CreditError
from app.credits.ledger import CreditLedger
from app.credits.schemas import OrderTerminal, UserRegistered
from app.db import Database, DatabaseUnavailableError

logger = logging.getLogger("foc.credit.consumer")

EVENT_TYPES = (
    "user.registered.v1",
    "order.completed.v1",
    "order.cancelled.v1",
    "order.expired.v1",
    "order.failed.v1",
)
ATTEMPT_HEADER = "x-foc-attempt"
TEMPORARY = (SQLAlchemyError, PostgresError, DatabaseUnavailableError, OSError, TimeoutError)
# The database cannot be reached right now (down, restarting, pool exhausted, not configured).
# Retried for as long as the outage lasts and never dead-lettered, so an interruption needs no
# manual replay (M6NFR1.3). Other storage errors stay bounded by CONSUMER_MAX_ATTEMPTS.
UNREACHABLE = (
    OSError,
    TimeoutError,
    DatabaseUnavailableError,
    PoolTimeoutError,
    OperationalError,
    InterfaceError,
    PostgresConnectionError,
    CannotConnectNowError,
    AdminShutdownError,
)


def unreachable(error: BaseException | None) -> bool:
    """True when the error, or one it wraps, means the database could not be reached."""
    for _ in range(5):
        if error is None:
            return False
        if isinstance(error, UNREACHABLE) or getattr(error, "connection_invalidated", False):
            return True
        error = getattr(error, "orig", None) or error.__cause__
    return False


class InvalidEvent(Exception):
    code = "INVALID_EVENT"
    retryable = False


def parse_event(body: bytes, amqp_type: str | None) -> UserRegistered | OrderTerminal:
    """Producers set AMQP type == eventType; the retry hop changes routing keys, not type."""
    try:
        data = json.loads(body)
    except ValueError:
        raise InvalidEvent() from None
    event_type = data.get("eventType") if isinstance(data, dict) else None
    if event_type is None or event_type != amqp_type or event_type not in EVENT_TYPES:
        raise InvalidEvent()
    model = UserRegistered if event_type == "user.registered.v1" else OrderTerminal
    try:
        return model.model_validate(data)
    except ValidationError:
        raise InvalidEvent() from None


def queue_names(settings: Settings) -> tuple[str, str, str]:
    main = settings.consumer_queue_name
    return main, f"{main}.retry", f"{main}.dlq"


async def declare_topology(channel, settings: Settings):
    main, retry, dlq = queue_names(settings)
    exchange = await channel.declare_exchange(
        settings.event_exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
    )
    queue = await channel.declare_queue(main, durable=True)
    for event_type in EVENT_TYPES:
        await queue.bind(exchange, routing_key=event_type)
    # Expired retry messages are dead-lettered via the default exchange back to the main queue.
    await channel.declare_queue(
        retry,
        durable=True,
        arguments={
            "x-message-ttl": int(settings.consumer_retry_delay_seconds * 1000),
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": main,
        },
    )
    await channel.declare_queue(dlq, durable=True)
    return queue


def _attempt(message) -> int:
    value = (message.headers or {}).get(ATTEMPT_HEADER, 1)
    return value if isinstance(value, int) and value >= 1 else 1


def _entity(event) -> object:
    return event.user_id if isinstance(event, UserRegistered) else event.order_id


class EventProcessor:
    def __init__(self, ledger, settings: Settings, channel):
        self.ledger = ledger
        self.settings = settings
        self.channel = channel

    async def dispatch(self, event, attempt: int) -> str:
        if isinstance(event, UserRegistered):
            return await self.ledger.allocate_initial(event, attempt)
        return await self.ledger.settle(event, attempt)

    async def handle(self, message) -> None:
        attempt = _attempt(message)
        started = time.monotonic()
        event = None
        try:
            event = parse_event(message.body, message.type)
            outcome = await self.dispatch(event, attempt)
        except (InvalidEvent, CreditError) as error:
            await self._fail(message, event, attempt, error.code, retry=error.retryable)
            return
        except TEMPORARY as error:
            if unreachable(error):
                await self._fail(
                    message, event, attempt, "STORAGE_UNAVAILABLE", retry=True, bounded=False
                )
            else:
                await self._fail(message, event, attempt, "STORAGE_ERROR", retry=True)
            return
        # Ack only after the ledger transaction committed (or the event was a known duplicate).
        await message.ack()
        logger.info(
            "event processed event_id=%s type=%s entity_id=%s outcome=%s attempt=%s "
            "duration_ms=%d",
            event.event_id,
            event.event_type,
            _entity(event),
            outcome,
            attempt,
            (time.monotonic() - started) * 1000,
        )

    async def _fail(
        self, message, event, attempt: int, code: str, *, retry: bool, bounded: bool = True
    ) -> None:
        dead = not retry or (bounded and attempt >= self.settings.consumer_max_attempts)
        _, retry_queue, dlq = queue_names(self.settings)
        # Publisher confirms: the copy is durable in RabbitMQ before the original is acked.
        await self.channel.default_exchange.publish(
            aio_pika.Message(
                body=message.body,
                headers={
                    **(message.headers or {}),
                    ATTEMPT_HEADER: attempt if dead else attempt + 1,
                    "x-foc-error": code,
                },
                message_id=message.message_id,
                type=message.type,
                content_type=message.content_type,
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=dlq if dead else retry_queue,
        )
        await message.ack()
        logger.warning(
            "event %s event_id=%s type=%s attempt=%s error=%s",
            "dead-lettered" if dead else "scheduled for retry",
            event.event_id if event else message.message_id,
            message.type,
            attempt,
            code,
        )
        try:
            await self.ledger.record_failure(
                event_id=event.event_id if event else None,
                event_type=event.event_type if event else message.type,
                entity_id=_entity(event) if event else None,
                attempt=attempt,
                error_code=code,
                dead_lettered=dead,
            )
        except TEMPORARY:
            logger.warning("failure record unavailable message_id=%s", message.message_id)


async def run(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if settings.initial_credit_allocation is None:
        raise SystemExit("Set INITIAL_CREDIT_ALLOCATION to the team-agreed value first.")
    if settings.rabbitmq_url is None:
        raise SystemExit("Set RABBITMQ_URL before starting the Credit consumer.")
    database = Database(settings.database_url.get_secret_value() if settings.database_url else None)
    ledger = CreditLedger(database.session_context, settings.initial_credit_allocation)
    try:
        while True:
            try:
                connection = await aio_pika.connect(settings.rabbitmq_url.get_secret_value())
                async with connection:
                    channel = await connection.channel(publisher_confirms=True)
                    await channel.set_qos(prefetch_count=settings.consumer_prefetch)
                    queue = await declare_topology(channel, settings)
                    processor = EventProcessor(ledger, settings, channel)
                    logger.info("consumer ready queue=%s", settings.consumer_queue_name)
                    async with queue.iterator() as messages:
                        async for message in messages:
                            await processor.handle(message)
            except (OSError, aio_pika.exceptions.AMQPException):
                logger.warning("broker unavailable; reconnecting")
            await asyncio.sleep(2)
    finally:
        await database.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass

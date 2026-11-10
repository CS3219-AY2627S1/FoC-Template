# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Implemented the credit-replay-dlq command for replaying dead-lettered events.
# Author review: I validated correctness and supplied additional boundary checks.

"""Operator command: replay dead-lettered events once their cause has been fixed.

A dead-lettered event is never lost: it waits in credit-service.events.dlq and is recorded in
credit_service.event_failures. Replaying moves it back to the main queue as a first attempt.
Replaying is safe to repeat: the consumer's processed_events inbox ignores duplicates.
"""

import argparse
import asyncio
import json
import sys

import aio_pika

from app.core.config import Settings, get_settings
from app.credits.consumer import ATTEMPT_HEADER, declare_topology, queue_names

ERROR_HEADER = "x-foc-error"


def replay_copy(message) -> aio_pika.Message:
    """The same event as a fresh first attempt: unchanged body, type and message ID."""
    headers = {
        key: value
        for key, value in (message.headers or {}).items()
        if key not in (ATTEMPT_HEADER, ERROR_HEADER)
    }
    headers[ATTEMPT_HEADER] = 1
    return aio_pika.Message(
        body=message.body,
        headers=headers,
        message_id=message.message_id,
        type=message.type,
        content_type=message.content_type,
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
    )


def describe(message) -> str:
    try:
        event = json.loads(message.body)
    except ValueError:
        event = {}
    if not isinstance(event, dict):
        event = {}
    headers = message.headers or {}
    return (
        f"event_id={event.get('eventId', message.message_id)} type={message.type} "
        f"attempts={headers.get(ATTEMPT_HEADER)} error={headers.get(ERROR_HEADER)}"
    )


async def replay(settings: Settings, *, limit: int | None, list_only: bool, out=sys.stdout):
    """Replay (or only list) up to `limit` dead-lettered events; returns how many."""
    if settings.rabbitmq_url is None:
        raise SystemExit("Set RABBITMQ_URL before replaying dead-lettered events.")
    main, _, dlq = queue_names(settings)
    connection = await aio_pika.connect(settings.rabbitmq_url.get_secret_value())
    async with connection:
        channel = await connection.channel(publisher_confirms=True)
        await declare_topology(channel, settings)
        queue = await channel.declare_queue(dlq, durable=True)
        waiting = queue.declaration_result.message_count
        target = waiting if limit is None else min(limit, waiting)
        action = "listing" if list_only else "replaying"
        print(f"{dlq}: {waiting} message(s); {action} {target}", file=out)
        handled = 0
        while handled < target:
            message = await queue.get(no_ack=False, fail=False)
            if message is None:
                break
            print(f"  {describe(message)}", file=out)
            handled += 1
            if list_only:
                continue  # Left unacknowledged: RabbitMQ requeues it when the channel closes.
            # Publisher confirms: the copy is durable in the main queue before the DLQ ack.
            await channel.default_exchange.publish(replay_copy(message), routing_key=main)
            await message.ack()
    return handled


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="credit-replay-dlq",
        description="Replay dead-lettered Credit events after their cause has been fixed.",
    )
    parser.add_argument("--list", action="store_true", help="only list them; move nothing")
    parser.add_argument("--limit", type=int, default=None, help="handle at most N messages")
    args = parser.parse_args()
    asyncio.run(replay(get_settings(), limit=args.limit, list_only=args.list))

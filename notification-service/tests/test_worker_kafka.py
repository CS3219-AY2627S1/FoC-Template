# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — write worker tests against a real Kafka broker for records near and past the DLQ size limit (ai-20261106-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-001).
# Details: notification-service/ai/usage-log.md; ai-20261106-001

"""Worker tests against a real Kafka broker. No database is needed.

Set TEST_KAFKA_BOOTSTRAP_SERVERS to a disposable broker on which
event-broker/create-topics.sh has run. See "Running tests" in the README. Each test
uses its own source topic and consumer group, and writes to the real DLQ topic.
"""

import logging
import os
import threading
from dataclasses import replace
from uuid import uuid4

import pytest
from confluent_kafka import Consumer, KafkaError, Producer, TopicPartition
from confluent_kafka.admin import AdminClient, ConfigResource, NewTopic

from app import worker
from app.worker import DLQ_TOPIC, WorkerAbort, make_consumer, run
from tests.worker_support import make_settings

BOOTSTRAP = os.getenv("TEST_KAFKA_BOOTSTRAP_SERVERS")
# Nothing listens here. The records in these tests never reach the database.
UNREACHABLE_DB = "postgresql+psycopg://nobody@127.0.0.1:1/none"
TIMEOUT_SECONDS = 30
HEADERS = [("origin", b"kept"), ("empty", None)]

pytestmark = pytest.mark.skipif(
    not BOOTSTRAP,
    reason="Set TEST_KAFKA_BOOTSTRAP_SERVERS to run real-broker worker tests",
)


@pytest.fixture
def source_topic(monkeypatch):
    """A one-partition source topic with the broker's default limits."""

    name = f"test.order-events.{uuid4().hex}"
    admin = AdminClient({"bootstrap.servers": BOOTSTRAP})
    admin.create_topics([NewTopic(name, num_partitions=1, replication_factor=1)])[
        name
    ].result(TIMEOUT_SECONDS)
    monkeypatch.setattr(worker, "ORDER_TOPIC", name)
    monkeypatch.setattr(worker, "CONSUMER_GROUP", f"test-{uuid4().hex}")
    yield name
    admin.delete_topics([name])[name].result(TIMEOUT_SECONDS)


def produce(topic: str, value: bytes, *, key=None, headers=None, **config) -> int:
    """Produce one record to partition 0, and return its offset."""

    producer = Producer({"bootstrap.servers": BOOTSTRAP, **config})
    delivered = {}

    def on_delivery(error, message):
        delivered.update(error=error, offset=message.offset())

    producer.produce(
        topic, key=key, value=value, headers=headers, partition=0, on_delivery=on_delivery
    )
    assert producer.flush(TIMEOUT_SECONDS) == 0
    assert delivered["error"] is None
    return delivered["offset"]


class StopAfterCommits:
    """A real consumer that sets ``stop`` once it has committed ``commits`` times."""

    def __init__(self, consumer, stop: threading.Event, commits: int) -> None:
        self._consumer = consumer
        self._stop = stop
        self._remaining = commits

    def poll(self, timeout: float):
        return self._consumer.poll(timeout)

    def commit(self, *, message, asynchronous):
        self._consumer.commit(message=message, asynchronous=asynchronous)
        self._remaining -= 1
        if not self._remaining:
            self._stop.set()

    def close(self) -> None:
        self._consumer.close()


def run_worker(commits: int) -> None:
    """Run the real consumer and producer. A timer stops a run that makes no progress."""

    settings = replace(make_settings(UNREACHABLE_DB), kafka_bootstrap_servers=BOOTSTRAP)
    stop = threading.Event()
    timer = threading.Timer(TIMEOUT_SECONDS, stop.set)
    timer.start()
    try:
        consumer = StopAfterCommits(make_consumer(settings), stop, commits)
        run(settings, stop, consumer)
        assert consumer._remaining == 0, "the worker timed out before committing"
    finally:
        timer.cancel()


def committed_offset(topic: str) -> int:
    """The group's next offset to read, or a negative value if it never committed."""

    consumer = Consumer({"bootstrap.servers": BOOTSTRAP, "group.id": worker.CONSUMER_GROUP})
    try:
        partitions = consumer.committed([TopicPartition(topic, 0)], timeout=TIMEOUT_SECONDS)
    finally:
        consumer.close()
    return partitions[0].offset


def dlq_records(source: str) -> list:
    """Every DLQ record copied from ``source``."""

    consumer = Consumer(
        {
            "bootstrap.servers": BOOTSTRAP,
            "group.id": f"test-reader-{uuid4().hex}",
            "enable.auto.commit": False,
        }
    )
    try:
        # Querying during the switch from the bootstrap connection can fail.
        consumer.list_topics(DLQ_TOPIC, timeout=TIMEOUT_SECONDS)
        partition = TopicPartition(DLQ_TOPIC, 0)
        low, high = consumer.get_watermark_offsets(partition, timeout=TIMEOUT_SECONDS)
        partition.offset = low
        consumer.assign([partition])
        found = []
        position = low
        while position < high:
            message = consumer.poll(TIMEOUT_SECONDS)
            assert message is not None, "timed out reading the DLQ"
            assert message.error() is None
            position = message.offset() + 1
            if (
                "x-notification-source-topic",
                source.encode(),
            ) in (message.headers() or []):
                found.append(message)
        return found
    finally:
        consumer.close()


class _FixedMessage:
    """Just what dead_letter reads from a record."""

    def __init__(self, topic: str, value: bytes) -> None:
        self._topic = topic
        self._value = value

    def key(self):
        return None

    def value(self):
        return self._value

    def headers(self):
        return None

    def topic(self):
        return self._topic

    def partition(self):
        return 0

    def offset(self):
        return 0


def test_dlq_topic_has_the_limit_the_producer_uses() -> None:
    """Fails if create-topics.sh has not run against this broker."""

    admin = AdminClient({"bootstrap.servers": BOOTSTRAP})
    resource = ConfigResource(ConfigResource.Type.TOPIC, DLQ_TOPIC)
    config = admin.describe_configs([resource])[resource].result(TIMEOUT_SECONDS)

    assert int(config["max.message.bytes"].value) == worker.DLQ_MAX_MESSAGE_BYTES


@pytest.mark.parametrize(
    ("size", "client_config"),
    [
        # Fits a default client's limit only without the diagnostic headers.
        pytest.param(999_900, {}, id="near-the-default-client-limit"),
        # Fits the broker's default limit only without the diagnostic headers.
        pytest.param(
            1_048_450, {"message.max.bytes": 2_000_000}, id="near-the-broker-limit"
        ),
    ],
)
def test_largest_uncompressed_records_reach_the_dlq_and_do_not_block(
    source_topic, size, client_config
) -> None:
    value = b"x" * size
    bad = produce(source_topic, value, key=b"k", headers=HEADERS, **client_config)
    later = produce(source_topic, b"also malformed")

    run_worker(commits=2)

    assert committed_offset(source_topic) == later + 1
    copied, next_record = dlq_records(source_topic)
    assert copied.key() == b"k"
    assert copied.value() == value
    headers = copied.headers()
    assert headers[:2] == HEADERS
    assert ("x-notification-failure-code", b"MALFORMED_MESSAGE") in headers
    assert ("x-notification-source-offset", str(bad).encode()) in headers
    assert ("x-notification-source-partition", b"0") in headers
    assert next_record.value() == b"also malformed"


def test_compressed_record_too_large_for_the_dlq_stops_without_committing(
    source_topic, caplog
) -> None:
    """The documented limit: the broker only checked this record's compressed size."""

    produce(
        source_topic,
        b"x" * 5_000_000,
        **{"message.max.bytes": 10_000_000, "compression.type": "gzip"},
    )
    produce(source_topic, b"later")

    with caplog.at_level(logging.ERROR), pytest.raises(WorkerAbort):
        run_worker(commits=1)

    assert any(
        getattr(record, "event", None) == "message_dlq_publish_failed"
        and record.fields.get("kafka_error") == "MSG_SIZE_TOO_LARGE"
        for record in caplog.records
    )
    assert committed_offset(source_topic) < 0
    assert dlq_records(source_topic) == []


def test_broker_rejection_is_reported_with_its_error_code(source_topic, caplog) -> None:
    """Past the client check, the broker refuses the record: the delivery report path."""

    message = _FixedMessage(source_topic, b"x" * 1_500_000)
    producer = Producer({"bootstrap.servers": BOOTSTRAP, "message.max.bytes": 2_000_000})
    publisher = worker.KafkaPublisher(producer)

    with pytest.raises(worker.KafkaException) as raised:
        publisher.dead_letter(message, failure_code="MALFORMED_MESSAGE", attempts=1)

    assert raised.value.args[0].code() == KafkaError.MSG_SIZE_TOO_LARGE
    assert dlq_records(source_topic) == []

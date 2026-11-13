"""Shared deadline durations; all enforcement uses the PostgreSQL clock."""

from datetime import timedelta

from common.config_manager import settings


def init_window() -> timedelta:
    # Initialization is a short technical timeout, not the order countdown.
    return timedelta(seconds=60)


def settlement_window() -> timedelta:
    return timedelta(seconds=settings.timeout_duration)


def open_window() -> timedelta:
    return timedelta(seconds=settings.timeout_duration)


def progress_window() -> timedelta:
    return timedelta(seconds=settings.timeout_duration)

"""Shared deadline durations; all enforcement uses the PostgreSQL clock."""

from datetime import timedelta

from common.config_manager import settings


def init_window() -> timedelta:
    return timedelta(seconds=settings.order_init_timeout_seconds)


def settlement_window() -> timedelta:
    return timedelta(seconds=settings.order_settlement_timeout_seconds)


def open_window() -> timedelta:
    return timedelta(seconds=settings.order_open_timeout_seconds)


def progress_window() -> timedelta:
    return timedelta(seconds=settings.order_progress_timeout_seconds)

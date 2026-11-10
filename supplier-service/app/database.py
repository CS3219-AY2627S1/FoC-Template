# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
# Scope: Implemented Supplier database connection reuse and cleanup.
# Author review: I validated correctness, and added boundary checks.

"""Shared PostgreSQL connection pool for Supplier API requests."""

import threading

from psycopg import Connection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool

POOL_MIN_SIZE = 1
POOL_MAX_SIZE = 10
# Seconds a request waits for a free or new connection before reporting 503.
POOL_TIMEOUT_SECONDS = 5

_pools: dict[str, ConnectionPool[Connection[DictRow]]] = {}
_pools_lock = threading.Lock()


def get_pool(database_url: str) -> ConnectionPool[Connection[DictRow]]:
    """Return the pool for this URL, opening it on first use.

    The pool opens in the background so the API still starts while the
    database is down; requests then fail with a pool timeout until it returns.
    """
    with _pools_lock:
        pool = _pools.get(database_url)
        if pool is None:
            pool = ConnectionPool(
                database_url,
                connection_class=Connection[DictRow],
                kwargs={
                    "connect_timeout": 5,
                    "row_factory": dict_row,
                    # Server-side prepared statements break behind a
                    # transaction-mode pooler such as Supabase's port 6543.
                    "prepare_threshold": None,
                },
                min_size=POOL_MIN_SIZE,
                max_size=POOL_MAX_SIZE,
                timeout=POOL_TIMEOUT_SECONDS,
                # Replace connections the server closed (restart, idle timeout)
                # before handing them to a request.
                check=ConnectionPool.check_connection,
                open=False,
            )
            pool.open(wait=False)
            _pools[database_url] = pool
        return pool


def close_pools() -> None:
    with _pools_lock:
        pools = list(_pools.values())
        _pools.clear()
    for pool in pools:
        pool.close()

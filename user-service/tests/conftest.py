"""Test-only environment defaults."""

import os


# Tests that need SQLite must opt into it explicitly; production code has no
# implicit database fallback.
os.environ.setdefault("DATABASE_URL", "sqlite://")

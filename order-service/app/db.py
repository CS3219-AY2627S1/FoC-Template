"""Database engine, ORM base, and request-scoped session helpers."""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import required_env


class Base(DeclarativeBase):
    """Base class for SQLAlchemy ORM models."""


def make_engine(database_url: str) -> Engine:
    """Create a synchronous engine. SQLite is for unit tests only."""

    kwargs: dict = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool
    return create_engine(database_url, **kwargs)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def database_url() -> str:
    return required_env("DATABASE_URL")


def get_db(request: Request) -> Iterator[Session]:
    """Yield a database session and close it after the request completes."""

    db: Session = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()

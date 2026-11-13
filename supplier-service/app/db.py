from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import Settings


class Base(DeclarativeBase):
    pass


def create_db_engine(settings: Settings) -> Engine:
    return create_engine(str(settings.database_url), pool_pre_ping=True)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine)
    


def get_db(request: Request) -> Iterator[Session]:
    # Application startup will populate this attribute in our next file.
    session_factory = request.app.state.session_factory

    with session_factory() as session:
        yield session
    
import asyncio
import csv
import datetime
import json
import logging
import os
from collections.abc import AsyncIterator, Iterable, Iterator
from contextlib import asynccontextmanager
from enum import Enum
from functools import lru_cache
from itertools import islice
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import aio_pika
import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from common.logging_config import (
    RequestLoggingMiddleware,
    configure_logging,
    propagate_request_id,
    unexpected_error_handler,
)

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class Category(str, Enum):
    Food = "Food"
    Shopping = "Shopping"
    Printing = "Printing"
    Food_Coffee = "Food/Coffee"


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str]
    category: Mapped[Category]
    building: Mapped[str]
    floor: Mapped[int]
    description: Mapped[str]
    lattitude: Mapped[float]
    longitude: Mapped[float]
    startingTime: Mapped[datetime.time]
    closingTime: Mapped[datetime.time]
    imageUrl: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[UUID | None] = mapped_column(default=None)
    updated_by: Mapped[UUID | None] = mapped_column(default=None)
    deleted_by: Mapped[UUID | None] = mapped_column(default=None)

def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} must be set")
    return value


@lru_cache
def get_engine() -> AsyncEngine:
    """Create and reuse the service's asynchronous PostgreSQL connection pool."""
    database_url = get_required_env("DATABASE_URL")

    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        hide_parameters=True,
        connect_args={"connect_timeout": 5},
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    """Provide one asynchronous database session per request."""
    session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with session_factory() as session:
        yield session


class SupplierCsvRow(BaseModel):
    """Validated representation of a supplier row in the seed CSV."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(validation_alias="Name")
    category: Category = Field(validation_alias="Type")
    building: str = Field(validation_alias="Building")
    floor: int = Field(validation_alias="Floor")
    description: str = Field(validation_alias="Location Description")
    lattitude: float = Field(validation_alias="Latitude")
    longitude: float = Field(validation_alias="Longitude")
    startingTime: datetime.time = Field(validation_alias="StartingTime")
    closingTime: datetime.time = Field(validation_alias="ClosingTime")
    imageUrl: str | None = Field(validation_alias="ImageURL")

    @field_validator("startingTime", "closingTime", mode="before")
    @classmethod
    def parse_csv_time(cls, value: str) -> datetime.time:
        return datetime.datetime.strptime(value.strip(), "%H%Mhrs").time()

    @field_validator("imageUrl", mode="before")
    @classmethod
    def blank_image_url_is_none(cls, value: str) -> str | None:
        return value.strip() or None

    def to_supplier(self) -> Supplier:
        return Supplier(**self.model_dump())


def supplier_records(csv_path: Path) -> Iterator[Supplier]:
    """Validate CSV rows and convert them to Supplier entities."""
    with csv_path.open(newline="", encoding="cp1252") as file:
        for line_number, row in enumerate(csv.DictReader(file), start=2):
            try:
                yield SupplierCsvRow.model_validate(row).to_supplier()
            except ValidationError as error:
                raise ValueError(
                    f"Invalid supplier CSV data on line {line_number}"
                ) from error


def batches(records: Iterable[Supplier], size: int = 1_000) -> Iterator[list[Supplier]]:
    """Split an iterable into lists of at most ``size`` records."""
    iterator = iter(records)
    while batch := list(islice(iterator, size)):
        yield batch


async def seed_database_from_csv(engine: AsyncEngine, csv_path: Path) -> None:
    if not csv_path.is_file():
        logger.warning("Seed CSV not found; skipping seeding")
        return

    async with engine.begin() as connection:
        table_exists = await connection.run_sync(
            lambda sync_connection: inspect(sync_connection).has_table(
                Supplier.__tablename__
            )
        )
        if table_exists:
            logger.info("Suppliers table already exists; skipping seeding")
            return

        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        for batch in batches(supplier_records(csv_path)):
            session.add_all(batch)
        await session.commit()
    logger.info("Successfully seeded database from CSV file")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate required destinations before connecting to external dependencies.
    get_internal_gateway_url()
    rabbitmq_url = get_required_env("RABBITMQ_URL")
    csv_path = (
        Path(__file__).resolve().parent.parent
        / "data"
        / "csv"
        / "supplier-seed-data.csv"
    )
    engine = get_engine()
    await seed_database_from_csv(engine, csv_path)

    rmq_connection = None

    for attempt in range(10):
        try:
            rmq_connection = await aio_pika.connect_robust(rabbitmq_url)
            break
        except (ConnectionRefusedError, OSError):
            await asyncio.sleep(2)

    if not rmq_connection:
        raise RuntimeError("Could not connect to RabbitMQ")

    rmq_channel = await rmq_connection.channel()

    # declare fanout exchange
    await rmq_channel.declare_exchange("supplier_events", aio_pika.ExchangeType.FANOUT)

    app.state.rmq_connection = rmq_connection
    app.state.rmq_channel = rmq_channel
    logger.info("Successfully connected to RabbitMQ")

    yield
    await rmq_channel.close()
    await rmq_connection.close()
    await engine.dispose()


configure_logging("supplier-service")
app = FastAPI(title="Supplier Service", lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)
app.add_exception_handler(Exception, unexpected_error_handler)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "supplier-service"}

async def publish_supplier_event(channel: aio_pika.Channel, event_type: str, supplier_id: UUID) -> None:
    try:
        exchange = await channel.declare_exchange("supplier_events", aio_pika.ExchangeType.FANOUT)
        payload = json.dumps({
            "event": event_type,
            "supplier_id": str(supplier_id)
        })
        message = aio_pika.Message(
            body=payload.encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        await exchange.publish(message, routing_key="")
        logger.info(event_type, extra={"supplier_id": supplier_id})
    except Exception:
        logger.exception("Supplier event publication failed", extra={"supplier_id": supplier_id})


class SupplierResponse(BaseModel):
    """Public JSON representation of a supplier database record."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: Category
    building: str
    floor: int
    lattitude: float
    longitude: float
    description: str
    startingTime: datetime.time
    closingTime: datetime.time
    imageUrl: str | None

    @classmethod
    def parse(cls, supplier: Supplier) -> "SupplierResponse":
        return cls.model_validate(supplier)


@app.get("/suppliers")
async def get_suppliers(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SupplierResponse]:
    try:
        suppliers = await session.scalars(
            select(Supplier).where(Supplier.is_active)
        )
        return [SupplierResponse.parse(supplier) for supplier in suppliers.all()]
    except Exception as error:
        logger.exception("Could not retrieve suppliers")
        raise HTTPException(status_code=500, detail="Could not retrieve suppliers") from error


@app.get("/suppliers/{id}")
async def get_supplier(
        id: UUID,
        session: Annotated[AsyncSession, Depends(get_session)],
) -> SupplierResponse:
    try:
        supplier = await session.scalar(
            select(Supplier).where(Supplier.id == id, Supplier.is_active)
        )

        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )

        return SupplierResponse.parse(supplier)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Could not retrieve supplier", extra={"supplier_id": id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve supplier",
        ) from error



class AuthenticatedUser(BaseModel):
    user_id: UUID
    role: str


def get_internal_gateway_url() -> str:
    value = get_required_env("INTERNAL_GATEWAY_URL")
    message = "INTERNAL_GATEWAY_URL must be an HTTP(S) origin without credentials, a path, query, or fragment"
    try:
        url = AnyHttpUrl(value)
    except ValidationError as error:
        raise RuntimeError(message) from error
    if url.path not in {None, "", "/"} or any(
        part is not None for part in (url.username, url.password, url.query, url.fragment)
    ):
        raise RuntimeError(message)
    return str(url).rstrip("/")


async def get_internal_gateway_client() -> AsyncIterator[httpx.AsyncClient]:
    base_url = get_internal_gateway_url()
    async with httpx.AsyncClient(
        base_url=base_url, timeout=5.0, event_hooks={"request": [propagate_request_id]},
    ) as client:
        yield client


bearer_scheme = HTTPBearer(auto_error=False)


async def get_user(
    request: Request,
    client: Annotated[httpx.AsyncClient, Depends(get_internal_gateway_client)],
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Security(bearer_scheme)
    ],
) -> AuthenticatedUser:
    token = (
        credentials.credentials
        if credentials is not None
        else request.cookies.get("access_token")
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token found. Please sign in.",
        )

    try:
        response = await client.get(
            "/user-api/authentication/sessions/current",
            headers={"Authorization": f"Bearer {token}"},
        )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is temporarily unavailable.",
        ) from error

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please sign in.",
        )
    if not response.is_success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is temporarily unavailable.",
        )

    try:
        return AuthenticatedUser.model_validate(response.json())
    except (ValueError, ValidationError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication returned an invalid response.",
        ) from error


def require_admin(user: AuthenticatedUser) -> None:
    if user.role not in {"admin", "admin_manager"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


class SupplierCreate(BaseModel):
    name: str
    category: Category
    building: str
    floor: int
    description: str
    lattitude: float
    longitude: float
    startingTime: datetime.time
    closingTime: datetime.time
    imageUrl: str | None = None

    def to_supplier(self) -> Supplier:
        return Supplier(**self.model_dump())


@app.post("/suppliers", status_code=status.HTTP_201_CREATED)
async def create_supplier(
    user: Annotated[AuthenticatedUser, Depends(get_user)],
    create: SupplierCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SupplierResponse:
    require_admin(user)

    try:
        supplier = create.to_supplier()
        supplier.created_by = user.user_id
        session.add(supplier)
        await session.commit()
        await session.refresh(supplier)
        await publish_supplier_event(app.state.rmq_channel, "supplier.created", supplier.id)
        return SupplierResponse.parse(supplier)
    except Exception as error:
        logger.exception("Could not create supplier")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create supplier",
        ) from error


class SupplierUpdate(BaseModel):
    name: str | None = None
    category: Category | None = None
    building: str | None = None
    floor: int | None = None
    lattitude: float | None = None
    longitude: float | None = None
    description: str | None = None
    startingTime: datetime.time | None = None
    closingTime: datetime.time | None = None
    imageUrl: str | None = None


@app.patch("/suppliers/{id}")
async def update_supplier(
    id: UUID,
    user: Annotated[AuthenticatedUser, Depends(get_user)],
    update: SupplierUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SupplierResponse:
    require_admin(user)

    try:
        supplier = await session.scalar(select(Supplier).where(Supplier.id == id))
        if not supplier or not supplier.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )

        for key, value in update.model_dump(exclude_unset=True).items():
            setattr(supplier, key, value)
        supplier.updated_by = user.user_id

        await session.commit()
        await session.refresh(supplier)
        await publish_supplier_event(app.state.rmq_channel, "supplier.updated", supplier.id)
        return SupplierResponse.parse(supplier)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Could not update supplier", extra={"supplier_id": id})
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update supplier",
        ) from error


@app.delete("/suppliers/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    id: UUID,
    user: Annotated[AuthenticatedUser, Depends(get_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    require_admin(user)

    try:
        supplier = await session.scalar(select(Supplier).where(Supplier.id == id))
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )

        supplier.is_active = False
        supplier.deleted_by = user.user_id
        await session.commit()
        await publish_supplier_event(app.state.rmq_channel, "supplier.deleted", supplier.id)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Could not delete supplier", extra={"supplier_id": id})
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete supplier",
        ) from error

# AI-INFLUENCED: Verify shared image validation, private storage, and photo migration with Codex.
from __future__ import annotations

import importlib.util
from io import BytesIO
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from PIL import Image, PngImagePlugin
from sqlalchemy import create_engine, inspect, text

from foc_shared.images import (
    ImageStorageError,
    InvalidImageError,
    PrivateImageStore,
    validate_image,
)


def _png() -> bytes:
    output = BytesIO()
    Image.new("RGB", (2, 2), "red").save(output, format="PNG")
    return output.getvalue()


def test_image_validation_checks_actual_format_and_claimed_type():
    photo = validate_image(_png(), "image/png")
    assert photo.content_type == "image/png"
    with pytest.raises(InvalidImageError, match="does not match"):
        validate_image(_png(), "image/jpeg")
    with pytest.raises(InvalidImageError, match="not a valid image"):
        validate_image(b"not an image", "image/png")


def test_image_validation_removes_gps_and_keeps_exif_orientation():
    exif = Image.Exif()
    exif[274] = 6  # Rotate the phone photo upright before removing EXIF.
    exif[34853] = {1: "N", 2: (1.0, 2.0, 3.0), 3: "E", 4: (4.0, 5.0, 6.0)}
    source = BytesIO()
    Image.new("RGB", (3, 2), "red").save(source, format="JPEG", exif=exif)

    photo = validate_image(source.getvalue(), "image/jpeg")

    with Image.open(BytesIO(photo.data)) as stored:
        assert stored.size == (2, 3)
        assert not stored.getexif()
        assert "exif" not in stored.info


def test_image_validation_removes_png_text_metadata():
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Location", "courier GPS coordinates")
    source = BytesIO()
    Image.new("RGB", (2, 2), "red").save(source, format="PNG", pnginfo=metadata)

    photo = validate_image(source.getvalue(), "image/png")

    with Image.open(BytesIO(photo.data)) as stored:
        assert "Location" not in stored.info
        assert stored.getpixel((0, 0)) == (255, 0, 0)


def test_image_validation_removes_webp_metadata_and_preserves_alpha():
    source = BytesIO()
    exif = Image.Exif()
    exif[270] = "private-location"
    Image.new("RGBA", (2, 2), (255, 0, 0, 0)).save(source, format="WEBP", lossless=True, exif=exif)

    photo = validate_image(source.getvalue(), "image/webp")

    with Image.open(BytesIO(photo.data)) as stored:
        assert "exif" not in stored.info
        assert stored.getpixel((0, 0))[3] == 0


async def test_private_storage_upload_read_and_delete():
    stored = {}

    class FakeS3:
        def put_object(self, **kwargs):
            stored[kwargs["Key"]] = kwargs

        def get_object(self, **kwargs):
            item = stored[kwargs["Key"]]
            return {"Body": BytesIO(item["Body"]), "ContentType": item["ContentType"]}

        def delete_object(self, **kwargs):
            stored.pop(kwargs["Key"])

    store = PrivateImageStore("private-photos", "ap-southeast-1")
    store._client = FakeS3()
    photo = validate_image(_png(), "image/png")
    key = await store.upload("proof-of-delivery/order-1", photo)
    assert key.startswith("proof-of-delivery/order-1/")
    assert stored[key]["Bucket"] == "private-photos"
    assert await store.get(key) == photo
    await store.delete(key)
    assert stored == {}
    with pytest.raises(ImageStorageError):
        await PrivateImageStore("", "ap-southeast-1").upload("proof", photo)


async def test_private_storage_read_sanitizes_preexisting_photo():
    exif = Image.Exif()
    exif[34853] = {1: "N", 2: (1.0, 2.0, 3.0), 3: "E", 4: (4.0, 5.0, 6.0)}
    source = BytesIO()
    Image.new("RGB", (2, 2), "red").save(source, format="JPEG", exif=exif)

    class FakeS3:
        def get_object(self, **_kwargs):
            return {"Body": BytesIO(source.getvalue()), "ContentType": "image/jpeg"}

    store = PrivateImageStore("private-photos", "ap-southeast-1")
    store._client = FakeS3()
    photo = await store.get("proof-of-delivery/old-photo.jpg")

    with Image.open(BytesIO(photo.data)) as retrieved:
        assert not retrieved.getexif()


def test_photo_key_migration_adds_nullable_column():
    path = Path(__file__).parents[1] / "migrations/versions/20261106_order_proof_photo.py"
    spec = importlib.util.spec_from_file_location("order_proof_photo_migration", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE orders (order_id VARCHAR PRIMARY KEY)"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("orders")}
        assert "proof_of_delivery_photo_key" in columns
        connection.execute(text("INSERT INTO orders (order_id) VALUES ('order-1')"))
        assert (
            connection.execute(text("SELECT proof_of_delivery_photo_key FROM orders")).scalar_one()
            is None
        )
        migration.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("orders")}
        assert "proof_of_delivery_photo_key" not in columns
    engine.dispose()

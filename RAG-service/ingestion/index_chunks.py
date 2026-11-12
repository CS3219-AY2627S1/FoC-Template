# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import csv
import os
from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer


DATABASE_URL = os.environ["DATABASE_URL"]
CHUNKS_FILE = os.getenv("CHUNKS_FILE", "/app/ingestion/chunks.csv")
# Same file compose runs when it creates rag-database. Applied on every import (every statement is
# IF NOT EXISTS) because a managed database like RDS has no first-start hook. On RDS the "vector"
# extension needs admin rights, so the db-init Job creates it first and this step skips it.
SCHEMA_FILE = os.getenv("SCHEMA_FILE", "/app/database/init.sql")
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)


def load_chunks() -> list[str]:
    with Path(CHUNKS_FILE).open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != ["chunk_text"]:
            raise ValueError("The CSV must contain exactly one column: chunk_text")

        texts = []
        for row_number, row in enumerate(reader, start=2):
            text = row["chunk_text"]
            if not text or not text.strip():
                raise ValueError(f"Row {row_number} contains empty chunk_text")
            texts.append(text.strip())

    if not texts:
        raise ValueError("The CSV must contain at least one chunk")

    return texts


def main() -> None:
    texts = load_chunks()
    model = SentenceTransformer(EMBEDDING_MODEL)
    embeddings = model.encode(texts, normalize_embeddings=True)

    with psycopg.connect(DATABASE_URL) as connection:
        schema = Path(SCHEMA_FILE)
        if schema.exists():
            connection.execute(schema.read_text(encoding="utf-8"))
            connection.commit()

        # After the schema: this looks up the "vector" type, which the extension creates
        register_vector(connection)

        with connection.cursor() as cursor:
            cursor.execute("TRUNCATE TABLE chunks RESTART IDENTITY")

            for text, embedding in zip(texts, embeddings):
                cursor.execute(
                    """
                    INSERT INTO chunks (chunk_text, embedding_vector)
                    VALUES (%s, %s)
                    """,
                    (text, embedding),
                )

        connection.commit()

    print(f"Imported {len(texts)} chunks")


if __name__ == "__main__":
    main()

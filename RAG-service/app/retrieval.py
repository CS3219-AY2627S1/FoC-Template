import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

from app.config import DATABASE_URL, DEFAULT_TOP_K, EMBEDDING_MODEL
from app.schemas import ChunkResult


class Retriever:
    def __init__(self) -> None:
        self.model = SentenceTransformer(EMBEDDING_MODEL)

    def find_relevant_chunks(
            self,
            query: str,
            top_k: int = DEFAULT_TOP_K,
    ) -> list[ChunkResult]:
        if not query or not query.strip():
            raise ValueError("query must be a non-empty string")

        if not 1 <= top_k <= 20:
            raise ValueError("top_k must be between 1 and 20")

        query_embedding = self.model.encode(
            query.strip(),
            normalize_embeddings=True,
        )

        with psycopg.connect(DATABASE_URL) as connection:
            register_vector(connection)

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        chunk_id,
                        chunk_text,
                        1 - (embedding_vector <=> %s) AS similarity
                    FROM chunks
                    ORDER BY embedding_vector <=> %s
                    LIMIT %s
                    """,
                    (query_embedding, query_embedding, top_k),
                )

                return [
                    ChunkResult(
                        chunk_id=row[0],
                        chunk_text=row[1],
                        similarity=float(row[2]),
                    )
                    for row in cursor.fetchall()
                ]

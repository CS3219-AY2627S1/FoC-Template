import os


DATABASE_URL = os.environ["DATABASE_URL"]
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)
DEFAULT_TOP_K = int(os.getenv("RAG_TOP_K", "7"))

# RAG Service

This folder contains the RAG database setup and the one-off job used to import
reviewed knowledge chunks.

## Chunk file

Add or edit chunks in [`ingestion/chunks.csv`](ingestion/chunks.csv). The file
must contain exactly one column named `chunk_text`:

```csv
chunk_text
"Users can register for an account before using account-based platform features."
"A courier can view open errands and accept one to complete."
```

## Populate the database

From the repository root, start the database:

```powershell
docker compose up -d rag-database
```

Run the indexing job:

```powershell
docker compose --profile jobs run --rm rag-index
```

The job reads `ingestion/chunks.csv`, generates 384-dimensional embeddings
with `all-MiniLM-L6-v2`, clears the existing `chunks` table, resets the numeric
IDs, and inserts the complete CSV contents in one transaction.

Because the table is fully replaced on every import, this command is also the
procedure for updating the database after changing `chunks.csv`.

If the importer code or dependencies changed, rebuild its image first:

```powershell
docker compose build rag-index
docker compose --profile jobs run --rm rag-index
```

If only the CSV changed, run the indexing command without rebuilding.

## API and sign-in

`POST /query` (`{"query": "...", "top_k": 5}`) requires a signed-in user's access token
(`Authorization: Bearer ...`), checked against user-service like the other services, so the Claude
API behind it can't be used by anyone on the internet. Locally, compose points it at user-service.
`GET /health` needs no token. Without `ANTHROPIC_API_KEY`, the service still starts and `/query`
answers `503`.

## In the cloud

- **Claude API key:** stored in AWS Secrets Manager (`campuscouriers/anthropic-api-key`), never in
  git; see `k8s/README.md`, "API keys". The model is set in `k8s/app/config/rag-service.env`.
- **Database:** `campuscouriers_rag` on the shared RDS instance, with the `vector` extension (created
  by the db-init Job). The indexing job creates the table from `database/init.sql`.
- **Indexing:** the deploy workflow runs the `rag-index` Job (`k8s/jobs/rag-index.yaml`) whenever
  this folder changes, so editing `chunks.csv` and merging is enough.
- **Embedding model:** downloaded into the image at build time (`Dockerfile`), so containers never
  need to reach Hugging Face. If you change `EMBEDDING_MODEL`, change it in the Dockerfile, both
  Kubernetes files that set it, and re-index (the stored vectors must come from the same model).

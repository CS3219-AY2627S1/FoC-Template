# Supplier Service

## Tests

With Docker running, from the repository root:

```bash
./gradlew :supplier-service:test
```

## Local supplier data

Start the Supplier Service once against the local database so Flyway creates its
tables. Then, from the repository root, seed suppliers and opening hours with:

```bash
docker compose run --rm supplier-seed
```

This starts local PostgreSQL if needed and waits for it to be ready. It uses the
CSV files in `data/csv` and the PostgreSQL credentials in your local `.env`.
Existing supplier IDs and their opening hours are preserved, so the command can
be repeated after adding suppliers to the CSV files.

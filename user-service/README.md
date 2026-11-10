# User Service

## Local development

Run from `user-service/`:

```sh
uv sync
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 5005
```

## Administrator participant lookup

`POST /authentication/users/lookup` accepts `{ "user_ids": ["<uuid>"] }`
with 1–100 UUIDs. Admins and admin managers receive `{ user_id, username, email }`
for known participants of any role. Missing IDs are omitted; duplicates return
one profile. Lookup is read-only and excludes role data. User listing and role
management require admin-manager access.

## Tests

```sh
PYTHONPATH=src uv run python -m unittest discover -s tests
```

## Docker Compose

Run from the repository root:

```sh
docker compose up --build user-service
```

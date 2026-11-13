# RAG Service

The help assistant for Friend on Campus (shown as Relay in the app). A logged-in user asks how to do something, the service finds the most relevant help documents, and Claude answers from those documents only. This is nice-to-have N2 of the brief.

## Setup

You need Docker Desktop and a Claude API key. Create a `.env` file in the repository root that sets `CLAUDE_API_KEY`, then start the assistant from the repository root. The user-service starts with it, because every question needs a login check.

```bash
docker compose up --build rag-service web-client
```

The embedding model is downloaded while the image is built, so the build needs internet access and a new container does not.

| Address | What it is |
| --- | --- |
| <http://localhost:8080/api/rag/query/> | The route the browser uses, through the gateway |
| <http://localhost:3080> | The service itself, reachable from your machine only |
| <http://localhost:3080/docs> | Generated API documentation |

Log in as the first administrator and ask a question. Each question uses your Claude credits.

```bash
curl -s -c cookies.txt -X POST http://localhost:8080/api/user/auth/login \
  -H "Content-Type: application/json" -d '{"identifier":"admin","password":"change-me"}'
curl -s -b cookies.txt -X POST http://localhost:8080/api/rag/query/ \
  -H "Content-Type: application/json" -d '{"query":"How do I post an errand?"}'
```

To work on the code, keep the user-service in Docker and run this service on your machine. It reads `rag-service/.env`, where `USER_SERVICE_URL` is `http://localhost:3001`.

```bash
docker compose up -d user-service
cd rag-service
uv sync
uv run uvicorn src.main:app --reload --port 3080
```

### Tests

Two tests check that a question retrieves the right help document. They need neither a Claude key nor the other services, and they cost nothing. The first run downloads the embedding model if it is not on your machine yet.

```bash
cd rag-service
uv run python -m unittest discover -s tests -v
```

## API

### `POST /query/`

Needs a logged-in session in the `relay_session` cookie. From the browser the path is `/api/rag/query/`. The final slash is required, and the gateway answers 404 without it.

```json
{
  "query": "What if nobody accepts my errand?",
  "conversation": [
    { "role": "user", "content": "How do I post an errand?" },
    { "role": "assistant", "content": "Open Post an errand from the menu..." }
  ]
}
```

`query` is required and holds 1 to 1000 characters. `conversation` is optional and holds the earlier turns, because the service stores nothing between requests. Each turn is `user` or `assistant` with at most 6000 characters, and only the last 10 turns are used. If that cut would start with an answer, the turns before the next question are dropped too, because Claude expects a conversation to start with the user. Each account may ask 10 questions per minute.

The answer is `200`:

```json
{ "query": "What if nobody accepts my errand?", "response": "It expires, and your reserved credits are released..." }
```

Errors have the shape `{ "error": { "code": "...", "message": "..." } }`:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_QUERY` | The question is blank or longer than 1000 characters. |
| 400 | `INVALID_CONVERSATION` | A turn has another role, is not text or is too long. |
| 401 | `UNAUTHENTICATED` | There is no session cookie. |
| 403 | `FORBIDDEN` | The session is not valid, or the user-service could not be reached. |
| 429 | `TOO_MANY_QUESTIONS` | The account asked more than 10 questions in the last minute. |
| 500 | `ASSISTANT_FAILED` | The answer failed, for example because Claude could not be reached. The cause is in the service log. |

A body with a missing or wrongly typed field gets FastAPI's own `422` response, which does not use this shape.

### Public routes

`GET /`, `GET /health/`, `GET /docs` and `GET /openapi.json` need no login. The gateway does not forward them, so the browser cannot reach them.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLAUDE_API_KEY` | Yes | The key for calling Claude. Keep it out of git. The service starts with an empty key, but every question then fails. |
| `USER_SERVICE_URL` | Yes | Where the user-service is. Compose sets it to `http://user-service:3000`. The service does not start without it. |
| `HF_HUB_OFFLINE` | No | Set to `1` in the image, so the service uses the built-in model and never tries to download one. |

The web client reads `RAG_SERVICE_URL` to find this service. Compose sets it to `http://rag-service:3080`. The port is fixed at 3080 in the `Dockerfile`, so the `PORT` value in `compose.yaml` is not used.

## Design

```text
Browser -> web-client gateway -> auth middleware -> user-service (POST /internal/authorize)
                                       |
                                       v
                                  controller (limits)
                                       |
                                       v
                                  rag_service: embed question -> FAISS: 2 closest documents
                                       |
                                       v
                                  Claude answers from those documents
```

- **Help documents:** `src/data/` holds one short `.txt` file per topic. Each starts with a `Title:` line and a `Questions:` line that lists how people ask about the topic, which helps the search find it.
- **Short documents:** the embedding model only reads the first 256 tokens of a text, so a long document would be partly ignored. Keep each file short and about one topic.
- **Search:** `all-MiniLM-L6-v2` turns text into vectors on the CPU, and a FAISS `IndexFlatL2` finds the 2 closest documents. With this few documents, an exact search in memory is fast enough, so no database is needed. The index is built at startup, which takes a few seconds.
- **Model in the image:** this makes the image self-contained, so startup needs no download and one image works locally and in the cloud. The cost is a larger image of about 2 GB.
- **Login:** the user-service decides who may ask, as for every other service. The middleware checks every path that is not listed as public, so a new route is protected by default. It fails closed: if the user-service does not answer `authorized`, the request is refused.
- **Cost limits:** everything in a request is sent to Claude, so the limits on `query`, `conversation` and `max_tokens` also limit what one request can cost. A limit of 10 questions per account and minute caps how many requests one account can send. The counts are kept in memory, which works because the service runs as one instance.
- **No stored state:** the service keeps no conversations and no database. The client sends the earlier turns with each question.

### What is sent to Claude

Each question sends the question, the earlier turns and the 2 retrieved documents to the Anthropic API. The account id, the session cookie and other account data are not sent. Whatever a user types is sent as written, so users should not enter personal data in the assistant.

## Updating the help documents

1. Add or edit a `.txt` file in `src/data/`, with the `Title:` and `Questions:` lines first.
2. Rebuild the service, because the documents are read at startup and are part of the image: `docker compose up --build -d rag-service`.
3. Ask a few questions about the topic and run the tests.

## Third-party software

The service uses [FastAPI](https://fastapi.tiangolo.com/), [sentence-transformers](https://www.sbert.net/) with the `all-MiniLM-L6-v2` model, [FAISS](https://github.com/facebookresearch/faiss) and the [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python). The full list is in `pyproject.toml` and `uv.lock`.

## Declaration of AI-assisted work

I used Claude Code while building this service. I decided what the service should do, wrote its first version and reviewed the results.

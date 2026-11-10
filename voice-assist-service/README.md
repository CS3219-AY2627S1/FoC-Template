# FoC Voice Assist Service

Voice Assist supports the voice-assisted errand creation nice-to-have (backlog N3). A requester
records one errand; this service transcribes it, extracts the errand details and returns a
**draft** of the ordinary errand form. The requester reviews and edits the draft, then posts it
through Order Service as usual. See [API.md](API.md) for the contract and
[IMPLEMENTATION.md](IMPLEMENTATION.md) for a step-by-step walk-through of the prompts, the JSON
at each stage and the matching rules.

- **Stateless.** No database. Audio is held in memory for one request and never written to disk;
  transcripts and drafts are returned only to the caller and never logged.
- **Draft only.** It never calls Order or Credit, so nothing said in a recording can create an
  errand, change the requester or move credits.
- **Deterministic checks.** The model only reports what was said. This service resolves times in
  Asia/Singapore, matches the supplier (name first, then building or campus area) and drops any
  value the transcript does not support.
- **Optional.** If it is stopped or has no OpenAI key, the web client hides voice input and the
  ordinary form keeps working.

## Configuration

| File | Use |
| --- | --- |
| `.env` (from `.env.example`) | Running the API natively against User on `8000` and Supplier on `8001`. |
| `.env.docker` (from `.env.docker.example`) | Root Compose. Service URLs use Compose hostnames. |

| Setting | Default | Notes |
| --- | --- | --- |
| `VOICE_ASSIST_PROVIDER` | `openai` | `fake` returns a canned draft with no provider call, for UI work and demos. |
| `OPENAI_API_KEY` | unset | Unset keeps the service up and reports voice drafting as unavailable. Never commit it. |
| `VOICE_ASSIST_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | Any OpenAI transcription model. |
| `VOICE_ASSIST_DRAFT_MODEL` | `gpt-4.1-mini` | Any OpenAI model with Structured Outputs. |
| `VOICE_ASSIST_*_TIMEOUT_SECONDS` | 12 / 12 / 25 | Transcription, drafting, total. The browser gives up at 30 s. |
| `VOICE_ASSIST_USER_LIMIT` / `_WINDOW_SECONDS` | 10 / 600 | Drafts per requester per window (N3NFR4.1). |
| `VOICE_ASSIST_DAILY_LIMIT` | 500 | Platform drafts per Singapore day. Limits are in memory, per instance. |
| `VOICE_ASSIST_RETENTION_NOTICE` | OpenAI notice | Shown before recording (N3NFR3.5). Keep it in line with the provider's current policy. |

Also set a monthly spend limit on the OpenAI project that owns the key.

## Run

From the repository root with Docker:

```sh
docker compose --env-file user-service/.env --profile voice-assist up --build -d voice-assist-service
```

Natively on port 8006 (Windows: use `.venv\Scripts\python.exe`):

```sh
python -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m uvicorn app.main:app --port 8006
```

The Vite dev server proxies `/v1/voice-assist` to `localhost:8006`.

## Test

```sh
.venv/bin/python -m pytest
.venv/bin/ruff check .
```

Tests use fakes and a mocked HTTP transport for the OpenAI SDK; they never spend credit.

## Evaluation (N3NFR4.2)

`scripts/eval_drafts.py` sends the 24 scripted transcripts in
`tests/fixtures/eval/transcripts.json` to the configured drafting model and scores the
post-processed draft: stated fields must be at least 85 percent correct and no unsaid value may
be filled. It spends a few cents of credit, so run it deliberately:

```sh
.venv/bin/python -m scripts.eval_drafts
```

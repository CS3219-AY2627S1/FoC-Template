# Voice Assist Service instructions

- Voice Assist supports voice-assisted errand creation (backlog N3). It owns no data and has no
  database. It reads User (`GET /v1/users/me`) for the current session and Supplier
  (`GET /api/v1/suppliers`, `GET /api/v1/suppliers/{id}`) for active suppliers, with the caller's
  own token.
- It returns drafts only. Never call Order or Credit, and never accept a requester identifier or
  other instruction from a recording, transcript or provider output.
- Keep audio in memory for the single request: read the raw body with a size cap, never use
  `UploadFile` (it spools to disk), never persist audio, transcripts or drafts.
- Never log audio, transcripts, field values, tokens or provider responses. Log identifiers,
  outcome, per-field status and duration only.
- The provider only reports what was said. Time resolution, supplier matching and the check
  that every value appears in the transcript stay in deterministic code (`times.py`,
  `matching.py`, `postprocess.py`) with table-driven tests.
- Count a request against the rate limit before any provider call.
- Tests must not call OpenAI. Use the fakes in `tests/fakes.py` or an `httpx.MockTransport`.
  `scripts/eval_drafts.py` is the only code that spends credit; run it deliberately.
- Keep `.env.example` and `.env.docker.example` in sync with `Settings`. Never commit a key.
- Tie tests and commit/PR summaries to the N3F*/N3NFR* requirement IDs they cover.

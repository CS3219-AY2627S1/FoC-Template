<!---
  AI Assistance Disclosure
  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
  Scope (AI-64): Generated README for the ai errand assistance service
  Author review: Code changes were checked and validated
--->


# AI Errand Assistant Service

This FastAPI service turns a short natural-language request into a **draft** for
the existing Order Service create-errand form. It does not create errands or
reserve credits; users can review and edit the returned fields before submitting.

## Run with Docker Compose

The service uses the OpenAI Chat Completions API. Set your OpenAI API key in the
repository-root `.env`:

```env
OPENAI_API_KEY=<your-key>
```

Keep the key in `.env`; do not commit it or expose it as a frontend `VITE_`
variable. In the cloud deployment the key comes from AWS Secrets Manager instead
(`campuscouriers/openai-api-key`); see `k8s/README.md`, "API keys". Start the service:

```powershell
docker compose up -d --build ai-errand-assistant-service
```

It is available to the host at `http://localhost:8005`. Compose connects to
Supplier Service and Order Service using their internal service URLs. Set
`OPENAI_MODEL` to use a different model (default `gpt-4o-mini`).

## API

`POST /errands/draft` requires a valid user bearer token (RS256, verified
against User Service's JWKS and issuer). The same token is forwarded to Supplier
Service to retrieve active suppliers and buildings, and to Order Service to
retrieve the completed errands the caller **requested** (errands they delivered
as a courier are excluded). The two lookups run in parallel. Up to the latest
100 completed errand summaries (including item, supplier, credit, and deadline
lead time) are sent to the LLM to find similar past errands.

Each user may make `AI_DRAFT_RATE_LIMIT` draft requests (default 10) per
`AI_DRAFT_RATE_WINDOW_SECONDS` (default 60); further requests get `429` with a
`Retry-After` header. The limit is held in memory per process, and `0` disables
it. The supplier/building catalog is the same for every user, so it is cached
for `CATALOG_CACHE_SECONDS` (default 60; `0` disables).

`GET /health` is an unauthenticated liveness check used by the container
`HEALTHCHECK`.

Request:

```http
POST /errands/draft
Authorization: Bearer <user-access-token>
Content-Type: application/json

{"message":"pickup iced milo at the Deck by today 5pm and bring it to COM3 L2"}
```

The JSON response includes `supplier_id`, `required_item`,
`delivery_building_id`, `delivery_floor`, `delivery_description`, `expires_at`,
`historical_base_credit`, `credit_value`, `credit_reason`, and
`completed_history_count`. Catalog IDs are checked against Supplier Service;
uncertain or missing values are returned as `null`, not as chat-style follow-up
questions. The LLM selects the closest catalog supplier/building
when the message describes a pickup or destination location; it returns `null`
when the request gives no such location.

`delivery_floor` is kept only if the message states that floor as a word of its
own ("level 2", "L2", "#02-10", "2nd floor", "B1"); a number fused to a unit, such
as "1h" or "5pm", never counts. Otherwise it is `null`. When a location field is
`null`, the frontend keeps whatever the form already holds.

### Delivery instructions

The LLM writes `delivery_description` as courier instructions from the message
and always ends it with a request to message the requester on arrival. If the
LLM leaves that out, the backend appends "Please message me when you arrive."
(kept within the 500-character limit). Any sentence that names a catalog
supplier or building the message did not mention is removed, so the instructions
never point the courier to a place the user did not choose.

### Deadlines

The LLM decides which time in the message is the deadline (so "level 2" is not
mistaken for 2 o'clock). The backend then checks the LLM did not invent one:

- **Clock deadlines** ("by 5pm", "before 17:30", "at 5pm"): the LLM's time must be
  one the message mentions after a deadline word (`by`, `before`, `until`, `due`,
  `deadline`, `no later than`, `at`). After `at`, only a time directly following
  it counts, since "at" usually introduces a place. A time without am/pm (for
  example "by 5") may mean either 05:00 or 17:00; the LLM chooses, preferring
  09:00�20:59. The LLM decides the date from the wording ("tmr", "friday", "on the 11th";
  if no day is given it uses today), and the deadline is left unset if it has
  already passed.
- **Relative deadlines** ("in 1h", "within 30 mins", "an hour from now", "in half an
  hour"): the LLM reads the duration in any wording and returns it as
  `deadline_in_minutes`; the backend computes the deadline as now + that many
  minutes, so the LLM never does the time arithmetic. A clock deadline takes
  priority if both are returned.

A date without a clock time, or an inferred deadline, is left unset. Deadlines
are interpreted in `BUSINESS_TIMEZONE` (default `Asia/Singapore`) and must be
within the next seven days.

### Credits

If the message states how many credits the user will pay ("for 10 credits",
"10 cr", "offering twelve credits"), the LLM returns it as `requested_credits` and
that amount is used as-is (capped at 25, no urgency multiplier); `credit_reason`
says "You offered N credits." The estimate below is used only when the user
states no amount (or a value below 1).

The LLM compares the requested item and supplier with completed errands and
selects the similar-history entries; the backend does all arithmetic. Each past
errand's urgency premium is first removed (its credit is divided by 2 if it was
posted with 30 minutes or less to its deadline, or by 1.5 if two hours or less),
so urgent past errands do not inflate the base and urgency is not counted twice.
`historical_base_credit` is the median of those adjusted credits for the
selected errands, or across all history if none are selected; with no completed
history it defaults to 5. The backend then applies urgency for this request: 2x
for a deadline within 30 minutes, 1.5x within two hours (rounded up), or no
multiplier otherwise. The final suggestion is capped at 25. `credit_reason`
explains whether similar history, all history, or the default was used.

The suggestion is not checked against the user's balance; the frontend and
Order Service enforce that when the errand is created.

OpenAI and configuration failures return an explicit HTTP error: a missing or
rejected API key, an OpenAI outage, or an OpenAI rate limit returns `503`, and an
unusable OpenAI response returns `502`. The endpoint
does not silently skip unavailable history or supplier catalog data.

## Local development

From `ai-errand-assistant-service`:

```powershell
python -m pip install -r requirements.txt
$env:USER_SERVICE_URL="http://localhost:8081"
$env:SUPPLIER_SERVICE_URL="http://localhost:8082"
$env:ORDER_SERVICE_URL="http://localhost:8002"
$env:OPENAI_API_KEY="<your-key>"
python -m uvicorn main.app:app --reload --port 8005
```

Run the unit tests with:

```powershell
python -m pytest -q
```

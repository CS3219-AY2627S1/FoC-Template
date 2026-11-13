# Credit Estimation Service

A microservice for estimating credit values for errands based on their title, description, and instructions.

## Features

- AI credit estimation using the `openai` provider adapter and an OpenAI-compatible chat-completions endpoint
- Distributed per-user rate limiting
- Distributed global rate limiting across all service instances
- Authentication via service token

## API Endpoints

### POST `/internal/estimation/estimate-credit`

Estimate credits for an errand.

**Request Body:**

```json
{
  "name": "Title of errand",
  "description": "Description of errand",
  "serviceType": 0,
  "instructions": "Optional instructions",
  "startAt": "2030-11-08T10:00:00Z",
  "expiresAt": "2030-11-08T12:00:00Z",
  "availableCredit": 37
}
```

Use future `startAt`/`expiresAt` values when trying the example.

**Authentication:** Requires `x-credit-estimation-service-token` OR `x-service-token`
matching `CREDIT_ESTIMATION_SERVICE_TOKEN`, plus `x-user-id` identifying the user
for rate limiting. The HTTP route reads the user ID from that header, not the
request body. Browser clients call the authenticated
`POST /api/errands/estimate-credit` route; Errand supplies the internal token
and authenticated user's subject. That public route also requires `instructions`
to be a string (use `""` when none).

**Rate Limit:**

- Per user: 20 requests per minute (configurable via `AI_RATE_LIMIT_REQUESTS_PER_MINUTE`)
- Across all users and service instances: 300 requests per minute (configurable via `AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE`)
- Counters are shared through Redis across estimator instances.
- When Redis is unavailable, estimation fails closed with service-unavailable
  behavior; it does not fall back to a process-local limiter.
- Without an initialized AI client, estimates return HTTP 503. There is no
  keyword-only fallback.

**Response:**

```json
{
  "minCredits": 15,
  "maxCredits": 25,
  "reason": "Brief reasoning for the estimate."
}
```

**Error Response (Rate Limited):**

```json
{
  "code": "RATE_LIMITED",
  "message": "Credit estimation is temporarily rate limited."
}
```

**Error Response (Invalid Input):**

```json
{
  "code": "INVALID_INPUT",
  "message": "Name must be a string. Description must be a string."
}
```

## Configuration

The AI provider and rate limiting are configured via environment variables.

| Variable                                 | Default                                 | Description                                    |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| PORT                                     | 3005                                    | Service port                                   |
| USER_API_URL                             | http://user-api:3000                    | Retained user-service URL setting            |
| USER_SERVICE_INTERNAL_TOKEN              | Empty                                   | Retained user-service configuration             |
| CREDIT_ESTIMATION_SERVICE_TOKEN          | Empty                                   | Required internal service token                 |
| ESTIMATION_SERVICE_TIMEOUT_MS            | 5000                                    | Request timeout in ms                          |
| AI_PROVIDER                              | Empty                                   | Set to `openai` to initialize the supported adapter |
| AI_API_KEY                               | -                                       | AI API key (required)                          |
| AI_MODEL                                 | -                                       | AI model to use                                |
| AI_ENDPOINT                              | Empty                                   | Full chat-completions URL, including its path    |
| AI_ESTIMATION_TIMEOUT_MS                 | 3000                                    | AI request timeout in ms                       |
| AI_TEMPERATURE                           | 0                                       | AI temperature setting                         |
| AI_MAX_TOKENS                            | 1000                                    | Max tokens for AI response                     |
| AI_RATE_LIMIT_REQUESTS_PER_MINUTE        | 20                                      | Rate limit per user per minute                 |
| AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE | 300                                     | Shared rate limit across all service instances |
| REDIS_URL                                | redis://redis:6379                      | Redis connection URL                           |

### Example Configuration

```bash
AI_PROVIDER=openai
AI_API_KEY=your-api-key
AI_ENDPOINT=https://your-provider.example/v1/chat/completions
AI_MODEL=your-model-id
AI_ESTIMATION_TIMEOUT_MS=3000
AI_TEMPERATURE=0
AI_MAX_TOKENS=1000
AI_RATE_LIMIT_REQUESTS_PER_MINUTE=20
AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE=300
REDIS_URL=redis://redis:6379
```

## Service Baselines

| Service Type | Base | Min | Max | Standard Window |
| ------------ | ---- | --- | --- | --------------- |
| Food         | 15   | 10  | 30  | 90 minutes      |
| Drink        | 10   | 8   | 20  | 60 minutes      |
| Shopping     | 20   | 15  | 40  | 180 minutes     |
| Printing     | 10   | 8   | 25  | 120 minutes     |
| Parcel       | 25   | 15  | 50  | 240 minutes     |

The AI estimates errand complexity from the errand textual details. The service then applies a
deterministic credit adjustment based on the available time window relative to the service's standard window. E.g.

- Half the standard window adds 20% of the service's base credits.
- Twice the standard window removes 20% of the service's base credits.
- Adjustments use a logarithmic curve capped at +40% and -30% of the service's
  base credits, rounded to a whole-credit delta.
- Valid estimates remain within the global 10-50 bounds. If the balance covers
  the minimum but not maximum, the maximum is capped at the whole-credit balance.
  If the balance is below the minimum, the range is preserved for the UI to warn.
- Semantically unsuitable tasks can return `minCredits: -1, maxCredits: -1`
  with an explanatory reason instead of a priced estimate.

## Validation

The service validates all input fields:

- `name`: string, 1-200 characters, no dangerous patterns
- `description`: string, 1-5000 characters, no dangerous patterns
- `instructions`: optional string, max 5000 characters
- `startAt`: required valid ISO date string
- `expiresAt`: required valid ISO date string after both the effective start and current time
- `serviceType`: integer, must be a valid service type from supplier service
- `x-user-id` header: required non-empty string for per-user rate limiting
- `availableCredit`: required finite, nonnegative number

The validator rejects a defined set of script and injection-like text patterns;
this is not a guarantee that every malicious prompt is detected.

## Run and verify

From the repository root, `npm run up:compose` starts the estimator and its Redis
service. Supply `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_MODEL`, and the full
`AI_ENDPOINT` in the local Compose configuration before startup. Without provider
configuration the application can run, but estimation requests return 503.

`npm run dev` runs the estimator from source; ensure Redis is running and export
`REDIS_URL=redis://localhost:6379` plus provider settings in that shell. The source
launcher does not start Redis or load estimator-specific `.env` files for you.

Kubernetes currently deploys the estimator but no Redis Service. Configure a
reachable Redis endpoint explicitly in its runtime environment before testing
AI estimation there; merely adding `REDIS_URL` to `deploy/relay.aws.env` does not
inject it into Pods with the current deployment renderer.

`/health` is a process check. `/healthz` currently returns a static success response
and does not verify Redis connectivity or provider availability. Verify an actual
estimate as well as health before a demo.

```bash
npm run lint --workspace=@relay/credit-estimation-backend
npm run test --workspace=@relay/credit-estimation-backend
npm run build --workspace=@relay/credit-estimation-backend
```

For deterministic end-to-end tests using an isolated Redis and mock provider,
see the [single-instance load-test suite](../load-tests/README.md#local-credit-estimation-single-instance-suite).

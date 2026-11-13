# recommendation-service

Credit recommendation service with per-supplier scoring, completed-errand consumption,
and an offline weight trainer. Compose uses an in-memory feature store by default.

## Layout

```
recommendation-service/
├── Dockerfile            # node:24-alpine, runs src/index.ts, EXPOSE 3006
├── .dockerignore
├── .env.example          # every env var with safe local placeholders
├── package.json          # express, helmet, pino, zod (+ tsc/pino-pretty dev)
├── tsconfig.json         # same compiler settings as the other services
└── src/
    ├── index.ts          # starts the HTTP server, handles SIGTERM/SIGINT
    ├── app.ts            # builds the Express app (helmet, json, routes)
    ├── config.ts         # validates env with zod, exits on bad config
    ├── lib/
    │   └── logger.ts     # pino logger with redaction
    └── routes/
        └── health.routes.ts  # GET /health -> { status: "ok" }
```

## Run locally

```bash
cd recommendation-service
npm install
cp .env.example .env   # optional; defaults work without it
npm run dev            # watch mode on PORT (default 3006)
```

Then verify:

```bash
curl http://localhost:3006/health
# {"status":"ok"}
```

Other scripts: `npm start` (no watch), `npm run typecheck` (`tsc --noEmit`), `npm test`.
New tests are kept locally under `test/` and ignored by Git; existing tracked tests remain tracked.

## How a recommendation is worked out

We price an errand from the supplier's recent history plus three things about the request:
how many items, how soon it's needed, and how far the delivery is.

If the supplier has fewer than 3 completed errands we don't trust its averages yet, so we just
suggest a flat 10 credits.

Otherwise we start from the supplier's recent average reward (the "market rate") and nudge it:

- more items than this supplier usually gets -> up
- needed soon (within the next 24h) -> up
- delivery farther than usual -> up

Each nudge is how far the request sits from that supplier's own average, times a weight. Add the
nudges to 1, multiply the market rate by it, round, and keep it between 1 and 50.

```
itemFactor     = a * (items / avgItems - 1)
urgencyFactor  = b * urgency            # 0..1, climbs over the last 24h before it's due
distanceFactor = c * (distance / avgDist - 1)
credits        = clamp(round(marketRate * (1 + itemFactor + urgencyFactor + distanceFactor)), 1, 50)
```

So an average-sized, average-distance, not-urgent errand lands on the market rate; anything heavier,
farther, or more urgent costs more. Defaults are `a = 0.5`, `b = 0.5`, `c = 0.3`. The averages and the
weights both update on their own — see below.

## Learning loop (two-speed), both OFF the request path

The request path does one feature-store read and scores. Everything below runs asynchronously and never blocks it.

- **Fast — the market rate (seconds).** A worker consumes `order.errand.completed` and folds each outcome into the supplier's rolling EWMA averages (`avgReward`, `avgItems`, `avgDist`). The next request reads the fresher numbers; it never waits on an event.
- **Slow — the weights (batch).** `npm run trainer` reads the training samples from S3, refits `a`, `b`, `c`, and writes them to the `scorer_weights` DynamoDB item (`id = "current"`). The API's `WeightsProvider` polls that item every ~30 min and swaps them in — no redeploy, no added latency. Scheduling the trainer is a deployment concern; this repo doesn't provision it.

### Training samples

Each completed outcome becomes one sample, scored against the supplier's stats from *before* that completion (needs ≥5 prior completions and a positive average reward):

```
rewardOverMarket = completedReward / prior.avgReward - 1
itemFactorInput  = prior.avgItems > 0 ? itemCount / prior.avgItems - 1 : 0
urgencyInput     = urgency(neededBy, postedAt)      # 0..1, or 0 when the times are missing
distFactorInput  = prior.avgDist > 0 ? distance / prior.avgDist - 1 : 0
rewardOverMarket ≈ a * itemFactorInput + b * urgencyInput + c * distFactorInput
```

These features mirror the scorer, so the last line is just the scorer's formula and the fit recovers the weights that best explain the rewards people actually chose. The event carries `neededBy` and `postedAt`, so the consumer rebuilds urgency the way the scorer saw it — the deadline measured against posting time, not the already-passed completion time. If the prior `avgDist > 0` but the outcome has no measured distance, the sample is skipped rather than treated as a zero.

### Trainer rules

- Needs ≥20 valid samples; reads only `training/` NDJSON (including historical batches), skips malformed rows, dedups by event id.
- A feature that doesn't vary in the batch keeps its current weight; collinear or non-finite inputs keep the whole current fit. Weights are clamped to `[0, 2]`.
- Reads the stored weights first and writes conditionally, so a concurrent run can't overwrite a newer fit with a stale one. Too little data writes nothing; an invalid stored row or a failed read aborts. Defaults apply only before the weights item exists.

### Logging and durability

- **Recommendation logs** buffer in memory and ship to S3 under `recommendations/YYYY/MM/DD/` after the response is sent — never on the request path. Set `S3_BUCKET` to enable (unset = off, for local dev). These are predictions, never training targets.
- **Training export** (DynamoDB mode) commits the stats update and a dedup receipt (`__event#<eventId>` in the feature table — no extra table) in one transaction, then writes the sample to `training/events/<eventId>.ndjson` and only acks after that write. A redelivery reuses the receipt, so a retried export never double-counts. In-memory mode keeps this only for the process lifetime.

### Config (DynamoDB mode)

Set `FEATURE_STORE=dynamodb`, `DYNAMODB_TABLE`, `SCORER_WEIGHTS_TABLE`, `S3_BUCKET`, `AWS_REGION` (optionally `DYNAMODB_ENDPOINT`/`S3_ENDPOINT`). Feature table keyed by `supplierId`, weights table by `id`, plus the S3 bucket — no sort keys. Permissions: the worker needs `GetItem`/`PutItem` on the feature table and `s3:PutObject` on `training/*`; the API needs `GetItem` on both tables and `s3:PutObject` on `recommendations/*`; the trainer needs `s3:ListBucket`+`GetObject` on `training/*` and `GetItem`/`PutItem` on the weights table. The trainer reads exported env vars (`node --env-file=.env src/trainer/refit-weights.ts` to use `.env`). None of this is provisioned by the current manifests.

## Deploy (AWS, ap-southeast-1)

Two App Runner services run the same image, differing only by the `ROLE` env var. Both listen on
3006 so App Runner can health check `/health`.

| | API service | Consumer service |
| --- | --- | --- |
| `ROLE` | `api` | `worker` |
| Does | serves `POST /recommendations` | consumes `order.errand.completed`, updates the feature store |
| Env it needs | `FEATURE_STORE=dynamodb`, `DYNAMODB_TABLE`, `SCORER_WEIGHTS_TABLE`, `S3_BUCKET`, `USER_SERVICE_URL`, `AWS_REGION` | `FEATURE_STORE=dynamodb`, `DYNAMODB_TABLE`, `S3_BUCKET`, `BROKER_URL` (Amazon MQ), `AWS_REGION` |

`.github/workflows/deploy-recommendation-service.yml` runs on merge to `dev`: it typechecks and tests,
builds the image, pushes it to ECR tagged `:<sha>` and `:dev`, then triggers a deploy of each service.
Turn OFF App Runner's automatic image deployment so the workflow controls when a deploy happens; point
both services at the `:dev` tag.

GitHub secrets: `AWS_DEPLOY_ROLE_ARN` (OIDC role the workflow assumes), `APP_RUNNER_API_ARN`,
`APP_RUNNER_CONSUMER_ARN`.

## Declaration of AI-assisted work

I drew the architecture myself — the endpoints, the functions that should exist, and how the service talks to the others — and had Claude fill them in one step at a time, reviewing each result.

- **Generate:** Claude was used to write the route handlers, the scoring and feature-store code, the weights trainer and the tests, one step at a time from a plan.
- **Adapt:** Claude was used to wire the per-request distance into the scorer and keep the service in line with the other services' patterns.
- **Debug:** Claude was used to chase down CI lint and test failures.
- **Explain:** Claude was used to explain each change before it was committed.
- **Document:** Claude was used to help write this document, including the scoring explanation above.

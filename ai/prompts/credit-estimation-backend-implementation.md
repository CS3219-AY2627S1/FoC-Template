# Timestamp: 2026-10-25

# Key Prompt:

I have already defined the Credit Estimation service boundary, request interface, validation and error messages, provider prompt rules, service-type values, time adjustment formula, output limits, rate limiting, and failure behaviour. Help me scaffold and draft the implementation below. Do not redesign the estimation method or introduce new rules.

INTERNAL API AND VALIDATION

- Expose only `POST /internal/estimation/estimate-credit` beneath `/internal/estimation`.
- Authenticate with `x-credit-estimation-service-token` or the compatible `x-service-token`, and receive the authenticated subject through `x-user-id`.
- The request contains name, description, optional instructions, service type, start time, deadline, user id, and available credit.
- User id, name, and description are required. Name is limited to 200 characters; description and instructions are limited to 5,000 characters.
- Available credit must be a finite non-negative number. Service type must be an integer. Add an additional check that to ensure it is present in the shared contract defined in `@relay/contracts/supplier`.
- Start and deadline must be valid date strings, and the deadline must be after the later of the selected start and the current time.
- Reject the existing dangerous script, browser API, prototype, and Node execution patterns in the name, description, and instructions fields.
- Return the established `INVALID_INPUT`, `RATE_LIMITED`, and `SERVICE_UNAVAILABLE` errors and HTTP statuses. Do not expose provider internals.

BASELINES (strictly use these values, do not invent new service types or baselines)

- Food: base 15, minimum 10, maximum 30, standard window 90 minutes.
- Drink: base 10, minimum 8, maximum 20, standard window 60 minutes.
- Shopping: base 20, minimum 15, maximum 40, standard window 180 minutes.
- Printing: base 10, minimum 8, maximum 25, standard window 120 minutes.
- Parcel: base 25, minimum 15, maximum 50, standard window 240 minutes.
- Keep the fallback baseline at base 20, minimum 15, maximum 40, and 120 minutes.
- At startup, fail clearly if any service type in the shared contract is missing a baseline.

# Key Prompt 2:

Build a provider prompt that validates the title and description together before pricing. A valid errand must identify a meaningful item or actionable task, have a clear connection to the selected service, contain enough collection or delivery detail, and remain internally consistent.

- Reject vague placeholders, mismatched content, or uncertain relevance by returning `minCredits = -1` and `maxCredits = -1` with a short reason.
- For valid requests, use the service baseline and only factors explicitly stated by the user, such as stops, size, weight, fragility, or complexity. Do not invent factors or increase estimates because an item is expensive or new.
- Return a JSON-only output containing integer `minCredits`, integer `maxCredits`, and one direct user-facing reason. Normal estimates must stay in the globally defined range of 10-50 credits and have minimum no greater than maximum.
- Strip unsafe formatting from the reason, reject non-user-facing Markdown-like output, and preserve the invalid `-1/-1` sentinel without applying later adjustments.
- Provider failures, timeouts, malformed responses, and missing provider configuration produce service unavailable. A rate-limit decision produces HTTP 429.

TIME AND BALANCE ADJUSTMENT

- Use the later of `startAt` and the current time as the effective start.
- Divide available minutes by the service's standard window. Calculate `-0.2 * log2(durationRatio)`, clamp the percentage between -30% and +40%, multiply it by the baseline base value, and round the absolute delta before restoring its sign.
- Add the credit delta to both provider bounds, then clamp the result to the global 10-to-50 range while preserving `max >= min`.
- If the user's whole available-credit balance is between the adjusted minimum and maximum, cap only the maximum at that balance. If the balance is below the minimum, keep the fair range so the UI can warn the user. Available balance must never raise the estimate.
- Keep the complete explanation at no more than 160 characters. Reserve room for either `Shorter availability also increased the suggested range.` or `Longer availability also reduced the suggested range.` and truncate the provider reason at a clause or word boundary.

# Key Prompt 3:

You are now implementing the rate limiting and failure behaviour.

- The default provider limit is 20 requests per user per rolling minute and the default service-wide limit is 300 requests per rolling minute.
- Enforce per-user and global limits atomically in Redis using rolling time windows. Rejected requests must not be added to either window, and the response must identify user or global scope with a retry delay.
- If Redis cannot enforce the shared limit (ie. fails/unavailable/stops) reject all requests because estimation calls a paid provider.
- Use the existing defaults: service port 3005, service timeout is 5 seconds, provider timeout 3 seconds, provider temperature 0, maximum 1,000 tokens, and Redis URL `redis://redis:6379` unless configured.

# Key Prompt 4:

You are now implementing the service wiring and integration with the Errand Service backend in errand-frontend and errand-backend.

- The Errand backend is the caller. It sends the service token and authenticated user subject, translates estimation rate limits and failures, and exposes the result to the Errand creation UI.
- Please scaffold the Express application, internal authentication, route, controller, validators, baseline coverage check, provider client and prompt construction, response parser, estimation service, deterministic time adjustment, Redis limiter, local limiter, configuration, cleanup, and Docker build, refer to how Errand Service backend is implemented. Routes will be mounted at `/internal/estimation` and the single endpoint is `POST /estimate-credit`.
- Keep all values and behaviour above unchanged. Do not add persistence, a public endpo I will review and edit the generated implementation.

# Usage Scenario:

Scaffolded and drafted the author-defined Credit Estimation interface, provider flow, baselines, time and balance adjustment, explanation limits, validation, and rate limiting, then assisted with dependency, container, and integration debugging.

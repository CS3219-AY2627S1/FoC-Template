# Timestamp: 2026-10-12

# Key Prompt:

I have already defined the Errand Courier Lifecycle, persistence flow, state transitions, validation rules, error mapping, concurrency behaviour, events, and cross-service interfaces. Help me scaffold and draft this implementation in the existing controller-service-repository structure. Do not redesign the lifecycle, contracts, database model, or service boundaries.

ERRAND CREATION

- A creation request contains supplier id, supplier name, service type, name, pickup and target locations, description, optional instructions, non-negative integer credit amount, optional start time, and optional deadline.
- Names are required and limited to 200 characters. Description is required and limited to 5,000 characters. Instructions are optional and limited to 5,000 characters.
- Latitude must be between -90 and 90, longitude between -180 and 180, building name must be non-empty, and floor number must be an integer.
- Start and deadline use ISO date-time values. The deadline must be in the future and the start must be on or before it. If no expiry is supplied, use a default of 2 hours after the start or current time, whichever is later.
- Require a verified email and an existing user profile before creating an errand. This is enforced by the Errand backend using the existing User service internal token and `POST /internal/users/validate-subject`.
- Ask the Supplier service to validate the supplier and service type using `POST /internal/suppliers/validate-selection`, `x-supplier-service-token`, and the configured timeout. Treat an invalid selection as an invalid errand and Supplier connection failures as service unavailable.
- After Supplier validation, create a pending errand id, reserve the requested credits through the existing Credit service, and then create the errand in `OPEN` state.
- If reservation or creation fails, write an `ErrandCreationFailed` outbox event, remove the pending row, and rethrow the failure so the Credit service can release any reservation.

POSSIBLE LIFECYCLE TRANSITIONS

- `OPEN -> ACCEPTED`: only a different user may accept; the deadline must not have passed; the requester profile must still exist; and the courier may have at most five active errands across `ACCEPTED`, `PICKED_UP`, and `DELIVERED`.
- Serialize acceptance by taking transaction-scoped advisory locks for the courier and errand, in that order, before checking and updating state. Concurrent requests must not double-assign an errand or exceed the courier limit.
- `OPEN -> CANCELLED`: only the requester may cancel.
- `ACCEPTED -> PICKED_UP`: only the assigned courier may pick up.
- `PICKED_UP -> DELIVERED`: only the assigned courier may deliver. Set the confirmation deadline to the end of the Singapore calendar day.
- `DELIVERED -> CONFIRMED`: only the requester may confirm. Also automatically confirm delivered errands once their confirmation deadline has passed.
- Dropping is allowed only for the assigned courier while `ACCEPTED`. Clear the courier and return to `OPEN` when the deadline is still valid, otherwise if past deadline, move to `EXPIRED`.
- Automatically move overdue `OPEN` errands to `EXPIRED`. Use a separate method to check and expire errands.
- Only the requester may soft-delete `CANCELLED`, `EXPIRED`, or `CONFIRMED` errands by moving them to `DELETED`. Do not allow deletion from active states.
- Preserve the existing author-defined domain errors and their HTTP mappings, including not found, invalid transition, forbidden actor, maximum errands reached, expired errand, and deleted requester cases.

TRANSACTIONS, OUTBOX, AND BACKGROUND RECOVERY

- Use the existing event contract and event types: `ErrandCreated`, `ErrandCreationFailed`, `ErrandStatusChanged`, `ErrandCompleted`, `ErrandCancelled`, `ErrandExpired`, and `ErrandDeleted`.
- For each lifecycle transition, append an outbox event for the requester and assigned courier where present. Use the existing `ErrandStatusChanged` event type for all transitions except creation, failure, and deletion.
- Perform each lifecycle state change and its outbox append in the same Prisma transaction using `prisma.$transaction`. Atomicity and transition ordering are required.
- Event payloads contain the errand id, new and previous status where relevant, actor information, requester and courier subjects, and the intended recipient subjects.
- Pending errands that fail to create or transition must be retried by a background worker. Use the existing `pending_errands` table to track pending errands and their next retry time. The worker should query for pending errands, attempt the transition, and update the next retry time on failure.
- Keep the generic Kafka consumer flow using configured topics and the existing `ErrandEventStream` service. The consumer should read events, process them, and handle any errors or retries as needed.

SUPPLIER UPDATE INTEGRATION

- Receive Supplier updates at `POST /internal/errands/supplier-events`, protected by the existing Errand internal service token.
- If a supplier becomes non-operational, soft-delete its `OPEN` and `ACCEPTED` errands transactionally and append `ErrandDeleted` events for the requester and assigned courier where present.
- Otherwise update the stored supplier name and pickup-location snapshot for affected `OPEN` and `ACCEPTED` errands.
- Return whether the event was processed and the ids of affected errands. A missing supplier id is not processed.

# Key Prompt 2:

You are now implementing the Errand backend integration with the Credit Estimation service defined in credit-estimation-service/backend. The Errand backend is the caller and the Credit Estimation service is the callee. The Errand backend will expose a single authenticated internal route to the frontend for credit estimation.

- Expose the existing authenticated internal Errand route used by the frontend to request a credit estimate.
- Accept name, description, service type, instructions, start time, deadline, and non-negative available credit. Supply the authenticated subject as `userId`.
- Call `POST /internal/estimation/estimate-credit` with `x-user-id`, using the configured timeout.
- Show the returned min and max credits to the user, along with the reason. If the estimation returns `minCredits = -1` and `maxCredits = -1`, show "Unable to estimate credits for this errand", do not show the reason. Otherwise, show the min and max credits and the reason.
- If the user has insufficient credits for the minimum estimate, show "You have _ credits, but _ credits are suggested."
- Map estimation rate limiting to the Errand rate-limit error, other valid 4xx responses to invalid estimation, and network or server failures to unavailable estimation.

Please scaffold the application wiring, validators, controller handlers, repository transactions, locks, outbox blocks, Supplier and estimation clients, internal routes, SSE lifecycle stream, Kafka consumer, pending worker, error translation, and Docker integration for the flow above. Reuse the existing contracts and middleware. Do not invent states, errors, events, endpoints, timing values, or cross-service responsibilities.

# Usage Scenario:

Scaffolded and drafted the author-defined Errand lifecycle, validation, transactional persistence, locking, outbox, Supplier updates, credit-estimation proxy, and recovery flow, then assisted with integration and build debugging.

<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: transcribed the author's decisions word for word and listed the questions they answer; facts about the User and Supplier services were read from their code.
Author review: Reviewed and approved by @mattis.
-->

# Order Service: User and Supplier integration

Replace the User and Supplier stubs in Order Service with real HTTP adapters. Credit integration is a separate PR.

Every decision below is @mattis's, quoted word for word from the conversation on 2026-10-18. The questions are Claude's, given so each answer can be read in context.

## Facts the decisions rest on (read from the code)

- User Service: `GET /auth/verify`, called with the caller's `Authorization` header unchanged, returns `{ id, role }`; `401` for a missing, invalid or expired token or an account that isn't `ACTIVE` (`user-service/src/auth.ts`, `user-service/src/authenticate.ts`).
- Supplier Service: `GET /api/v1/suppliers/:id` requires authentication. It returns an `ACTIVE` supplier to any caller, and an `ARCHIVED` supplier (`status: "ARCHIVED"`) only to an `ADMINISTRATOR`; otherwise `404` (`supplier-service/src/suppliers/http/supplier-catalogue.service.ts`).
- Order Service today: `StubSessionVerifier` and `StubSupplierDirectory` in `order-service/src/adapters/`; an unusable supplier gives `422 SUPPLIER_UNAVAILABLE`; a database failure gives `503 SERVICE_UNAVAILABLE`.

## Decisions — round 1

**Q1. What should Order do when an administrator creates an errand for an archived supplier?**

> Order Service should reject the creation of an errand for an archived supplier, with an appropriate error message indicating that supplier is archived, unarchive to create a new errand

**Q2. What should a caller get from Order when User or Supplier is down or slow?**

> When services are down, the user should get an internal server error message, these services are critical in order lifecycle and as long as one of them are unavailable during order creation we cannot proceed with the lifecycle.

(The status code was changed in round 2, item 3.)

**Q3. Should Order forward the caller's own token to Supplier, or authenticate another way?**

> keeping things simple, we should just forward the callers token to the supplier service.

**Q4. Should the stubs stay as a selectable mode for tests and the demo?**

> yes stubs can stay as a selectable mode

## Decisions — round 2

**Conflict between Q1 and Q3:** Supplier returns `404` to a member for an archived supplier, so Order can tell "archived" apart only for an administrator caller.

> to resolve the conflict between answers 1 and 3, keep forwarding the token and narrow the requirement. This needs no change to Supplier and no new credential.

**1. Status and error code for an archived supplier**

> Archived response: 422 SUPPLIER_ARCHIVED, with the message "Supplier is archived; restore it to create an errand." It's a 422 for the same reason as the existing SUPPLIER_UNAVAILABLE: the request is well formed but refers to a supplier that can't be used.

**2. Unknown supplier**

> Unknown supplier: keep 422 SUPPLIER_UNAVAILABLE for an ID that doesn't exist, and for any archived supplier a member asks for.

**3. Status code when a service is down**

> When service is down we can use 503 SERVICE_UNAVAILABLE instead of 500.

**4. User Service down on requests other than creation**

> User service down we should return the same 503.

**5. Timeouts**

> For timeouts we can use 1000ms for user verify and 2000 for supplier lookup, make both configurable via environment variables.

**6. Mode values**

> AUTH_MODE=http and SUPPLIER_MODE=http.

## Decisions — round 3

**Names of the timeout and base-URL environment variables, and which branch this goes on**

> feat/order-service-core has been merged, it should go on a new branch that branches of main, env vars should be called USER_SERVICE_VERIFY_TIMEOUT_MS, SUPPLIER_SERVICE_LOOKUP_TIMEOUT and USER_SERVICE_BASE_URL and SUPPLIER_SERVICE_BASE_URL.

**Follow-up: `SUPPLIER_SERVICE_LOOKUP_TIMEOUT` has no `_MS` suffix, unlike `USER_SERVICE_VERIFY_TIMEOUT_MS`. Is that name final, with the value still in milliseconds?**

> add the _MS suffix

So the four variables are `USER_SERVICE_BASE_URL`, `USER_SERVICE_VERIFY_TIMEOUT_MS`, `SUPPLIER_SERVICE_BASE_URL` and `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS`.

## Decisions — round 4

Questions:

- **Q1.** Besides `200` and `404`, Supplier can return `401`, `400`, `403` or `5xx`. What should Order return for each?
- **Q2.** What should Order return when User answers with something other than a valid session or `401`, such as `5xx`?
- **Q3.** What should Order do when either service returns `200` with a body it can't use (a missing field, an unknown `role` or supplier `status`)?
- **Q4.** Should Order retry a failed or timed-out call before giving up?
- **Q5.** In `http` mode, should Order refuse to start if `USER_SERVICE_BASE_URL` or `SUPPLIER_SERVICE_BASE_URL` is unset?
- **Q6.** Should `compose.yaml` run order-service in `http` mode by default, and wait for `user-service` and `supplier-service`?
- **Q7.** Compose already passes `${USER_SERVICE_VERIFY_TIMEOUT_MS:-1000}` from `.env` to Supplier. Should one `.env` setting control both services?
- **Q8.** Should `scripts/demo.sh` log in through the real User Service and use a real supplier, and should there be a test against the real services?
- **Q9.** What text should the `503 SERVICE_UNAVAILABLE` response carry?

Answer:

> Q1: If Supplier returns 401, Order returns 401. If it returns 404, Order returns 422 SUPPLIER_UNAVAILABLE. On 400 or 403 which should not occur,  Order returns 500 and logs it. A 5xx, timeout or network error gives 503. Q2: If User returns a 5xx, time out or can't be reached, Order returns 503. Any 4xx other than 401 returns 500. Q3: If either service returns a 200 with a payload that Order service does not expect, order will return 500 and log. Q4: No retries needed. Q5: Yes, refuse to start if unset Q6: Yes, compose runs in http mode by default. Q7: Order should get its own setting here, so there is less coupling Q8: we can switch to real logins, keep stubs for unit tests Q9: just use the message Service temporarily unavailable, please try again

## Decisions — round 5

Questions:

1. In compose, should order-service wait for `user-service` and `supplier-service` to start first?
2. Inside the container the timeout variables keep the spec's names, but `.env` already uses `USER_SERVICE_VERIFY_TIMEOUT_MS` for Supplier. What should Order's settings be called in `.env`?
3. Should the database-failure 503 change to the new message, or keep "Service temporarily unavailable"?
4. When Supplier returns `401`, what error code and message should Order's `401` carry?

Answer:

> Q1: order-serivce should wait for user-service and supplier-service to start first 2. Prefix them with ORDER_ 3. Actually we can just keep the existing message Q4: the same UNAUTHENTICATED, "A valid session is required" as the Order Services own 401, so frontend only need to handle one status code

## Decisions — round 6 (after feat/order-credit-intergration was merged into main)

Main gained its own User Service integration (`AUTH_MODE=user-service`, `UserServiceSessionVerifier`, a shared `USER_SERVICE_VERIFY_TIMEOUT_MS`, and a startup check refusing `CREDIT_MODE=kafka` without real sessions). The author chose, when rebasing this branch onto it (selected options, verbatim):

1. **Which AUTH_MODE value selects the real User Service?** — "http (your spec)"
2. **Which User Service verifier stays?** — "Yours (HttpSessionVerifier)"
3. **Which .env setting controls Order's User Service timeout?** — "ORDER_ prefixed (your spec)"
4. **Main refuses to start with CREDIT_MODE=kafka unless sessions are real. How should that check treat your modes?** — "Drop the check"


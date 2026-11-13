# ADR-029: Isolated real Pub/Sub push into local Docker Credit

- Status: Approved by Vincent on 2026-10-09; local implementation in CHANGE-088;
  live cloud/browser/ledger verification remains required.
- Authority: explicit approval to implement the proposed local-live override,
  restricted HTTPS tunnel, isolated test topics/subscriptions and Google push auth.
- Refines ADR-021 for local testing only; preserves ADR-013/025/026/028 contracts.
- Amended on 2026-10-09: the restricted ingress now exposes the three typed
  Credit push paths instead of the removed shared event path.
- D1 chain: F4.1.7 cancellation, F4.1.8/F10 expiry, F4.1.5/F5.1 completion,
  F11 abort/reopening and NFR3 testing;
  approved technical invariant of real broker transport and scoped credentials.

## Approved design

Use compose.yaml + compose.http-peers.yaml + compose.local-live.yaml. The new
override activates existing Order prod security with demo-foc Auth emulator and
HTTP User roles, keeps local PostgreSQL URLs/volumes, and selects real HTTP peers.
Credit and Supplier resolve roles over the already implemented User API.
Default Compose, deployment files and sibling source remain unchanged.

Docker cloudflared creates a temporary public HTTPS Quick Tunnel. Its origin is
an Order-owned nginx helper, not the gateway or whole Credit API. Nginx accepts
only POST on `/api/credits/internal/order-events/open-refund`,
`/accepted-cancellation`, and `/completion`, preserves Authorization and JSON,
and forwards unchanged to credit-service:8080. Other paths/methods are rejected.
Health is on a separate internal port. No helper host ports are published.
Credit retains its Google signature, issuer, audience and verified SA checks;
neither Firebase tokens nor a private URL substitute for push authentication.

Project ID and developer namespace are explicit. Three isolated producer topics
use *-local-<developer>-v1 names. Only refund and completion have Credit push
subscriptions. Accepted cancellation stays User penalty signaling; the existing
incompatible Credit consumer is not changed or subscribed here. User subscribers
remain peer work; publishing alone does not perform penalties.

A stable custom audience https://foc-local-<developer>.invalid/credit-push matches
Credit and the subscription. It identifies the receiver; it is NOT a destination.
The real push endpoint is the current trycloudflare.com URL plus the event path.
One real foc-local-<developer>-push service account has no JSON key. Topic-scoped
publisher IAM is granted to the developer; token creation is scoped to this push
SA for the Pub/Sub service agent. DLQ publisher/source-subscription subscriber
rights are scoped to this test's resources. No project-wide publisher grant or
Cloud Run invoker grant is necessary for the local receiver.

The setup script verifies owned namespace labels and topic association before
updating existing subscriptions. It will not retarget unlabeled/team/staging
resources. Two subscriptions retry with backoff and use an isolated DLQ/recovery
subscription. Resource creation is not atomic: a permission failure can leave
owned resources; rerun after the owner grants rights. Do not test until Check
succeeds. A failed push is not acknowledged by nginx; Credit sends 204 only after
processing. Existing eventId deduplication and outbox semantics remain unchanged.

Quick Tunnels are temporary development tooling, not production infrastructure.
Hostname changes on recreation; rerun Setup and Check afterwards. Pause switches
only owned test subscriptions to pull before Docker down, retaining backlog.
Docker down preserves named volumes; it does not delete cloud resources. Cleanup
is explicit after inspection, not automatic destructive reset. Personal ADC stays
read-only mounted; never commit .env/keys or share production/customer data.

## Sequence

```mermaid
sequenceDiagram
    participant B as Browser (local Auth emulator token)
    participant G as Local gateway
    participant O as Local Order / outbox
    participant C as Local Credit / PostgreSQL
    participant P as Real isolated Google PubSub
    participant T as HTTPS tunnel + restricted nginx
    B->>G: Authorized Order action
    G->>O: Existing API and bearer
    O->>C: Existing reservation / assignment / reset HTTP calls
    C-->>O: Existing successful response, or fail closed
    O->>O: Commit state and event intent atomically
    O->>P: Typed event JSON; stable eventId
    P-->>O: Publication messageId (NOT financial confirmation)
    P->>T: Wrapped POST + Google-signed OIDC bearer
    T->>C: Same path, bearer, headers and body
    C->>C: Validate identity/subscription; deduplicate; refund or transfer
    C-->>P: 204 after processing, via tunnel
    B->>G: Existing balance/list polling
    G->>C: GET /api/credits/me with user bearer
    C-->>B: Local authoritative balance
```

## Verification and boundary

Write/run configuration and helper safety tests first. Verify actual nginx route,
method denial, header/body preservation with isolated fixture containers. Check
cloud subscription identity/endpoint/DLQ and unauthenticated push rejection.
Finally use two real local test accounts for cancellation, expiry, both abort
deadline branches and completion; match outbox/eventId, local processed event,
reservation and balance. Test duplicate processing and delivery recovery.
Component/synthetic routing tests are not authenticated cloud financial tests.
Background repost delegation/retries, missing User consumers and Cloud Run scale
behavior remain separate gates; no Sprint completion claim.

## Rollback

Pause owned test push subscriptions, stop the local stack without -v, then omit
the local-live override to restore existing mock/HTTP profiles. Keep failed-event
and DLQ evidence until reviewed. No database migrations or app data deletion.

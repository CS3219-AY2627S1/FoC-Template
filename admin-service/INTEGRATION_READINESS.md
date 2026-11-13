# Admin integration handoff and unresolved decisions

Read this file before final integration/acceptance and update each item with producer evidence.
Requested by Darryl during the conversations iteration. This tracks dependencies, not new product
requirements or approval of draft interfaces. Product scope remains in the Admin specification;
wire shapes in `docs/contracts/` remain review drafts until the affected owners agree them.
Never replace an unavailable dependency with synthetic data in application code.

## Kafka replacement — 10 November 2026

### Report-context consumer repair — 11 November 2026

The producer now emits `REPORT_REQUEST_AVAILABLE` instead of `PREPARATION_AVAILABLE`.
Admin and Order consumers support the canonical status and accept the former spelling during
mixed-version rollout. The historical acceptance record below uses the spelling observed then.
Order now renders and polls `PREPARING_REVIEW`; Admin's entry page labels it as a saved request,
not an accepted report. An actor's pending preparation takes precedence over general verified
participant navigation, avoiding a second form while their statement is still being prepared.
Both consumer validators reject malformed case/status combinations. Consumer regressions read
the generated producer schema, rather than relying solely on copied status fixtures.
The schema fixtures are read through Node's filesystem API only when tests execute. They are
not static TypeScript imports: Admin and Order Docker builds copy only the owning service's
frontend, so repository-level contract files are intentionally absent from those build contexts.

Audit scope: report-context callers and response validation, report preparation/status polling,
assignment preparation, closure-pending UI and removed synchronous dispute-write callers in
Admin, Order, Chat and Credit runtime sources. No remaining calls to those removed write routes
were found. Reporting documentation was reconciled with the existing Kafka semantics.

Verified locally: 159 Order and 124 Admin frontend tests; both frontend builds and lint; 72 Admin
HTTP/PostgreSQL workflow tests (none skipped); generated-contract/schema validation; 18 shared UI
checks. Desktop, 375px and keyboard navigation from errand to report form/private preparation
status were checked with isolated synthetic fixtures. This verifies the source repair, not a new
live deployment or an end-to-end Kafka acceptance run. Updated Admin and Order artifacts must
ship together; the existing running deployment was not changed by this repair.

The user-approved [Kafka coordination contract](../docs/integration/dispute-kafka-contract.md)
replaces the synchronous dispute writes and supersedes the HTTP rollout notes below. The single
shared editor is this Admin task; affected owners remain Darryl (Admin/User), XueTing (Order),
Eldridge (Chat/Credit) and Jun Hui (broker/shared runtime).

**Prepared and verified:** forward-only owner-local inbox/outbox/stage migrations, credential-free
commands/outcomes, bounded leased workers, immutable identities, current authorization, independent
review and private-chat drains. Obsolete dispute HTTP clients/routes, exclusive URLs, pins and
network edges were removed; the current-account and evidence/conversation read identities remain.
The interrupted HTTP rollout was inspected and reconciled. Test accounts, private keys, databases
and PVCs were retained; no blanket rollback, key rotation or data reset occurred.

**Local deployment:** source base `8a986a27` plus this uncommitted replacement, context/namespace
`foc-local`, gateway `http://127.0.0.1:8089`. Admin/Order/Chat use
`local-8a986a27-kafka-20261110-v2`; Credit/Gateway/Supplier use
`local-8a986a27-kafka-20261110-v1`; User uses `local-8a986a27-20261110`.
All selected application rollouts are ready. Deployment files pin these local-only images;
build and load them before applying on another local cluster. No images were published.

**Verification:** 65 distinct Admin PostgreSQL workflow cases (64-case suite plus the final legacy
membership regression), 7 Order PostgreSQL cases, 10 Chat integration cases, 3 Credit settlement
cases, and 5 focused Order/Chat coordinator tests pass. Admin UI passes 106 tests, lint and
production build. The shared UI contract passes 12 checks; Compose validates all 31 required
variables across five environments. Generated contracts validate 43 HTTP operation fixtures,
existing event/WebSocket shapes, eight new dispute variants and invalid identity/version/credential
cases. Kafka initializer CLI-mock regressions and real local topic/ACL initialization pass.

**Real local business evidence:** test errand `0fa526ed-79f6-4fbe-a29e-1b75132e0fb1`, case
`656b14c6-7df3-3072-bc5e-e1470727c59f`. With Chat scaled to zero, context remained
PREPARATION_AVAILABLE and POST returned 202; Order froze while the report remained PENDING with
no accepted statement. Chat was restored in a finally block; both confirmations made the report
READY. Complete real evidence was available. The independent test admin assigned the case and
closed it through the GUI with RETURN_TO_REQUESTER. Order became COMPLETED/DISPUTE_RESOLVED,
Admin became RESOLVED, and Credit returned the two-credit hold. Two exact HTTP closure retries
returned identical 200 receipts with exactly one RESERVATION_RELEASED ledger entry for operation
`9ed56080-74e4-4a09-9de7-ca784b71fa2e`. The completed smoke left 10 available and zero reserved
credits before preparing the separate one-credit manual test case. Shared-topic outcomes for other
logical consumers now finish cleanly; all four coordination inboxes/outboxes showed zero pending
work and quarantine after recovery. Desktop/375px checks showed no horizontal overflow and visible
keyboard focus. The two local test accounts sign in and switch to their assigned roles.

**Manual test fixture:** fresh errand `3280621f-ad3c-4b20-8da7-a43f5399c5e9`, case
`1ceb89cb-d437-37f1-b352-1e74008cde55`, is OPEN/READY with no reviewer. It holds one local
credit for the user's manual assignment/closure test. No test credentials are recorded here.

**Acceptance remaining:** the user has not yet manually accepted the new local flow. Affected-owner
review remains required before merge/shared deployment. No AWS deployment, commit, push, merge,
publication or production acceptance is claimed by this task.

## Report review continuation — 10 November 2026

The [dispute review contract](../docs/integration/dispute-review-contract.md) adds owner-controlled freeze/finalization APIs and original Chat messages/images. This iteration has not been deployed or accepted against the running multi-service system. Existing cases require barrier reconciliation; updated service pins, migrations and network reachability are rollout prerequisites. Earlier integration acceptance below does not cover this change.

## Integration completion — 9 November 2026

This section supersedes the producer-gap status below for this iteration; historical acceptance
results remain evidence only for their recorded images. Darryl approved Admin/User work, then
explicitly authorized necessary Admin/Chat/Credit/Order/User repairs and nominated this task as
shared editor. The recovery lookup, ten-minute snapshots, durable closure barrier and owner
operation-read refinements were explicitly approved in this chat; see
[the protocol](../docs/integration/chat-admin-contract.md#integration-completion-refinements--9-november-2026).

Preservation: branch `codex/admin-service-integration-completion` starts at `61c7062`, equal to
freshly fetched `origin/main`. There were no tracked uncommitted changes at entry. Existing
untracked caches, Postman material, `output/` and `tmp/` were retained. No commit/push/merge
occurred during implementation or rollout; publication was separately requested after acceptance.

Prepared implementation:

- Admin recovers missing local conversation confirmation through an authorized Chat GET,
  without another creation POST. Resolution persists an actor/body/revision-bound preparation,
  blocks new writes, waits for Chat's durable drain acknowledgement outside its locks, and
  commits its decision/CaseResolved atomically. The GUI can resume the original operation after
  browser retry storage is lost. Missing/outage/uncertain outcomes remain distinct.
- Chat rechecks current case/account access for metadata, messages, images and live recipients;
  authorized reviewing admins can read without being inserted as writers. Actor denial does not
  permanently lock a thread. Order terminal events target ERRAND conversations only. Creation
  requires the assigned reviewer and binds its request hash to that actor. Durable snapshots
  preserve pagination and historical assignment periods. Source timestamp comparison accounts
  for PostgreSQL microsecond precision; identity/content validation remains strict.
- Credit has its own correction command listener, durable operation/inbox/quarantine/outbox,
  available-only ledger effect and explicit wallet label. User eligibility is checked before
  Credit locks accounts. Replays republish the original outcome, including after actor revocation.
  Reserved credits stay unchanged; rejection/rollback/overflow are owner decisions.
- User exposes its original sanction outcome to authenticated Chat only. Chat reconciles original
  User/Credit outcomes against Admin's stored ownerEventId before claiming case-action coverage.
  No global User version or unrelated stream checkpoint is used as sanction coverage.
- Chat's independent `chat-service-timeline` listener retains original Admin/owner envelopes;
  HTTP producer exports reconcile the safe timeline/backfill view. Both lifecycle and case-event
  listeners commit through a separate transactional bean before acknowledging. Invalid/conflicting
  raw facts are retained in Chat quarantine and their offsets are not silently skipped.
- Order/Credit service assertions enforce pinned subject/key, audience, RSA strength, lifetime,
  issued/not-before times and nonblank assertion identity. Order lifecycle business rules are unchanged.

Final isolation checks: Credit full backend suite **69/69**; Admin affected PostgreSQL workflow,
access/client and resolution HTTP checks **51/51**; Chat full backend suite **26/26**; Order real
PostgreSQL lifecycle/evidence and signed service-assertion checks **12/12**; User sanction domain
and actual Kafka listener/outbox checks **10/10**. All had zero failures/errors/skips. User's
separate signed HTTP/current eligibility/context checks passed 15 (overlapping sanction coverage);
the new route rejects anonymous/wrong-audience/non-Chat callers and distinguishes 404 absence.
The real User listener applied a test-fixture ban, emitted its original outcome through Kafka,
and replayed it after real reactivation without rebanning. Credit used an actual disposable broker
pause/recovery. Admin baseline's other unchanged checks remain covered by the earlier 94-test run
(one disposable Kafka startup timeout was rerun successfully). Admin GUI **78/78** and Credit GUI
**19/19**, lint, TypeScript and production builds passed. OpenAPI/41 HTTP fixtures, 11 event fixtures,
negative/schema/reference checks, five shared UI checks, Compose's 31 required variables across
five environments and YAML parsing passed. These do not yet establish deployed business acceptance.
Producer HTTP responses, accounts and command publishers inside isolated tests are explicitly
test-owned fixtures; User/Credit outcomes and effects come from the actual owning implementation.

Runtime preparation targets existing context/profile/namespace `foc-local` and the loopback-only
gateway at `http://localhost:8089`. The signed-in GUI was verified against the original published
images, not the new code. Final local image tags are
`foc-{user,chat,credit,order}-service:local-61c7062-completion-20261109-v2`, with Admin's final
corrective tag `foc-admin-service:local-61c7062-completion-20261109-v3` (built, loaded and deployed).

| Built service | Local OCI image-index SHA-256 |
| --- | --- |
| Admin v3 | `92ffcb65470f3d11f1a16758eb1c0c33f93dfa79f2cfb0710102af0610d4ece6` |
| User | `c5a4d42f1ce2d44cc32ee9fab1ef9b2961b57e096cba686fdc291d82651981dc` |
| Chat | `80d41ebcef76b8fca68accd87096227e04826a5456a44b786ea966012ec8f5f7` |
| Credit | `e28a30f95c520f3caf01e04dba0e3a63840730b47870c9c66f371357a9185c9d` |
| Order | `b3476f357afba813be9f4520ab95f4c1a8e64aba06b56a46f27b3454a196fdfc` |

The remote was fetched again before rollout preparation; the branch still has zero divergence
from `origin/main` at `61c7062`. These images additionally include this task's uncommitted worktree
changes. Server admission dry-runs passed all five Deployments, Credit configuration and RabbitMQ.
Kafka's disposable mock-CLI initializer test passed serial execution/retry/failure checks; actual
cluster ACL reconciliation and source delivery remain rollout checks.

Prepared configuration enables existing User sanctions and Credit corrections, adds only Chat's
documented case/outcome read ACLs, and provisions only a missing independent Credit signing key
plus its public User pin. Existing DB/JWT/service keys and PVCs must be retained. RabbitMQ's
existing CLI ping succeeds but exceeds its five-second readiness budget under load; the prepared
timeout is 15 seconds and diagnostics use one Erlang scheduler (verified against the installed
RabbitMQ script). No broad network exception or internal gateway route is added.

The user explicitly confirmed completed affected-owner reviews and instructed rollout: Eldridge
(Chat/Credit), XueTing (Order), Jun Hui (broker/shared runtime), Darryl (Admin/User).
`Apply-LocalKafka.ps1 -InitializeOnly` validates unchanged runtime scripts
and updates only the initializer/ACL job, without redeploying the broker, UI or credentials.

Deployed checks, 9 November ~11:20 SGT: all five application Deployments rolled out; Admin V9,
Chat V7 and Credit V6 migrated successfully. Kafka job `kafka-init-d100a5caf3` completed. User
`user-service-admin` and Credit `credit-service-admin` received actual command partitions. Chat
started before the ACL job completed and stopped its timeline consumer on authorization failure;
a restart after ACL completion recovered it: actual assignment includes all three partitions of
each of `admin.events`, `credit.admin.events` and `user.admin.events` (nine total), plus the
separate lifecycle group. Rabbit connectivity recovered with a real authenticated connection.
RabbitMQ required an explicit pod restart because its old unready pod blocked StatefulSet rollout;
both startup and readiness CLI budgets are now 15 seconds and it is 1/1 Ready. All eight PVC UIDs
match the pre-rollout snapshot. No database or Kafka broker restart, credential rotation or storage reset.
The existing Credit signing identity was absent: only its new independent key/public User pin were
added. Existing Admin/Chat trust pins verified unchanged.

The deployed Admin smoke passed health/OpenAPI/UI, anonymous and invalid-token 401, private
gateway-route 404, V9 persistence, actual Admin outcome assignments and the allowed/denied TCP
matrix (including Admin denied User DB). Signed Chat-to-User/Order/Credit/Admin, Admin-to-Chat
and Credit-to-User probes passed current trust; wrong audience returned 401. Chat-only operation
reads returned 404 for an unknown operation from both User and Credit. These probes do not assert
business outcomes. The subsequent completed real GUI acceptance used case
`af44f37e-c126-4911-886e-26469ce29564` and labelled test errand
`bb9932ec-2dc0-4a5f-8993-e65dbe5988bb` (one credit reserved through actual services).

Live GUI exposed an additional compatibility defect: the original Order snapshot emits an ISO
offset timestamp at minute precision (`2026-11-09T10:00Z`), rejected by Admin's seconds-only
`Instant.parse`. Chat had successfully created snapshots and all producer exports returned 200.
Admin now parses offset date-times and emits canonical UTC seconds for its public deadline;
offset-free timestamps still fail closed. Six timeline-client checks, including this regression,
passed. Admin's corrective image is `local-61c7062-completion-20261109-v3`, OCI index
`92ffcb65470f3d11f1a16758eb1c0c33f93dfa79f2cfb0710102af0610d4ece6`; other services retain v2.
Its rollout completed successfully. The full deployed Admin smoke/isolation/consumer-assignment
check passed again on v3. No original event payload or business state was rewritten.

Initial GUI observations: own report OPEN, claim UNDER_REVIEW, persisted private self-message in
conversation `35f8ada9-f32f-4f41-a5c8-3158b4722171`. Cancelling the labelled OPEN errand produced
real Credit release and restored wallet 10 available/0 reserved. A temporary +1 administrative
correction completed SUCCEEDED through real Kafka. A paired -1 restoring correction was prepared;
automatic review required user handoff for the financial confirmation, which the user reported
clicking. After v3 recovery the same operation completed SUCCEEDED at 11:36:01 SGT and timeline
showed available 10/reserved 0; no replacement request was created.

Final live workflow, ~11:40 SGT:

- Both +1 and -1 corrections SUCCEEDED; original Credit outcomes were reconciled through the
  Chat-only reads and matched Admin's stored owner event identities. The real User self-ban
  command was REJECTED at 11:36:36 SGT with self-access protection; account stayed active.
- A second message at 11:37:15 persisted in the same conversation after Order cancellation.
  CASE remained writable while the case was UNDER_REVIEW; ERRAND cancellation did not lock it.
- The GUI displayed COMPLETE evidence, zero blocking gaps and 13 original records, including
  Order, Credit, Admin and User outcomes. Resolution fetched fresh producer evidence itself.
- Resolution committed RESOLVED revision 10 with the rejected-action explanation. Chat's
  durable barrier made the same conversation read-only; both messages remain visible and the
  send form is absent. Reloaded participant report shows RESOLVED revision 10, its own original
  statement and private read-only history, without Admin's private resolution reason.
- Screenshot: `output/integration-completion-resolved.jpg`. Runtime platform image IDs are in
  `output/integration-completion-runtime-images.txt` (distinct from host OCI index hashes).
  Admin v3 platform digest: `8d475dec0272cba5e37d88c21515fce2a9300dbd677b2a4f0b5c1eb38c458eb5`.
  Final PVC comparison is identical. GUI remains loopback-accessible at `http://localhost:8089`.
  Final wallet GUI independently confirmed 10 available/0 reserved and seven ledger entries,
  including the two explicitly labelled administrative corrections; its test balance is restored.

Acceptance limits and precise owner handoffs:

- Darryl/Admin/User: accepted the demonstrated case, final wallet 10/0 and resolved read-only
  participant history. A live positive ban/reactivation was not
  applied to another person's account. Actual User implementation + Kafka fixture tests cover
  APPLIED/replay/reactivation; any additional cluster acceptance needs a designated disposable
  second account. Never use a real uninvolved account for this check.
- Eldridge/Chat and Darryl/Admin: live GUI used one account in Requester/Admin modes. Distinct
  unrelated participant, unassigned reviewing Admin, image access after revocation, historical
  courier reassignment and immutable-page expiry were isolated-tested, not manually recreated
  with multiple cluster accounts. Use designated test accounts for optional owner acceptance.
- XueTing/Order and Eldridge/Credit: fresh labelled errand proves original lifecycle and
  reserve/release evidence. Legacy errands with missing original baseline/ledger events remain
  incomplete by design; repair/backfill requires owner-supplied original facts, never fabrication.
- No external producer implementation blocker remains for this demonstrated Admin workflow.
  Darryl explicitly accepted this iteration in chat on 9 November 2026, including the documented
  multi-account/live positive-ban limits. Final fresh fetch still reports HEAD/origin/main
  divergence 0/0 at `61c7062`; all five final application pods and RabbitMQ are 1/1 Ready.
  This describes the pre-publication worktree; code is now grouped into User, Order, Credit,
  Admin/Chat, shared wiring and verification-record commits for the requested PR. Local caches
  and test artifacts remain excluded. Images retain their verified pre-commit build identities;
  no registry publication or merge is part of this follow-up.

Recovery: migrations Admin V9, Chat V7 and Credit V6 are additive and never rewrite applied
migrations. After a closure preparation or correction exists, an old image that ignores the barrier
or cannot read ADMIN_CORRECTION ledger entries is not a safe rollback. Preserve data and use a
compatible roll-forward repair; disabling a new consumer pauses delivery without changing IDs.
Resume pending closure with its original operation. Never clear receipts, reopen Chat, reverse
ledger rows, rotate credentials or reset storage to make acceptance pass.

## Chat integration current state

This section supersedes older handoffs below that describe Chat as documentation-only. The
merged Chat service implements eligibility, reconciliation/timeline, case initiation and public
message endpoints. Its implementation is evidence of available code, not full acceptance of the
cross-service workflow. Darryl is the editor for this Admin-only change; no producer, gateway,
Compose, CI, shared design or wire-schema files are changed by that consumer work. The separately
approved local runtime reconciliation below includes Kubernetes and network configuration.

### Admin consumer behavior

- Public Chat metadata is `{id,orderId,status,readOnly}`. Message history is an array with an
  exclusive numeric `after` and a bounded `limit`; attachments use `{id,contentType,filename,size}`.
  Admin now maps these actual producer shapes and validates thread/order/message identity, sequence
  and attachment metadata. The private initiation shape already matches Admin's consumer.
- Admin exposes read-only, no-store confirmed-reference discovery at
  `GET /api/admin/cases/{caseId}/conversations` (current active ADMIN) and
  `GET /api/admin/reports/{caseId}/conversations` (current active reporting participant in
  REQUESTER/COURIER mode, own reference only). These return arrays of the existing Admin reference
  shape. No mutation identity, duplicate processing or producer retry is needed: reads create no
  state/events and may be repeated. Current User verification remains fail-closed; an empty array
  means no Admin-confirmed reference, while User failure returns 503. Browser errors preserve that
  distinction and retry the read. Existing request/error status handling supplies observability;
  private references, tokens and messages are not logged or exported as lifecycle facts.
- Reload uses confirmed references without a creation POST. Participants automatically open their
  own thread; admins select a reporting participant, including historical couriers who reported.
  Existing original-key initiation/send recovery remains scoped to actor/case/participant/thread.
  Unknown non-reporters stay hidden. Neither browser IDs nor the timeline automatically grant
  callback membership. Chat's separate REST authorization remains authoritative for message access.
- Each initial/history-page read and send rechecks current Admin access and Chat metadata. Either
  service's read-only decision disables replies, including RESOLVED cases with stale Chat metadata.
  This is client defense only; it does not repair Chat's server-side read/write/revocation races.
- Reporting completeness now requires the requested order's exact
  `order-service/order.lifecycle.events` checkpoint, rejecting duplicate checkpoint claims, lag,
  gaps, identity mismatch and missing coverage. Timeline validation remains strict; no producer
  data is fabricated or silently relabeled COMPLETE to make integration pass.

### Producer issues requiring owner agreement

These are findings from the merged source, not fixes authorized in another service. Eldridge owns
Chat; Darryl owns Admin/User; XueTing owns historical Order evidence. Jun Hui coordinates shared
deployment changes with the affected owners. Agree exact behavior and paired tests before changes.

| Gap | Source evidence and effect | Required agreement / acceptance |
| --- | --- | --- |
| Timeline wire mismatch | `AdminChatContractService.Record.wire()` omits `stream`; Admin requires it on every record. Nonempty current responses fail validation with 503. | Chat emits the existing agreed stream identity, with actual-producer consumer tests. Do not remove Admin's validation or infer a stream from action names. |
| Historical periods | Chat `participants()` sets assignedAt and unassignedAt to the same first-seen timestamp and deduplicates by user, losing subsequent assignment periods. | Preserve authoritative Order assignment history/periods, requester semantics and repeated assignments; unknown facts remain explicit. |
| Current private reads / other admins | Chat `get`, `messages`, `requireParticipant` and attachment access use stored Chat membership; reads do not call current Admin/User eligibility. Administrators not inserted into that thread are denied despite callback permission to review. | Revalidate current account/case access on REST, images and WebSocket paths; permit authorized reviewing admins without giving write access; test unrelated/revoked accounts. Admin's lookup never grants Chat membership. |
| Read-only creation and identity | `openConversation()` checks canReadConversation rather than requiring write access for a new thread, creates READ_ONLY rows when write is false, and hashes participantId without binding the initiating actor. | Only the current assigned reviewer creates under UNDER_REVIEW; authorized read-only recovery reads an existing identity without creation. Same key with changed actor/body conflicts according to the agreed operation scope. |
| Unconfirmed creation recovery | Chat has no case/participant read-only discovery route. Admin can recover only references it confirmed locally. A committed Chat create with a lost response/failed Admin save remains uncertain after closure or revocation. | Agree caller/producer, privacy-filtered absence versus unavailable, stable operation/reference identity, retention, authorized retry/reconciliation owner and observable outcomes. No participant POST lookup or guessed endpoint. |
| Closure/write races | Chat checks the Admin callback before its message write without a shared state protocol. `CaseConversationAccessGuard` permanently marks the entire thread READ_ONLY after a false per-actor write decision; that can conflate another admin's lack of write permission with case closure. | Separate actor denial from terminal case state; define closure/send race behavior and enforce it on all write paths. A refreshed UI flag is insufficient acceptance. |
| Recovery/snapshot completeness | Timeline reconciles on every page and rejects cursors when the current revision changes instead of retaining a pinned snapshot. Zero committed sequences are always labeled a gap. Coverage does not reconcile case-linked User sanctions or credit correction streams separately. | Agree snapshot lifetime/restart semantics, valid empty baselines and case-linked action coverage; test mutations between pages, action outcomes, gaps/conflicts, lag and producer outage. Never claim financial/sanction coverage from an unrelated checkpoint. |

### Runtime/trust findings

Repository addresses align for Compose: Admin → `http://chat-service:8085`, Chat → Admin 8084,
User 8081, Order 8082 and Credit 8083. Gateway has `/api/chat/**` and `/ws/chat` routes; Admin's
dev proxy forwards `/api/chat` to gateway 8088. Private `/internal/**` calls stay service-to-service.

Both sides validate separate RS256 service assertions and Admin supplies the original JWT using
`X-Actor-Token`. Runtime must configure independent signing keys and pinned public trust maps:
Chat trusts Admin; Admin trusts Chat; User/Order/Credit trust Chat for their respective internal
reads. Every service must validate the same User issuer/audience/JWKS. Optional empty Compose
key/trust defaults fail closed and are not proof of a working trust chain. No secrets were printed.

Before the approved reconciliation, the Chat Kubernetes ConfigMap omitted CHAT_ADMIN_URL/CHAT_USER_URL/CHAT_ORDER_URL/
CHAT_CREDIT_URL, leaving loopback defaults inside the Chat pod. Its secret initializer provisions
database/RabbitMQ passwords only, not Chat service signing/trust. `chat-service/k8s/network.yaml`
lacked Chat egress to Admin/Order/Credit; both ends of each default-deny path required review. Admin
already permits its Chat egress and Chat callback ingress. These are Chat/shared deployment handoffs,
now reconciled under the user's separate explicit runtime authorization, as recorded below.

### Reconciled published deployment and real acceptance results

This current result supersedes the historical deployment below. User explicitly approved trust,
Kafka, ConfigMaps, narrow network rules and the six-service rollout on existing `foc-local`.
Selected manifests have zero live diff. Existing PVC identities, data and signing keys were retained.

Admin/User/Chat/Gateway/Order/Credit run published revision
`ce035eee7ff4eda6972fa4554714051b6314b209`, from successful
[CI run 42501172138, attempt 1](https://github.com/AY2627S1-CS3219-P12/FoC-Team-12/actions/runs/42501172138).
Each ready pod's image ID matched its registry index digest. **These images exclude the Admin
consumer/discovery fixes in this PR.** Admin migrations V1–V8 succeeded.

The checked-in Kafka helper completed topic/ACL reconciliation; lifecycle configuration checks
now pass. Admin's two outcome groups and Chat's Order lifecycle group have real assignments.
Signed probes from final Admin/Chat pods reached all five intended producer routes; wrong audiences
returned 401. Public Order/Credit OpenAPI hides internal exports: absence there does not establish
absence of the API. Signed probes reached those routes. Deployment smoke passed health, token
rejection, private-route isolation, allowed service connections and denied cross-database paths.
Chat connected to RabbitMQ using its corrected FQDN. Explicit Chat dependency URLs, narrow network
paths and numeric non-root UID/GID now match the runtime. Only missing public Chat pins were added
to Order/Credit; no signing identity was replaced. Redundant side-chat policies were removed after
canonical equivalents became active. `Reconcile-ChatTrust.ps1` defaults to read-only verification.

With authorization to create errands, the personal account created the explicitly labeled
“Integration acceptance test - do not fulfil” errand. No administrative correction or ban was applied.

| Artifact / journey | Actual result |
| --- | --- |
| Errand `2b8c6ab2-3aa8-4ef0-b6e7-d618f4a5c926` | Real Order/Credit creation reserved 1 credit; subsequent cancellation released it. Wallet restored to 10 available / 0 reserved with reserve/release ledger entries. |
| Case `337988df-b138-4a3e-ad6e-9ee1f5bc4589` | Genuine requester eligibility/report succeeded, one statement persisted, reload recovered the same case pointer. Admin claimed it: UNDER_REVIEW revision 2. |
| Lifecycle Kafka | Read-committed broker reads matched original Admin outbox CaseOpened sequence 1 and CaseClaimed sequence 2 identities. No synthetic events published; operational consumer used no auto-commit. |
| Conversation `c674f7d7-aec3-48e8-af17-a7a2db21be53` | Real initiation and reference confirmation succeeded, revision 3/source sequence 2. Chat metadata returned HTTP 200 with `{id,orderId,status,readOnly}`. Published Admin showed messaging unavailable because its old client expects different fields. Worktree fixes address this but are not deployed. No messages sent. |
| Timeline / resolution | Evidence initially unavailable, then snapshot conflict 409. Resolution carrying actual current revision 3 also returned 409. Case retained UNDER_REVIEW revision 3, zero decisions and no CaseResolved. Investigate producer/consumer snapshots; do not weaken validation. |
| Unresolved conversation after errand cancellation | Chat changed the same thread from ACTIVE/false to READ_ONLY/true while the case stayed UNDER_REVIEW. `OrderLifecycleConsumer.lock()` updates every conversation for an order without filtering CASE threads. This is a Chat-owned failure, not resolved read-only acceptance. |

Acceptance remains **partial**. Only one identity was used. Historical couriers, unrelated-user
denial, another reviewer, real message/reload recovery and resolved history need dedicated actors
and producer repairs. No deployed duplicate-delivery or Chat/Kafka outage business acceptance is
claimed. Isolated PostgreSQL/Kafka tests below cover Admin mechanisms; the controlled User GUI
outage below used the earlier image. User sanctions remain disabled (flag unset/default false);
Credit has no correction command handler; neither owner command group exists. No producer database
access or fabricated outcomes was used.

Next owners: Darryl packages reviewed Admin fixes into a published image and verifies its GUI;
Eldridge repairs Chat timeline/snapshot, private authorization and CASE terminal behavior and
implements Credit corrections; Darryl as User owner reviews sanction listener activation;
XueTing verifies historical assignment evidence. Jun Hui and affected owners review shared runtime
changes. Obtain behavior/contract agreement before editing producer code. The manual procedure
below remains the acceptance checklist, with these current prerequisites replacing the old baseline.

### Historical baseline verification and acceptance boundary

The following records the pre-reconciliation deployment only. Its image/configuration failures
are superseded above; isolated test results remain valid for unchanged Admin code.

Target: existing Minikube context/profile/namespace `foc-local`, gateway
`http://localhost:8089` through a loopback-only port-forward. Docker Desktop and the existing
stopped cluster were resumed without replacing storage, applying manifests or rebuilding images.
Earlier sandbox checks hid the installed Docker/kubectl tools; they were not proof of absence.
The regular Compose stack remains stopped and was not used for acceptance.

The deployed Admin/User/Gateway images are `local-22bc8cc`; Order/Credit use
`arkanian4/foc-order-service:d3-1` and `arkanian4/foc-credit-service:d3-1`.
Admin's live database has successful migrations V1–V7, whereas the current source includes V8.
Published Admin OpenAPI has conversation POST only: the new confirmed-reference GETs are not
deployed. There is no Chat Deployment, Service or database/PVC in the namespace, and gateway
`GET /api/chat/preferences` returns 404. Source availability does not establish deployment readiness.

Live checks passed: gateway health/home 200; unsigned Admin queue 401; private internal route 404;
real User sign-in and switch to ADMIN; current Admin access verification and empty queue; switching
back to REQUESTER denies the Admin workspace. An eligibility read using an explicit non-business
diagnostic UUID showed unavailable/retry, including keyboard retry at 375px with no horizontal
overflow and no submission form. Admin case/statement/action counts stayed zero. This verifies
dependency failure presentation, not eligibility or unrelated-user denial on an actual errand/case.
The deployed Order GUI link `/errands/browse` returned a bearer-token-required 401; its producer/
gateway owners must verify current frontend routing/image behavior before the real errand journey.

The real authenticated broker recovered after cluster startup. Both `admin-service-credit` and
`admin-service-user` are Stable with one member, with all three respective outcome partitions
assigned. The command/outcome topics exist. `user-service-admin`, `credit-service-admin` and
`chat-service-timeline` do not exist. User has no USER_ADMIN_COMMANDS_ENABLED environment value
(the source default is false). Neither a healthy Admin listener nor an empty group proves effects.

A controlled deployed User dependency outage was exercised by reducing its existing single replica
to zero for 45 seconds with automatic restoration in a finally block. Kubernetes confirmed no
ready User endpoints. Refreshing the real signed-in Admin GUI hid the queue and showed account
verification unavailable with retry. After restoring the original one ready replica, retry recovered
current Admin access and the empty queue using the existing session. Admin/User/Gateway/Kafka were
all ready afterward, and Admin case/statement/action counts remained zero. This establishes live
identity-dependency outage/recovery; it does not establish Chat recovery or pending owner effects.

The existing Test-AdminDeployment smoke passed actual health/OpenAPI/GUI checks, unsigned and
invalid-token 401s, private gateway-route 404, Admin's seven successful deployed migrations, allowed
Admin→DB/User/Kafka and Gateway→Admin connections, and denied Admin→User DB, Gateway→Admin DB and
User→Admin DB connections. It also required actual Admin partition assignments for both outcome
topics. No database restart was requested. These are operational checks, not business acceptance.

The old public Order/Credit OpenAPI did not list internal exports. This alone did not establish
their absence: those routes are intentionally hidden from public specifications. The reconciled
signed-route probes above supersede the earlier inference of missing internal APIs.

`Check-CaseEventConfiguration.ps1 -Profile foc-local` failed on the actual target: missing
ADMIN_CASE_EVENTS_ENABLED=true, stable ADMIN_CASE_EVENTS_TRANSACTION_ID, `admin.events`, Admin
topic Write/Describe and `admin-case-events-` transaction-prefix Write/Describe. Existing single-node
transaction-state settings 1/1 and Admin cluster idempotent-write permission were present. No topics,
ACLs or enablement settings were changed. A coordinated reviewed runtime update remains required.

With Docker available, the focused Admin real PostgreSQL/Kafka suite passed **50/50, none skipped**:
CaseWorkflowTest (39), AdminPersistenceTest (1), CaseEventRelayIntegrationTest (8) and
ActionKafkaIntegrationTest (2). This includes the previously skipped confirmed-reference privacy/
closure regression, original command/event redelivery, broker outage/recovery, competing/fenced
publishers, lost database confirmation and persistence. Combined with the unchanged 44 non-container
tests already passed, all 94 Admin tests have now run successfully. Chat eligibility/timeline and
owner outcomes in these Admin tests are explicitly test-produced; no deployed ledger/account result
is established. User's existing UserSanctionIntegrationTest passed **7/7** against disposable real
PostgreSQL: actual sanction domain logic, reactivation, duplicate replay without rebanning,
self/final-admin protection, concurrent account updates and atomic rollback. It does not exercise
the deployed User Kafka listener, which is disabled. No User implementation files were edited.

Frontend 77 tests, TypeScript, production build, ESLint, changed-file formatting, five shared design
checks and diff whitespace checks passed in the consumer iteration. Repository-wide formatting
still reports nine unchanged files. The earlier labeled synthetic browser preview verified the new
conversation GUI at desktop/375px; the deployed image does not contain that GUI update.

| Requested journey | Actual deployed result / remaining prerequisite |
| --- | --- |
| Reporting and historical couriers | Blocked by missing Chat and current producer evidence deployment. Diagnostic failure is unavailable, with no business writes. No historical eligibility is claimed. |
| Claiming | No real cases exist because reporting cannot complete. Claim/revision/concurrency behavior passes the isolated PostgreSQL suite only. |
| Timeline evidence | No Chat deployment or lifecycle topic/relay. Current-source wire/history gaps above also need Chat/producer agreement before COMPLETE acceptance. |
| Private conversations and reload | No deployed Chat; Admin image lacks discovery GETs. New reference persistence/privacy/reload checks pass in isolated tests; real messaging and resolved history are pending. |
| Credit corrections | Admin Kafka consumers are live; Credit admin-command group/handler is absent. No real ledger correction or reserved-balance invariant was accepted. |
| Reversible bans | User sanction listener/group is absent. Seven producer-owned database tests pass; deployed ban, outcome delivery and reactivation remain pending dedicated participants and listener activation. |
| Resolution | Blocked by unavailable complete producer evidence and no real case. Immutable decision/action guards pass in isolated tests with labeled fixture evidence. |
| Duplicate delivery and recovery | Real isolated Kafka/PostgreSQL tests pass; no duplicate business command was injected into shared topics. Deployed exactly-once owner effects remain unverified. |

No new Admin implementation failure was reproduced in the real database/Kafka suite. The live
target's stale image/configuration is an activation dependency, not authorization to bypass missing
producer contracts, seed normal databases, forge outcomes or change another service's code.

### Manual acceptance still required

1. Through the real gateway, use one real errand with requester, current and withdrawn couriers.
   Verify eligibility/ineligibility and unavailable outcomes; never use synthetic history for a case.
2. Claim as an active administrator, verify timeline identities/periods/checkpoints and paging;
   source gaps/outages must block resolution. Check actual action outcome coverage when present.
3. Start separate reporting-participant threads. Reload reviewer and participant pages and recover
   only authorized confirmed references without another POST. Test another reviewing administrator,
   unrelated/revoked/inactive accounts, uncertain initiation, original retries and Chat outage.
4. Resolve with fresh complete evidence and settled actions. Preserve private readable history;
   reject new reports/initiation/sends/uploads after closure, including concurrent sends and direct
   Chat calls. Distinguish read-only authorization failure from permanent thread closure.
5. Repeat affected GUI journeys at desktop and 375px, using keyboard selection/composer/retry,
   visible focus and SGT timestamps. Explicit user acceptance is pending these real-service checks.

### Full GUI/business acceptance procedure after owner activation

Use the selected target consistently: cluster gateway 8089 and cluster accounts; regular Compose
8088 and its accounts are a different database. Allocate dedicated active requester R, withdrawn
courier H, replacement courier C, unrelated participant U and reviewers A/B. Use intentional
acceptance accounts/errands; do not ban or change credits on the personal sign-in account. The
baseline used personal sign-in for access checks only; the later authorized errand/report run is
recorded above, with its reservation refunded. Owners must supply or establish
the required participant accounts and genuine Order lifecycle through supported producer journeys.

1. **Reporting/history:** R creates an acceptance errand, H accepts then withdraws, C accepts it.
   R/H/C each open the same real errand's report destination in participant mode. Verify trusted
   historical eligibility, one statement per actor and one shared case. U cannot report or see
   another actor's report/case pointer; participant mode cannot open Admin review. Retry the exact
   same report request after an interrupted response; it must return the original result with no
   extra case/statement. A second intentional statement from the same actor must conflict. Preserve
   the errand URL when Order's historical list cannot discover H's withdrawn assignment.
2. **Claim/evidence:** A and B open the unclaimed case and attempt to claim the same revision.
   Exactly one succeeds; refresh the loser. Verify requester and every assignment period, original
   source/event IDs, stored location snapshots, ordered paginated evidence and per-source committed/
   projected checkpoints. Cause a gap or owner outage only in the agreed test environment; the GUI
   must show incomplete/unavailable, and resolution must stay blocked until verified recovery.
3. **Private conversations:** The assigned reviewer opens separate R/H/C reporting-participant
   threads. Exchange text with each actor, refresh and reload both sides, and page past 20 messages.
   No user sees another thread; B's permitted read must never enable replies. Interrupt initiation/
   send response and retry the original request/clientMessageId. A producer-committed create with
   no saved Admin reference remains the explicit producer recovery gate; do not invent lookup or
   use POST as participant discovery. Check revocation/inactivity on direct Chat REST and WebSocket
   access as well as the GUI. Non-reporting historical entry remains an owner-agreement dependency.
4. **Credit corrections:** Record target available/reserved values through Credit-owned APIs/UI.
   A confirms a small nonzero signed correction with reason; 202/PENDING is not success. Wait for
   the real Credit-owned result and reconcile the actual ledger/balance: one delta, reserved
   unchanged. Repeat with a debit and insufficient available-credit rejection. During an approved
   broker/owner outage, PENDING becomes UNKNOWN and blocks closure. Recover using original identity.
   An owner-approved replay of the exact original command/outcome must not repeat the ledger effect,
   terminal Admin audit or operation. Never publish a fabricated success as verification.
5. **Reversible bans:** A requests BAN for a dedicated reporting participant with a reason. Wait
   for actual User APPLIED/NO_CHANGE; inspect account status through User administration. Verify
   login denial, current Admin/Chat access denial, self/final-admin protections and no repeated
   sanction under exact duplicate command delivery. Reactivate through User administration with a
   reason. Replay the original ban and verify the stored original outcome is republished while the
   account remains active. This replay requires the owner's approved tool and original IDs.
6. **Resolution:** With no PENDING/UNKNOWN actions and fresh complete owner evidence, A enters an
   immutable decision and an explanation for every rejected action, reviews confirmation and
   resolves. Repeating the same resolution request returns the original result. R/H/C see only
   safe resolved status, their statement and read-only own history. New reports/actions/initiation/
   messages/uploads must be rejected, including a send racing closure. B and unrelated actors
   cannot resolve. Verify original CaseResolved identity through real Kafka and the Chat projection.
7. **GUI/accessibility/recovery:** Repeat at desktop and 375px with keyboard-only selection,
   confirmation/cancel, retry and pagination, visible focus and SGT timestamps. Refresh under User,
   Chat and Kafka outages individually in the agreed test environment; restore each dependency and
   verify original pending identities, private history and final owner outcomes. Record which
   operations were actually delivered/committed and which remain uncertain before manual acceptance.

Historical activation plan (runtime/V8/topic reconciliation now completed above): Darryl prepares the current Admin image and verifies the
existing User sanction listener activation; Jun Hui/nominated shared editor and affected owners
review/apply the lifecycle topic/ACL/transaction settings and producer network/routing changes;
Eldridge implements/activates real Credit corrections and resolves/activates Chat; XueTing deploys
the agreed historical Order evidence and verifies errand GUI routing. Run the read-only metadata
preflight again before the first business case. No shared rollout is implied by this checklist.

## Case-event delivery handoff

Admin owns the new V8 outbox progress migration and lifecycle relay. It includes existing pending
events, preserves original envelopes/IDs and serializes delivery with a dedicated database
coordinator. Stable Kafka transaction epochs plus a post-initialization check of the original
database lease prevent obsolete workers from publishing late. Kafka commit followed by failed
database progress can repeat the original event: Chat must use `read_committed`, deduplicate
matching event IDs and investigate conflicting content/sequences. Missing history remains blocked.

Verification: the full Admin build passed 89 tests; after the concurrency repair, the affected
eight lifecycle and two command transport tests passed. These use disposable real PostgreSQL and
Kafka. They cover migration/backlog, ordering, immutable content, competing publishers, lost-lock
resumption, fencing, broker outage/recovery and original-ID duplicate replay. Command outcomes in
the transport regressions are explicitly test-produced, not User/Credit domain acceptance.
Contract examples/semantics, CI syntax, environment consistency and initializer CLI-mock tests pass.
The final transport-only packaged check also passed: real private PostgreSQL, authenticated Kafka
with scoped Admin credentials, all four lifecycle types with exact original content/IDs/order,
and unchanged confirmed delivery progress after restarting Admin. Its stored history is explicitly
test-only; no User/Credit outcome or Chat projection is simulated as live acceptance. The owned
disposable project and volumes were removed afterward.

The read-only `foc-local` check found the previous image `foc-admin-service:local-22bc8cc` and
missing lifecycle enablement/transaction-ID settings, `admin.events`, Admin topic Write/Describe
and transactional-prefix Write/Describe. The existing single-node transaction-state replication/
min-ISR settings and Admin cluster idempotent-write permission were present on the repeated live
check. No new configuration was applied there. Jun Hui and affected owners (including Eldridge
for Chat/Credit and XueTing for shared broker review) must
review the prepared initializer, Compose, cluster configuration and CI changes before activation.
Existing network policies already permit Admin-to-Kafka. No other service backend was changed.

The broad packaged User/Gateway check failed because its disposable User container was unhealthy
before Admin started; it is not a pass. The standalone Kafka smoke also did not pass locally
(Windows path conversion, followed by repeated disposable health-check timeouts; the latter
attempt was stopped to reduce contention). Neither failure authorizes changes to User or the
regular stacks. Normal databases/volumes were neither seeded nor reset. The transport-only smoke
is separate from those broader checks, and does not establish Chat ingestion or financial effects.

## Current boundary

Admin owns cases, statements, reviewer/state, audit, request receipts and its private database.
Chat (Eldridge) owns historical timeline, conversations, messages and all Chat access checks.
Admin implements consumers against existing documented shapes; this does not certify a producer
implementation. Chat now contains runnable code; the current findings and acceptance limits are
in the section above. No live Chat acceptance passed in this Admin consumer iteration.

## Contracts and conversation gaps

| Item / owner | Decision or implementation still required | Blocks | Completion evidence |
| --- | --- | --- | --- |
| C1: Chat/Admin wire approval — Eldridge + Darryl | Confirm exact paths/shapes, error meanings, actor delegation, UUID idempotency scope, duplicate/mismatched operations, retry ownership and representative paired fixtures. Schemas/examples alone are not approval. | Evidence/conversation integration and final acceptance | Owner-agreed version and consumer tests against the actual producer, including mismatches and lost responses. |
| C2: Conversation discovery — Eldridge (producer), Darryl (consumer) | Current contracts can initiate a case conversation or read one by known ID. They do not define lookup/list by case for the selected participant or other reviewing administrators. Agree a read-only discovery mechanism, hidden/not-started versus unavailable outcomes and privacy filtering. Do not let participants use the reviewer-only initiation POST as lookup. | Participant conversation view, other-admin review, reopening existing threads after reload | A participant discovers only their own ID; another admin discovers only permitted case threads; unrelated users cannot enumerate; no initiation side effect on lookup. |
| C3: Historical non-reporter authorization — Eldridge + Darryl; XueTing supplies historical facts | Current Admin callback authorizes local reporting participants. Agree how trusted historical membership is established/persisted before callback checks, with no circular Admin→Chat→Admin evidence call or HTTP under DB locks. Do not treat browser-supplied IDs, current courier alone or incomplete projections as history. | Conversations with historical participants who did not report; safe participant entry for those users | A withdrawn historical courier without a statement can access only their intended conversation; arbitrary users and unverifiable history remain denied/unavailable. Callback works when Chat evidence is down without recursion. |
| C4: Actual Chat conversation/message implementation — Eldridge | Implement one thread per (case, participant), current authorization on REST/WebSocket/images, server-assigned message sequence, clientMessageId deduplication, read-only state and durable recovery. Pin create retries to original actor/body/key and retain original identities. | Live reviewer/participant messaging | Real service tests for retries after commit/lost reply, concurrent creation/sends, revocation, cross-case/thread denial and resolution while sending. |
| C5: Browser delivery and routing — Eldridge + nominated shared editor (Jun Hui); affected owners review | Confirm `/api/chat/**` and `/ws/chat` routes, runtime addresses, JWT trust, HTTPS/CSP and ticket lifecycle. Draft ticket/subscription frames are not a deployed WebSocket. Define history catch-up boundaries/cursor direction and reconnect behavior using actual Chat. | Real-time delivery, direct browser Chat calls and deployed conversations | Gateway/WS tests, REST catch-up without missing/duplicate messages, expired/revoked tickets rejected. Admin dev proxy points only to the existing gateway; no shared routes are changed here. |
| C6: Attachments, translation and ordinary errand chat — Eldridge + product owners | Confirm supported limits/languages and historical/replacement-courier visibility for ordinary chat. This policy is separate from private case threads. Upload, download and translation UI are excluded from this Admin iteration. | Later media/translation work and ordinary-chat integration | Owner-approved policy and producer schemas plus authorized private attachment/translation tests; no arbitrary external URLs/keys. |
| C7: Accepted-but-unconfirmed initiation — Eldridge + Darryl | If Chat commits a conversation but Admin loses the response, cannot save its reference, or observes revocation/closure afterwards, the local request remains unconfirmed. Retry uses the original key; no background reconciler or lookup is invented. Agree reconciliation/discovery and read-only replay behavior after closure, plus receipt/reference retention and audit semantics. | Reliable recovery across closure/revocation/restarts and complete conversation acceptance | Original reference is recovered by authorized read without creating a duplicate or allowing a post-close write; revoked actors see no private reference; owner-agreed retention and observable reconciliation outcomes. |

Admin conversations preparation deliberately supports initiation only for reporting participants,
including previously eligible historical couriers. An unknown/non-reporting target is hidden;
the UI limits selection to reporting participants. Admin now discovers its locally confirmed
references for participants and administrators as described above; producer recovery of unconfirmed
threads remains unresolved. No guessed Chat endpoint or editable conversation-ID input bypasses
these gaps. The thread UI uses actual REST sequence pagination and safe retry; WebSocket
notifications/reconnect remain pending C5. Browser pending keys/text are scoped to account/case/
thread in session storage. No message content is stored in Admin's database.

## Evidence, identity and infrastructure dependencies

| Item / owner | Remaining work or ambiguity | Blocks | Completion evidence |
| --- | --- | --- | --- |
| E1: Complete Order history — XueTing | Publish full lifecycle/assignment facts and producer-owned stable recovery snapshots/checkpoints, including withdrawn couriers and historical locations. Agree pre-stream baseline policy. | Historical reporting/conversations, complete timeline, resolution | Initial/edit/accept/withdraw/pickup/delivery/terminal scenarios recover with original identities and contiguous evidence sequences; missing legacy facts remain explicit gaps. |
| E2: Credit evidence — Eldridge | Confirm order-linked ledger outcome/export shapes, stable evidence sequence for existing core events and case-scoped correction history. Do not silently add fields to deployed core messages. | Complete timeline, financial review/actions and resolution | Reconciled producer checkpoints and ledger effects; duplicate replay does not repeat a financial effect; unavailable history is UNKNOWN/INCOMPLETE. |
| E3: Admin event delivery/recovery — Darryl + Jun Hui for transport | Admin now implements a fenced transactional relay for all four existing lifecycle types and pre-existing pending rows; shared topic/ACL/configuration changes await affected-owner review and activation. Chat must use read_committed and event-ID deduplication. Conversation reference audit invents no lifecycle event. Private export retention/expiry agreement remains open. | Live Chat projection of Admin activity, complete timeline, final acceptance | Real PostgreSQL/Kafka tests cover original IDs/content, ordering, concurrent publishers, fencing, outage recovery and duplicate replay after database failure. Live cluster still lacks topic/ACL/config/image activation; Chat projection and snapshot retention/expired-cursor acceptance remain pending. |
| E4: Coverage semantics — Eldridge + Darryl + affected producers | Confirm per-source committed/projected checkpoints, gap classifications, pinned timeline revision and pagination. A running Chat or empty page never establishes complete history. | Evidence verification and resolution guards | Late/out-of-order/conflicting events, backfill overlap, checkpoint outage and producer lag tested; COMPLETE only through explicit verified limits. |
| I1: Current User eligibility and role delegation — Darryl (User owner), Eldridge (Chat consumer) | Admin's User checks exist; verify actual Chat JWT/service trust and current active/admin checks. Keep effective participant mode separate from Admin access; propagate revoked/unavailable identity safely. | All privileged integration and conversation authorization | Revocation during requests, inactive participant, mode changes, wrong key/audience/subject and User outage tests across real services. |
| I2: Shared deployment — nominated editor, Jun Hui coordinates; all affected owners review | Gateway/Compose/env/CI, service DNS/TLS, signing-key distribution/rotation, broker access and both ingress/egress default-deny policies need coordinated implementation. Required Compose variables must also reach env examples, Compose CI jobs and Kafka smoke checks. | Deployed N2H, live Chat and final acceptance | Actual gateway/TLS/network/broker smoke checks and compose_env_check pass; no public exposure of internal APIs. |
| A1: Commands/outcomes — Darryl (Admin/User), Eldridge (Credit), Jun Hui (transport) | Confirm approved action envelopes, command deduplication, persisted outcomes, failure/retry/reconciliation and observability before actions iteration. | Admin actions and resolution | Pending/unknown/rejected/applied outcomes tested with real producers, insufficient-credit and self/final-admin protections preserved. |
| A2: Resolution/read-only — Darryl + Eldridge | Admin implements atomic closure with fresh complete evidence, current case checkpoints, no pending/unknown actions and per-rejection explanations. Chat must still implement/recheck closure on writes, not trust an old UI flag. | Real Chat resolution and full workflow acceptance | Admin decision/retry/race/privacy checks use test-only Chat evidence; actual concurrent Chat closure/send and readable private history remain pending. |

## Final integration exit checks

### Credit-actions iteration handoff

Admin now implements the draft credit-action API, durable actions/command outbox/outcome inbox,
reconciliation by original command redelivery, conditional Kafka transport, audit/lifecycle export,
and reviewer GUI. This updates the Admin portion of A1; it does not close A1, E2, E3 or I2.
Standalone Kafka is disabled by default. The shared runtime iteration now enables authenticated
Admin transport in Compose and prepares topics/ACLs, gateway routing and CI. Activation remains
gated on affected-owner review; see [runtime integration](RUNTIME_INTEGRATION.md).
Non-reporting historical targets remain gated by C3. Bans and resolution remain separate work.

The isolated runtime smoke now passes against packaged Admin/User/gateway images, private
PostgreSQL and authenticated Kafka: real User JWT/current eligibility, internal-route isolation,
command publishing, UNKNOWN/original retry identity, test-only duplicate rejected outcomes,
restart persistence and User outage. This closes the local Admin transport/configuration portion
of I2 only. It does not close shared activation review, Kubernetes/TLS/network-policy deployment,
real Credit acceptance, Chat integration or the Admin lifecycle relay in E3. Test-only SQL fixtures
and outcome producers are not live fallbacks and do not establish a Credit ledger result.

The separate shared-broker smoke also passes topic/retention checks, repeated initialization,
scoped producer/consumer access, denied Admin outcome forgery and foreign-group access,
authenticated read-only operational UI, and record/configuration/ACL persistence after restart.
These checks use a disposable broker. The existing shared broker is intentionally not activated;
its administrative topics remain absent until affected-owner review and coordinated rollout.

- **Eldridge / Credit:** approve and implement `AdminCreditCorrectionRequested` and its applied/
  rejected outcomes, including all identity/correlation/amount fields, current actor eligibility,
  target account validation, signed integer limits and authoritative ledger arithmetic. Confirm
  the chosen int32 request representation against Credit's existing int balances.
- **Eldridge / Credit recovery:** persist effect, operation hash/result, inbox and outcome outbox
  atomically. Admin resends identical event/operation IDs. Credit must republish the original stored
  outcome on duplicate commands, not merely drop a duplicate inbox entry. A lost outcome with a
  committed effect must converge without a new effect or a new operation. No lookup API is assumed.
- **Darryl + Eldridge:** agree deadline/reconciliation cadence and retention/redrive rules. Admin's
  30-second UNKNOWN deadline is an engineering default, not failure proof. Agree conflicting-result
  quarantine/DLT investigation and original completedAt preservation for result republication.
- **Jun Hui / nominated shared editor:** provision the command/outcome/DLT topics and independent
  consumer group ACLs (only Credit writes Credit outcomes), TLS/SASL/connectivity and runtime config.
  Validate both directions of default-deny network policy and preserve existing core topics/groups.
- **Darryl + Eldridge integration:** prove one ledger effect under duplicate events/operations,
  insufficient available-credit rejection and unchanged reserved balance in the real Credit DB
  through producer-owned tests/APIs. Admin's broker/fixture tests cannot establish these facts.
- **Darryl / later resolution:** share the same case lock and forbid closure over PENDING/UNKNOWN.
  Late matching outcomes finish their recorded actions; they never originate another command.
- **Darryl + Jun Hui:** publish/recover CaseActionCompleted alongside existing lifecycle outbox.
  The Admin correction transport intentionally does not introduce the wider admin.events relay.

### End-to-end exit checks

- Re-read this file and current producer contracts; mark an item complete only with owner agreement
  and actual implementation/test evidence. Record the agreed version/PR and any remaining gap.
- Replace test-only servers with configured real producers and exercise requester, historical
  couriers, assigned reviewer, another administrator and unrelated/revoked accounts.
- Verify C2/C3 before enabling participant discovery or non-reporting historical targets.
- Confirm durable operation identities and original receipts across timeouts, restarts, duplicate
  requests, different body/actor using the same key and concurrent requests.
- Run real Chat history/send/read-only/privacy tests and real broker recovery scenarios. Distinguish
  unit/fixture/schema passes from integrated passes; never describe synthetic timelines as complete
  producer history or simulated message delivery as a real Chat result.
- Verify shared routing/trust/network prerequisites with their nominated editor, then run desktop,
  mobile, keyboard and SGT timestamp checks through the real gateway. Obtain manual acceptance.

### Sanctions iteration handoff

Admin/User sanctions are implemented against the existing draft shapes under Darryl's explicit
scope approval. Admin tracks case permission/reason/operation/outcome; User owns all account effects,
current actor checks, protections, durable result/inbox/outbox and reason/audit reactivation.
Shared sanctions topics/ACLs are prepared by this nominated task, pending affected-owner activation
review. See [sanctions integration](SANCTIONS_INTEGRATION.md). Historical non-reporting targets,
Chat projection, Admin lifecycle relay, immediate cross-service revocation and resolution remain
separate dependencies. Wire schemas are unchanged; this is not approval on behalf of other owners.

### Resolution iteration handoff

Admin resolution now performs a new authenticated Chat timeline read before locking, validates
COMPLETE coverage/no blocking gaps and 60-second coverage/checkpoint freshness, and checks that
Chat covers the currently committed Admin source sequence. Under the shared case lock it
rechecks reviewer, revision/state and confirmed actions. No-action closure is allowed; each
rejected action requires its own explanation through the Admin-owned request extension approved
by Darryl. Chat wire shapes and other services are unchanged.

One transaction commits an immutable decision, case/revision, audit, original idempotency receipt
and CaseResolved outbox record. Admin's callback becomes read-only and participant status exposes
no private decision text. Admin backend/HTTP/PostgreSQL tests cover success/retry, rollback,
stale/concurrent changes, blocked evidence/actions, post-close reports/actions and callback privacy.
Successful closure tests use explicitly test-only Chat evidence. Packaged GUI verification checks
the actual unavailable-Chat path; real Chat send-vs-resolution enforcement, producer checkpoint
integration and lifecycle relay remain owner dependencies. Do not declare those integrated.

Verification: full Admin backend run passed 76 tests; the final resolution HTTP/workflow run
passed 38 tests (including the newly added HTTP tests). Admin frontend passed 61 tests, followed
by six focused passes after repairing mobile form sizing; build/lint and contract validation
passed. The packaged disposable GUI was checked at desktop and 390px mobile width, including
confirmation/cancel, visible keyboard focus, unavailable Chat and same-request recovery after
reload. SQL confirmed UNDER_REVIEW with zero decisions after the live unavailable-evidence
attempt. Successful closure remains automated with test-only evidence, not real Chat acceptance.
At that disposable-stack check, user desktop/mobile/keyboard acceptance remained pending and no
commits or shared rollout had been made. See the regular-stack integration handoff below.

### Recorded sanctions verification

Sanctions verification now covers real packaged Admin/User, private PostgreSQL and authenticated
Kafka: applied/NO_CHANGE/rejected outcomes, stable retries, self-ban rejection, reason/audit
reactivation and original-result replay without re-banning, plus restart persistence and User
outage. The default consumer-outage phase passed before revealing a User validation/error-dispatch
issue; after that issue was fixed, the clean focused rerun explicitly skipped that unchanged
phase. All four captured real sanctions messages validate against the unchanged draft schemas.
Real-database concurrency/rollback tests and User's final-admin guard pass. A reproduced profile
save race is fixed inside User with changed-field updates. Credit outcomes remain test-only;
no real Credit financial acceptance is claimed. GUI behavior tests/build/lint pass, but visual
desktop/mobile/keyboard acceptance remains pending because browser control is disabled. Existing
shared services were not activated; affected-owner review still gates shared rollout.

### Cross-service reporting navigation handoff — 4 November 2026

Darryl approved the bounded Order frontend/User return-path work and Admin-owned
`GET /api/admin/orders/{orderId}/report-context`. Order supplies navigation/context only; Admin
checks current User eligibility and either returns the actor's own statement grant/safe status or
asks Chat for reporting eligibility. Unrelated actors receive no case pointer. An unavailable or
incomplete dependency is 503, never an empty/no-report result. POST still verifies eligibility
and closed-case rules independently. Chat contracts, Order backend and other databases are unchanged.

The regular `foc-team-12` stack is active at `http://localhost:8088` after Darryl confirmed the
shared runtime review was complete. Admin uses persistent `foc-team-12_admin-db-data`, accessible
locally at `127.0.0.1:5545` with the ignored `.env` credentials. The disposable project's database
on 5544 is separate. No normal database was seeded/reset and no synthetic evidence is used live.
Existing User signing keys/passwords and other service database credentials were preserved.
Admin has its own signing key and User public-key trust; broker initialization was rerun without
resetting/restarting the broker or its data. New Order UI/API affected-owner review is still
required before merge; the earlier runtime confirmation does not imply that review.

Verification: Admin HTTP/workflow/resolution tests passed 45 cases; Admin GUI 63, User GUI 56,
and the Order full GUI suite 84 passed. The subsequent Order identity/expiry repair passed all
24 focused report-panel/errand tests. Frontend builds/lints and Order typecheck passed; generated
contracts validated 31 HTTP operations. Regular packaged services start; unauthenticated queue
and report-context return 401 and internal callback routes are not exposed by the gateway (404).
The regular administrator's Switch to Admin opens the live empty queue, and Admin remains
reachable from Profile and Errands. Dashboard checked at desktop/390px; report-unavailable at
375px has no horizontal overflow. Keyboard Tab/Enter operates queue filters and reaches retry.
Signed-out report links preserve the order query through the sign-in page; successful post-login
return and eligible/existing/private report outcomes are covered by frontend/backend tests.

The signed-in account has no errands and the regular courier browse list is empty. A read-only
nonexistent-order probe showed Order's not-found state and the independent Admin unavailable/retry
state, with no reporting form or other participant data. This is a failure-path check, not a real
eligible-errand success. Real Chat eligibility, evidence coverage and resolution remain pending
Eldridge's running producer implementation. Successful report submission, existing-report return,
unrelated-user denial and case resolution through real services still need manual acceptance with
real participant errands. Historical withdrawn-errand discovery also remains Order-owned.

Manual steps and role requirements are in the Admin README. User GUI acceptance and real Chat
success paths remain pending. Darryl subsequently requested commit, push and PR creation;
merge remains outside this task's authorization.

### Admin Kubernetes handoff — 4 November 2026

Darryl approved the bounded Kubernetes brief and this task as nominated shared editor. Admin
manifests now deploy the existing image plus private PostgreSQL 16 with a retained 5Gi claim,
cluster-only Services, private Secrets, health probes and explicit default-deny exceptions.
Gateway/User manifests load existing Admin-support images; no application domain code or wire
contracts changed. User's existing signing/database/mail Secrets and other pinned callers are
preserved. New cluster credentials are independent of `.env`, Compose and disposable fixtures.
Jun Hui and affected owners still review the resulting shared diff before merge; deployment
authorization is not a recorded independent owner review or production/TLS approval.

Live checks passed in `foc-local`: Admin/User/gateway rollout; seven Admin migrations; replacement
of only `admin-db-0` retained its PVC UID and all migration records; gateway `/admin` and real
administrator eligibility; unauthenticated/invalid Admin requests rejected; internal callback
not publicly routed. Admin's authenticated Kafka consumers are assigned all three partitions of
both `credit.admin.events` and `user.admin.events`. Existing Admin ACLs were applied idempotently;
no business commands, synthetic outcomes or financial/account mutations were used for transport
verification. These results do not establish real Credit processing or User sanction acceptance.

The isolated policy suite passed its full allow/deny matrix and DNS after cold-start repairs;
live pod-IP probes separately proved Admin -> own DB/User/Kafka and gateway -> Admin, and denied
Admin -> User DB plus User/gateway -> Admin DB. Actual gateway HTTP checks exercise normal
Service routing. Secret helpers rerun without rotating credentials. Shell/PowerShell syntax
checks passed; explicitly test-only CLI mocks verified bounded initialization, retry recovery,
exhausted failure and invalid configuration. No normal database was seeded/reset.

Cluster GUI verification with Darryl's real account showed Access verified and an empty queue,
participant mode denying administrator access, and unavailable/retry with no report form when
Chat was offline. The latter used a read-only nonexistent errand URL to test failure handling,
not a real eligible-errand success. Queue keyboard filtering also works. Protected GUI results
do not establish Chat eligibility, complete evidence, conversations or resolution acceptance.

Regular Compose remains running on 8088. Kubernetes is exposed only through the loopback gateway
tunnel at `http://localhost:8089`; this cluster's data is separate. The user authorized stopping
only the old disposable Compose test project, whose volumes remain, and raising the existing
node's Docker CPU limit from two to four. No cluster/profile recreation or storage deletion.

Cold-start attempts exposed CPU/startup pressure, intermittent DNS and existing Order/Credit/
Supplier startup failures; those services' code/manifests were not changed to hide failures.
The initializer's seven CLI JVMs exceeded its local budget: Kubernetes now limits concurrency
to one, uses absolute namespace DNS and bounded idempotent retries. Earlier attempts failed;
the final `kafka-init-admin-retry` Job completed successfully (1/1), including all topic/config
and ACL operations. Admin's own cases/actions/decisions remained zero. Final live Admin smoke
checks also passed after absolute namespace DNS replaced Admin's short dependency names and
the gateway's Admin destination; an earlier repeat GUI account check had reproduced the DNS
failure. Existing cluster-wide DNS/startup behavior outside that scope is not declared repaired.
Admin started before ACL setup once; its listeners were restarted and actual assignment then
verified. HTTP health alone is not Kafka readiness. Remaining Chat trust/reverse policies, TLS,
owner review and user manual acceptance stay open. Darryl subsequently requested grouped commits,
push and PR creation. Merge remains outside this task's authorization.

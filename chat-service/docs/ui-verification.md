# Phase 6 — Sprint 3 Chat UI

The web client implements protected `/messages` and `/messages/:conversationId`
routes using the shared WorkspaceShell, WorkspaceTopbar, navigation and design
tokens. The desktop list/thread layout becomes a single-pane flow with back
navigation below 768px. The Figma file required a signed-in session during this
implementation; visual verification used the existing FoC shell/tokens rather
than claiming a pixel comparison with inaccessible Figma frames.

## Implemented behavior and requirement mapping

| Requirements | Browser behavior and evidence |
| --- | --- |
| N1F1.1–N1F1.1.3 | Live, paginated partial-username search; selecting a result directly creates/reopens its private conversation. Protected deep links and outsider denial. No contact-request dialog. |
| N1F1.2, N1F1.2.1, N1F1.2.3, N1F1.2.4 | Current display name with smaller `@username`, latest message/time and unread badge; latest 50 messages, explicit older pages and chronological catch-up. Refresh includes all displayed conversation pages. |
| N1F1.2.2–N1F1.2.2.4 | Read acknowledgements only after rendering a selected, visible, focused conversation. Initial acknowledgement uses the full history snapshot boundary, including messages outside its latest page. Persisted state drives badges; failed reads remain unread and can retry. Reader-only cross-tab updates are applied monotonically. |
| N1F1.3–N1F1.3.4 | Keyboard-accessible block/unblock controls and blocked-user management; bilateral messaging availability comes from the server. Unblocking one direction does not remove the other party's block. Rejected messages are never automatically replayed. |
| N1F1.4–N1F1.4.3 | Raw Unicode code-point limit before trimming, whitespace-only/NUL/surrogate rejection and plain-text rendering. Internal spaces/newlines are retained. Empty input is disabled; invalid length produces an announced error. |
| N1F1.5–N1F1.5.2 | Distinct sending/sent/not-confirmed/received states. Explicit retry preserves client message ID and original text; editing a failed draft creates a new ID. Acceptance/live/history results reconcile optimistic messages without duplicate bubbles. |
| N1F1.6–N1F1.6.5 | Deleted counterpart history stays visible, with `Deleted User`, no username and an unavailable composer. Search/status remain authoritative backend decisions, so a replacement username cannot inherit history. |
| N1NFR3.1 | Three task actions: enter a username query, select its result, compose/send. Search is live and opening does not require a separate creation confirmation. |
| N1NFR3.2 | Visible connection, pending/success/failure and retry states; read/save failures do not imply successful persistence. |
| N1NFR3.3 | Viewport-bounded Chat at 320×568, 360×640, 375×667, 667×375, 768×600, 1024×768 and 1440×900; no horizontal or vertical page overflow. History and directory scroll inside their panes while shared navigation and the composer remain visible. |
| N1NFR3.4 | Labeled search/composer, keyboard-opened search results, Enter-to-send/Shift+Enter newline, keyboard block controls, visible focus, status/error announcements and semantic lists/links/buttons. |

The socket sends the in-memory bearer in its first frame, validates the current
session through the existing refresh flow before connecting, pings every 20
seconds and reconnects with bounded backoff. Access tokens are absent from URLs
and persistent JavaScript storage. Concurrent expired HTTP/socket requests share one refresh-cookie
rotation; StrictMode restoration also rotates only once. Logout invalidates any
older refresh in flight. A dependency error after a successful refresh does not
sign the user out.

Reconnect, `sync.required`, and sequence gaps reload summaries and catch up
visited conversations from their processed sequence. Later messages are withheld
while a gap is recovered. Reconnecting never automatically resends failed drafts.
There are no sender-facing read receipts, typing indicators or first-contact states.

Chat uses the shared shell's optional viewport layout, sized with `100dvh` and a
`100vh` fallback. The mobile navigation occupies its own layout row, including
safe-area padding, rather than covering the composer. Long message histories,
conversation lists, search results and expanded blocked-user lists scroll within
bounded panes. Positioned containers prevent hidden accessibility labels from
extending the document as those lists grow. The composer has a bounded height;
long drafts scroll inside its text field.

Auto-scroll changes only the history pane and follows new messages while the
reader is near its end. Incoming messages do not move a reader browsing older
history. Loading an older page preserves the previous message's screen position.
Composer focus does not scroll ancestors, and viewport resizing keeps the latest
message visible when already following the end. Short screens use tighter
spacing; landscape screens put Send beside the text field and retain connection
status, the conversation header and both shared navigation areas.

## Viewport regression follow-up — 21 October 2026

- Ten new browser regressions cover 200 seeded messages, 40 conversations,
  40 expanded blocked users, incoming bursts, send/focus, scroll boundaries,
  older-page anchoring, viewport resizing and mobile admin validation.
- All **21 Chat browser tests passed against the rebuilt Nginx container** on
  `http://localhost:3000`, using test-only HTTP/WebSocket contract fixtures.
  Desktop, small portrait and short landscape screenshots were inspected.
- Frontend lint, TypeScript/production builds, the Docker web build and all
  **121 frontend unit/component tests passed**.
- The wider Vite browser run had **98 passed, one failed and one opt-in live case
  skipped** before the final blocked-list regression was added. Its existing
  `orders.spec.ts` deadline case also failed when rerun: the one-second deadline
  had elapsed before its initial Cancel assertion. Order code/tests were not
  changed for this Chat fix. This run is not claimed as a fully passing suite.
- This follow-up changes browser layout/scrolling only. The previous real-service
  acceptance evidence below remains historical; no database reset or backend
  restart was needed.

## CI layout follow-up — 23 October 2026

- The 21 October GitHub run passed Chat backend validation but failed three
  320px frontend viewport checks: **97 browser cases passed, three failed and
  the opt-in live case was skipped**. The header/mode switch was partly clipped
  even though document overflow checks passed.
- The bounded shell's implicit mobile grid column could retain the navigation's
  minimum content width when text metrics grew. `overflow: hidden` then concealed
  the extra width. Give that column an explicit `minmax(0, 1fr)` and allow mobile
  navigation labels to wrap within each link. Shared desktop columns stay in
  the shared stylesheet.
- Two added regressions exercise User/Admin accounts at 320px with increased
  text spacing, including the complete header, mode switch, every navigation
  label and the composer. Both reproduced the clipping before the fix under
  Linux; the complete **12-case scrolling suite passed** after the fix with
  stricter spacing. Existing full-visibility assertions remain unchanged.
- Local Linux container validation passed lint, TypeScript/production build,
  **121 unit/component cases** and the full browser suite: **102 passed, one
  opt-in live case skipped**. The existing Order expiry case passed in this run
  without changing Order code or its tests. Both new wider-text cases also passed
  separately on Windows. Coverage supports N1NFR3.3 responsive layouts and
  N1NFR3.4 accessible text/navigation controls; no Sprint 4 feature was added.

## Automated checks

From `web-client`:

```sh
npm ci
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The normal browser suite uses test-only HTTP/WebSocket fixtures. It covers the
search/open/send flow, Unicode boundaries and HTML-looking text, uncertain retries,
edited retry identities, bilateral blocks, tombstones, pagination, broker recovery,
failed reads, cross-tab read updates and protected routes. Component tests send
focus/blur/visibility lifecycle events through the actual page/controller; unit
tests cover races, monotonic cursors, paginated recovery and token renewal.
When `E2E_BASE_URL` is unset, Playwright starts Vite automatically. If that variable
points to an existing server, start that server before running the browser suite.

The live test is deliberately opt-in. With the root local stack, Chat profile,
existing migrations and matching User/Chat secret configured, run against the
Docker web proxy from `web-client`:

```sh
CHAT_LIVE_E2E=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/messages-live.spec.ts --workers=1
```

PowerShell:

```powershell
$env:CHAT_LIVE_E2E='1'
$env:E2E_BASE_URL='http://localhost:3000'
npx.cmd playwright test tests/e2e/messages-live.spec.ts --workers=1
Remove-Item Env:CHAT_LIVE_E2E
Remove-Item Env:E2E_BASE_URL
```

This creates three uniquely named `phase6...` test accounts through real User
  registration/verification, reads only Mailpit messages filtered to those new
recipients, and signs into separate browser contexts. Credentials remain in
memory. It exchanges real messages through Chat's PostgreSQL/outbox/RabbitMQ,
checks unread state, reload persistence, blocking/unblocking and outsider denial,
and captures 360/1440px screenshots under the ignored Playwright output directory.
It leaves the new local test accounts/history in place; it never resets databases,
deletes existing accounts, purges mail or truncates another service's tables.
Headless Playwright forces focus, so the real-service test checks active/unselected
thread behavior; the component suite separately verifies hidden/unfocused gating.

## Real User + Chat CI

The `Integrate User + Chat` GitHub Actions job runs the live acceptance test when
User, Chat, the web client, root Compose or its own CI configuration changes.
The final `CI passed` gate requires this job to succeed when triggered. The
existing isolated Chat backend checks continue to use their User contract fake.

The CI stack builds the normal User, Chat and web Dockerfiles and uses the
committed Nginx proxy routes. It starts two separate PostgreSQL 17 databases,
applies each service's committed Supabase migrations before API startup, creates
restricted runtime logins, and runs RabbitMQ, Mailpit and both independent outbox
publishers. The bare PostgreSQL Chat fixture supplies only the three NOLOGIN
Supabase role names referenced by its migration REVOKEs. No Supabase Auth or Data
API is used. Database migrations remain solely in each service's
`supabase/migrations/` directory.

Each run generates a unique Compose project, RSA keys, database/broker passwords,
OTP secret and matching User/Chat service secret. Only the User API mounts the
private key; Chat obtains the public JWKS over HTTP. Databases and RabbitMQ have
no published host ports. The web and Mailpit endpoints bind to loopback on ports
18880 and 18825 by default, independently of the developer stack.

From the repository root, using Bash with Docker Compose, OpenSSL, Python and
Node.js 22+ installed:

```sh
(cd web-client && npm ci && npx playwright install --with-deps chromium)
bash .github/ci/user-chat/run.sh
```

This builds, starts, migrates and checks readiness, runs the existing real browser
test with three newly registered/verified accounts, requires exactly one passing
test with no skips, then captures logs and tears down the disposable containers,
network, database volumes and generated credentials. Test data is discarded with
those volumes. Existing local databases, `.env` files and development keys are
not read or reset. Git Bash on Windows is also supported when Docker Desktop and
the same tools are available.

To inspect an isolated stack between steps:

```sh
bash .github/ci/user-chat/run.sh up
bash .github/ci/user-chat/run.sh test
bash .github/ci/user-chat/run.sh logs
bash .github/ci/user-chat/run.sh down
```

The final command stops the stack and resets its local data by removing only that
generated project's volumes. Run it after an interrupted manual session before
starting again. `USER_CHAT_WEB_PORT` and `USER_CHAT_MAIL_PORT` can override ports
at startup. `USER_CHAT_CI_STATE_DIR` and `USER_CHAT_CI_ARTIFACT_DIR` override the
ignored local defaults: secret state under `.github/ci/user-chat/secrets/` and
artifacts under `web-client/test-results/user-chat-ci/`. Secret state stays outside
all service build contexts, and web Docker builds exclude browser artifacts.
Use the same values for each command. CI puts secret state in the runner temporary directory and uploads
only the artifact directory for seven days. Artifacts contain JUnit results,
mobile/desktop screenshots, failure screenshots, container status and bounded
API/publisher/proxy logs. Live authentication network traces are disabled to keep
passwords, OTPs and bearer/refresh tokens out of stored traces. Other browser tests
retain traces on failure.

This adds continuous integration evidence for N1F1.1 private conversation opening,
N1F1.2 text exchange/history, N1F1.2.2 internal unread behavior and N1F1.3 bilateral blocks,
participant-only access, and responsive/keyboard checks under N1NFR3.3–N1NFR3.4.
It exercises real registration, OTP email, RS256/JWKS, current-session checks,
shared service identity, PostgreSQL persistence and outbox/RabbitMQ/WebSocket
delivery together. It does not certify sustained load or recovery from a killed
container; those remain separate from the existing backend restart tests.

Local validation on 23 October 2026 passed the complete one-command flow against
fresh, isolated databases: **one real browser acceptance case passed, zero
skipped**, followed by automatic teardown. A separate negative check stopped only
the disposable Chat publisher; acceptance failed on missing live delivery with a
nonzero exit. Manual teardown then removed that project's containers, volumes,
network, image tags and secret files. A fresh complete run passed again. The
360/1440px screenshots were inspected. Workflow actionlint, Bash syntax/ShellCheck,
frontend lint, production container builds and all **121 unit/component tests**
passed. Generated stack credentials were absent from captured test artifacts.

## Acceptance evidence — 21 October 2026

- Frontend lint and production build passed, including TypeScript checking tests.
- Full browser suite: **90 passed**, with the opt-in live test skipped in that run.
- **121 frontend unit/component tests passed**, including focus/visibility,
  refresh-cookie concurrency and paginated counterpart-name refresh.
- The opt-in real User/Chat/PostgreSQL/RabbitMQ test passed separately through both
  Vite and the rebuilt Nginx proxy on port 3000. Docker image build and healthy local
  startup passed; real mobile/desktop screenshots were inspected.
- **25 Chat backend unit tests passed**; the 19 database/broker restart/transaction
  cases were not rerun for this frontend phase. The live browser check uses real
  PostgreSQL/outbox/RabbitMQ without resetting or restarting shared dependencies.
- No backend business rules, database migrations, service secrets or existing
  database records were changed for this UI work. Live checks add their own test
  accounts, messages, blocks and read state through public APIs.

## Manual two-browser check

1. Start the application using the root README and open `/messages` after signing
   in. Sign in as a different active account in an incognito/separate browser.
2. Search part of the other username, select it, and compose/send a message.
   Confirm one sent bubble, one received bubble, and retained internal whitespace.
3. Leave the recipient on the conversation list or another conversation. Send
   again; its unread badge should increase. Open the conversation in a focused,
   visible tab; the badge should clear after the read acknowledgement succeeds.
4. Background or hide the selected tab, send another message, then return. It
   should accumulate unread while inactive and acknowledge after presentation.
5. Refresh/reconnect and verify retained ordered history without duplicate bubbles.
   Use the existing Postman walkthrough for controlled backend outage scenarios.
6. Block/unblock, open blocked-user management, and verify history remains visible.
   In a disposable-account scenario, counterpart deletion retains tombstone history
   and disables new sends. A third user must not open the private conversation.
7. Repeat keyboard-only and at 360px: search, open, send, retry and block controls
   remain reachable; mobile back navigation returns to conversations.

## Errand conversation entry — 23 October 2026

Assigned errand details show the shared message icon beside the item title.
Requesters open Chat with the assigned courier's immutable user ID; couriers open
Chat with the requester's ID. The existing authenticated conversation POST creates
or reopens the pair's unique thread, then navigates to `/messages/:conversationId`.
It does not send a message automatically. Unassigned errands, public assessments
and nonparticipant views have no message action. Chat still enforces current
sessions, blocking and recipient availability; a failed open leaves the errand
visible with an announced error and an enabled retry action. Pending opens prevent
duplicate clicks, and responses after leaving the page cannot redirect the user.

Fourteen focused browser cases passed at 320, 511 and 1440px across both participant
roles, with new/existing conversations, hidden actions, double clicks and
dependency/blocked/deleted-recipient failures. Keyboard activation and screenshots
verify the button sits at the top right of the details panel. This supports
N1F1.1 private conversation creation/reopening and N1NFR3.1, N1NFR3.3 and N1NFR3.4
for a direct, responsive, labeled entry point. It adds no errand status UI inside
the Chat thread and does not change either service's backend contracts or data.

Lint, TypeScript/production and Docker builds passed, with **121 unit/component
tests** and the full Linux browser run at **116 passed, one opt-in live case
skipped**. The actual signed-in requester opened the existing courier conversation
from the annotated local errand using the rebuilt Nginx application; no message
was sent. The page was then returned to errand details with the icon visible.

## Excluded scope

Sprint 4 ongoing errand status/requester/courier context inside Chat, 1,000-connection tests,
25-messages/second sustained load, formal latest-50 performance and p95 targets
are not implemented or certified here. Production deployment remains separate
integration work. The isolated Chat backend CI job uses a User identity contract
fake; the additional User + Chat job above runs the actual services together.

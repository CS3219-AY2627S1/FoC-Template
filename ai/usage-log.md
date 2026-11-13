# 19/9/2026
- Tool used: deepseek chat
- Mode: Generation
- Prompt:
```
create a login page in vuetify + typescript. mock any external calls made. requirements:
- email and password field
- upon error from server, display popup notification/alert
- 2 buttons: login and register
- register slides a form over the existing login form
- register has email and password field. additionally has a password complexity meter (list of what is missing/violated)
- enable client side validation through zod
```
- Prompt:
```
provide a typescript function to nicely format an error message in bulleted form of a similar variant to the following object provided:

{"error":"request schema violation","details":{"errors":[],"properties":{"password":{"errors":["Too big: expected string to have <=128 characters"]}}}}
```
- Output used (login.vue): most of the template and stylesheet was copied. state code was stripped of irrelevant code (mock data), the rest of the styling code was inspected as left intact. the fancy responsive password field was too complicated so it was removed. finally, integration was done by hooking up error handling, login and register apis/stores.
- Output used (zodErrorFormatter.ts): the second prompt was for the formatting of server side validation errors/general errors in the popup notification. the code is somewhat small and looks reasonable, so this was used with little modification.

# 27/9/2026
- Tool used: deepseek chat
- Mode: Generation
- Prompt:
```
given the following sample containing some tests in deno + typescript, write tests for the remainder of the controllers provided.

CONTROLLERS, RELEVANT INTERFACES AND MIDDLEWARE ATTACHED IN CONTEXT

describe("UserController.updateUserRole", () => {
    it("admin can grant admin to another user", async () => {
        const roleRepo  = {
            assignRoles: spy(async () => {}),
            removeRoles: spy(async () => {}),
        };
        const userRepo: Partial<IUserRepository> = {
            // should not care about the value
            getUserByIdPublic: spy(async (_id: number) => ({} as never))
        };
        const userController = new UserController(makeUserRepo(userRepo), makeRoleRepo(roleRepo), {} as never);
        const ctx = new FakeCtx({
            params: { id: "9" },
            jwtPayload: adminPayload,
            validatedBody: { [Role.Admin]: true },
        });

        await userController.updateUserRole(ctx.asCtx());

        assertEquals(ctx.response.body, "updated");
        assertEquals(roleRepo.assignRoles.calls[0].args, [9, new Set([Role.Admin])]);
        assertEquals(roleRepo.removeRoles.calls.length, 0);
    });
    
    ...
});

... MORE MANUALLY WRITTEN TESTS PASSED AS EXAMPLES

// mock password hashing
export function makeHasher(overrides: Partial<IPasswordHash> = {}): IPasswordHash {
    return {
        hashPassword: overrides.hashPassword ?? (async (pw: string) => `hashed:${pw}`),
        verifyPassword: overrides.verifyPassword ?? (async () => true),
    };
}
... REST OF THE MOCK GENERATING UTILITY DEFINITIONS
```
- Output used: tests were selectively picked from the list of generated ones. many were irrelevant and tested external library functionality (they were removed). the accepted ones were manually inspected and manually refactored to be easier to read (lots of duplicate). some additional tests that were missing were added (e.g. a user being able to edit own role)

example of irrelevant tests: the other tests already cover this indirectly by failing if zod rejects them, which is dependent on the scheme
```
it("strips extra fields when schema is strict", async () => {
    const strict = z.object({ name: z.string() }).strict();
    const mw = validateBody(strict);
    const ctx = new FakeCtx({ bodyJson: { name: "hello", extra: true } });
    const next = spy(async () => {});

    await mw(ctx.asCtx(), next);

    // zod strict() rejects unknown keys — so this should 400
    assertEquals(ctx.response.status, 400);
    assertEquals(next.calls.length, 0);
});
```
# 29/9/2026
- Tool used: codex chat
- Mode: Generation
- Prompt:
```
Generate code to help me seed locations from the csv first then proceed to seed the suppliers, follow the format given by the comments given in the contract.prisma
```

# 18/10/2026
- Tool used: codex chat
- Mode: Generation
- Prompt:
```
Generate code so that when a user's credit account is missing, credit-service queries user-service via RPC. If the user exists, create their UserCredits entry without resetting any existing balance. If the user does not exist, retain the existing rejection behavior. Propagate RPC failures so they are not treated as nonexistent users.
```

# 23/10/2026
- Tool used: codex
- Mode: Generation
- Prompt:
```
generate documentation for README.md under user-service. capture the following info:
- first setup requirements (how to generate first admin invite code, exec into container and run the correct deno task)
- small table of api endpoints and what they do (summary)
- mermaidjs db diagram of the prisma schema
- project structure
ensure it is concise
```
- output used: sections were rearranged to have better logical ordering. the tool generated extra items such as a "how to run without containers" section. this was unnecessary, so similar items were removed.

# 26/10/2026
- Tool used: codex
- Mode: Generation
- Prompt:
```
scaffold setup of opentelemetry deno in user service (add env vars to docker compose). it should expose the http/grpc interface and push to a central opentelemetry collector (not present in compose yet)
write a set of hooks to intercept http inbound/outbound requests from oak.
add correlation/trace id to every request made (including handlers for rpc). ensure responses also contain modify the outbox table with a "metadata" column that is sent together with any item to the rabbitmq broker. make sure that correlation id is returned in http requests when generated.
make use of opentelemetry spans to demarcate operations and context like db transactions and broker actions (publish, rpc sent etc.)
```
- output used: most of the hooks provided made sense. i did a scan through and made sure that existing functional/business logic behaviour was not modified. it added a lot of random integration tests (db, queue) which were removed.

- Prompt:
```
create an outbox reliability monitoring worker in user service. updates should occur every 30 seconds. then the metrics poll will automatically pick up the last metric.
we want to measure the following metrics: pending/ready to be sent/delayed (due to temp failure)/fully failed. oldest unsent item. put the code into the telemetry directory and use the existing helpers in it.
```
- output used: the worker generated was acceptable. a welcome addition was that it also introduced some additional metrics like heartbeats to make it known if the worker actually active. this was an improvement, so it was accepted


# 6/11/2026 - AWS deployment revision
- Tool: OpenAI Codex. Mode: implementation, debugging, deployment and documentation.
- User selected separate ECS services, Nginx in its own ECS service, and HTTP public-IP entry without CloudFront.
- Restored teammate gateway, edge and Compose tracked files to repository HEAD. AWS-specific packaging is in scripts/aws/gateway; original API routes are copied at build time.
- Implemented AWS container packaging, operational helpers and verification. Earlier combined-proxy and single-task implementations were superseded at the user's request.
- Existing backend deployment fixes and frontend production packaging were also AI-assisted.
- Verification details and limitations are recorded in scripts/aws/README.md. Human review and full course-policy disclosure remain the team's responsibility; this entry does not certify compliance of earlier architecture discussions.
- HTTP demo compatibility: added frontend/src/util/uuid.ts and updated the errand form calls. Native randomUUID is unavailable on non-localhost HTTP; fallback retains cryptographic randomness. Type checking, production build and fallback UUID validation passed.

# 9/11/2026 - User-service trace header investigation
- Tool: OpenAI Codex. Inspected live HTTP responses and the running ECS task configuration.
- Prepared `scripts/aws/user-tracing.json` and a preview-first deployment helper to enable Deno tracing on user-service while preserving its existing task configuration.
- After user approval, deployed revision `campusgo-user:3` and waited for ECS service stability. Live gateway checks confirmed a generated X-Trace-Id on an empty login POST (HTTP 400) and the supplied W3C trace ID on health (HTTP 200). Successful authenticated login was not tested. Console telemetry uses the existing CloudWatch logging driver.
# 5/10/2026
- Tool used: Claude Code (Claude Opus)
- Mode: Generation
- Prompt:
```
lets create the admin supplier service frontend, specifically I think I mentioned previously, the remaining CRUD operations (create, update, delete)
```
- Output used: generated the supplier listing/detail pages and admin supplier + location CRUD UI, wired to the supplier-service API. Search, filter, sort and pagination were designed by the team. I reviewed and tested the pages manually.

# 17/10/2026
- Tool used: Claude Code (Claude Opus)
- Mode: Generation
- Prompt:
```
Ok, new design updates, for request errands, Pick up location changed to building or supplier
Drop off location changed to buildings
Also, if buildings is chosen as the location, that means it should allow aditional fields, like floor etc
```
- Output used: implemented the team's errand design decisions (building/floor locations, shared deadline with no grace period, supplier-hours pop-up), plus the admin users page and logout flow.

# 2/11/2026
- Tool used: Claude Code (Sonnet 5.5)
- Mode: Generation
- Prompt:
```
nice-to-have is live messaging (written down as WebRTC and a signalling server), please design and implement the chat service for me then walk me through it. The chat opens once a courier accepts the order, is between requester and courier without revealing phone numbers, stays open until 3 hours after the errand is completed and is then deleted, needs message history, no voice calling, only text and images.
```
- Output used: chat service with backend, database, RabbitMQ events, image support, deletion after 3 hours, the chat README 

# 3/11/2026
- Tool used: Claude Code (Claude Opus)
- Mode: Generation, Explanation
- Prompt:
```
Lets create a chat service Ui for it
```
- Prompt:
```
for N2H, we plan to include bookmarking/favouriting supplier/dropoff/pick up locations. We plan to do this in terms of like an array, including userid, the location details like supplier from supplier_db etc. Is thisa array design choice good?
```
- Output used: generated the chat UI and admin suspend/promote UI on existing backends. For favourites, our team planned to store them in user-service due to bounded context. We had discussed both an array (user ID with location or supplier details) and a separate relational table; I consulted the AI on whether the array design still had merit, and we chose the table. For deleted suppliers, I had considered checking favourites on load or periodically (similar to how delivery apps update a store's availability). The AI's recommended design used a check on load, matching what I had considered, which I extended so deleted favourites are removed automatically. I evaluated these, added custom places and rooms, confirmed with the team, and the AI implemented it. For supplier name reuse, I found the bug and researched partial indexes; the AI confirmed the fix and implemented it.
- Prompt:
```
refactor the outbox monitoring into a generic snapshot monitoring class to handle the standard lifecycle of this metrics worker. setup the same metrics monitoring code to generate metrics for user service. the metrics should be based on the getMetricsSnapshot funciton in UserRepository.
```
- output used: the abstraction generated was adequate and I did some touchup to the code formatting and comments. the user metrics code generated the correct fields based on the function provided.

# 6/11/2026
- Tool used: codex
- Mode: Generation
- Prompt:
```
replace the existing placeholder dashboard at observability/grafana/dashboards.

implement the following in the dashboard:
- per service dashboard
- service status (up/down)
- p50/p95/p99 request timings per route in a table among all queries in the currently selected window
- requests/second per route
- average latency per service
- http 500 counts in timeframe
- outbox processing status (failed, message processing delay, backlog count, oldest pending event)
- connection to rabbitmq broker
- user service: number of auth requests, accounts in existence (by their status)
- db performance (query/update p95 times)
- rabbitmq dashboard to monitor items per queue (including separate widgets for dlqs) and broker health
- central dashboard summarising the same info on all services and rabbitmq

this is a dump of queryable fields from prometheus to be used in promql queries:
METADATA DUMP OF FILTERED FIELDS FROM PROMETHEUS API HERE
```
- output used: inspection of the dashboard had some obvious bugs. e.g. the model had decided to ignore the processing window for  the selected window and opted for a fixed 5 seconds. this meant that some of the metrics would quickly become "unavailable" after the request ended, making it useless. I manually fixed this by adjusting the timing to fit the current filters.

# 8/11/2026
- Tool used: codex
- Mode: Generation
- Prompt:
```
update the existing dashboard to accomodate for the following newly added metrics.
like the existing dashboard, high level details should be on the summary dashboard and the detailed results go into their respective service dashboards.
include the following details:
- credit: counters for credits per status (active, in circulation, in hold) and the corresponding plots over time
- order: counters for orders (and overdue ones) per status and their plots over time. and counters for oldest pending/active orders.

METADATA DUMP OF NEW FIELDS FROM PROMETHEUS API HERE
```
- output used: the output followed perfectly using the existing dashboard as reference. nothing had to be changed.

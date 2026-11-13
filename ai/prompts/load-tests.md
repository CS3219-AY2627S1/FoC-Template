# Timestamp: 2026-10-30
# Key Prompt:

NFR1
1.1
The system shall support an increasing number of concurrent active users without significant degradation in service quality.  


1.1.1
User Service shall handle up to 100 concurrent active users without going offline.


1.1.2
User Service shall process at least 100 concurrent registration or login requests per minute with an overall authentication request failure rate below 1.0%.


1.1.3
Errand Service shall support up to 100 concurrent users viewing, creating, or updating errands with an overall processing failure rate below 1.0%.


1.1.4
Credit Service shall process up to 100 concurrent transactions per second with an overall processing failure rate below 1.0%.


1.1.5
Supplier Service shall process at least 100 concurrent supplier detail requests per minute with an overall requesting failure rate below 1.0%.

2.1
The system shall provide a list containing up to 100 available errands within five seconds for at least 95% of requests.


2.1.1
While such a request is pending, the system shall continue to respond to unrelated user requests within their applicable response-time limits.
2.2
The system shall provide timely responses to common user actions.


2.2.1
All durations stated below start when the service receives the request, and end when the service starts sending a response.


2.2.2
The User Service shall verify credentials and start returning an authentication token within 500 ms of receiving the request, for at least 95% of the time.


2.2.3
At least 95% of valid create, accept, and cancel errand requests sent to the Errand Service shall start returning a success or error response within 250 ms.


2.2.4
At least 95% of valid credit reservation and transfer requests sent to the Credit Service shall start returning a success or error response within 200 ms.


2.2.5
At least 95% of valid supplier query, sort, or filter requests sent to the Supplier Service shall return a response within 200 ms.

Key implementation details:
1. Run k6 with cloud local execution, streaming to Grafana Cloud.
The load generator runs locally or on a GitHub Actions runner; Grafana Cloud only stores, visualises, and compares results. The repository scripts are the source of truth and the Grafana web editor is for experimentation only. Secrets are K6_CLOUD_TOKEN, K6_CLOUD_STACK_ID, and K6_CLOUD_PROJECT_ID.

2. Cover the system with seven implemented scripts.
Browse smoke (read-only), lifecycle (full flow plus settlement), core scenarios (create, acceptance race, credit guards), and four NFR scripts: auth login throughput, errand-mixed read/write, credit balance reads, and supplier queries. nfr-errand-read.js is referenced and wired into the runner and workflow, but its implementation is not shown in any log entry.

3. Use the settled thresholds as the pass/fail gate.
HTTP failure rate under 1% and checks over 99%. p95 limits: login 500ms, errand reads 250ms, mixed reads 250ms, create 250ms, cancel 150ms, credit 200ms, supplier 200ms, browse and lifecycle 2000ms. k6 exits non-zero when a threshold fails, so CI fails automatically. Lifecycle and core also carry count>0 execution thresholds, so a zero-execution run cannot pass vacuously.

4. Cap all NFR runs at 100 VUs.
Grafana Cloud's free tier caps the project at 100 VUs, so every NFR max-VU default is 100. Auth still runs its 500 logins per minute within that cap.

5. Provision disposable test data per run, never register inside a test.
The local provisioner (provision-test-data.mjs) creates a requester, courier-a, and courier-b through the normal registration flow (Floci SES OTP, profile creation, credit wait), discovers an operational supplier, and writes .env.generated. The AWS provisioner (provision-aws-test-data.mjs) does the same through AWS CLI Cognito administration and writes .env.aws.generated. The generated file is the single source of test configuration. Credentials come from environment variables or Grafana Cloud k6 secrets (lowercase names such as loadtestrequesteremail); never hard-code them and never print tokens in logs.

6. The AWS provisioner also creates the fixture errand.
It creates one disposable open fixture errand and writes LOAD_TEST_ERRAND_ID plus LOAD_TEST_FIXTURE_CREDIT_AMOUNT=1 into .env.aws.generated. The mixed script's detail reads use that fixture errand, never the first list result, because the write scenario creates, cancels, and deletes its own errands concurrently. The local provisioner does not create a fixture errand in this log.

7. Forward variables to k6 with explicit --env flags.
Invoke-K6Cloud.ps1 runs k6 cloud run --local-execution via --entrypoint sh grafana/k6, forwarding an explicit variable list as --env NAME="$NAME" (base URL, credentials, supplier, service type, credit amount, errand ID, cleanup flag, summary path, project ID, and all NFR_* sets). .env.generated is the single source of configuration and the helper holds no duplicated defaults. No Compose rebuild is needed for k6-only changes; rebuild only when Compose is stopped, application source or Dockerfiles changed, or service configuration changed.

8. Run the workflow from one file with a suite selector.
.github/workflows/load-tests.yml: pull requests run only the local browse smoke test with plain k6 run and no Grafana token, so fork PRs need no secrets. Manual dispatch selects smoke, lifecycle, core, nfr, or full; push to main and the nightly schedule (02:00 SGT) run the full suite. The job runs on ubuntu-latest with a 35-minute timeout, provisions with the local provisioner, runs the selected scripts, uploads the k6-summaries artifact always, collects Compose diagnostics on failure, and tears Compose down always.

9. Connect GitHub Actions to AWS with OIDC and an IAM role, never long-lived keys.
The workflow uses id-token: write plus contents: read and aws-actions/configure-aws-credentials@v4, with the role ARN from the secret AWS_LOAD_TEST_ROLE_ARN (region ap-southeast-1). The role needs EKS discovery, kubeconfig update, relay resource and ingress reads, relay-auth CloudFormation output reads, and Cognito test-user administration; it must also be granted access inside EKS, or AWS authentication succeeds but kubectl returns Forbidden.

10. Derive the AWS base URL from CloudFront, with exactly one enabled distribution.
The workflow queries aws cloudfront list-distributions for enabled distributions, fails if none are found, fails if more than one is found (so tests cannot target the wrong application), and uses the single discovered hostname as BASE_URL via $GITHUB_ENV. There is no expected hostname and no repository variable.

11. Verify the full lifecycle and settlement in the lifecycle script.
OPEN -> ACCEPTED -> PICKED_UP -> DELIVERED -> CONFIRMED with separate requester and courier accounts, 1 VU and 1 iteration by default. Settlement is asynchronous through Kafka: waitForSettlement polls GET /api/credit/history?offset=0 for up to 30 seconds (1s poll) for a CREDIT_TRANSFER record matching service errand, the errand ID, sender, receiver, and amount. Cleanup deletes the confirmed errand (expects 204) without reversing the transfer. Summaries strip setup_data.

12. Prove exactly one acceptance winner and exactly one transfer in the core script.
Three staggered scenarios (create at 0s, acceptance race at 8s, credit guards at 16s), each 1 VU and 1 iteration. The race sends two parallel accepts with http.batch and requires exactly one 200 and a 409/404 loser, with exactly one assigned courierSub. The credit guard attempts a 1,000,000,000-credit create (expects 422 with the balance unchanged), runs accept -> pickup -> deliver -> confirm, a duplicate confirm (expects 409), and asserts exactly one transfer in both histories. Intentional non-2xx responses are whitelisted via expectedStatuses so only unexpected statuses count as failures. Race cleanup drops only the winning courier.

13. Keep NFR scripts honest about what they measure.
nfr-auth.js is login-only (500/min, 5 minutes, 50 pre-allocated VUs, max 100); registration needs a separate disposable account pool. nfr-credit.js measures public balance reads only (10/sec, 1 minute); the 300 TPS target is not benchmarked because reservation and transfer are internal Kafka-driven operations. nfr-supplier.js measures authenticated supplier queries (50/sec, 5 minutes). nfr-errand-mixed.js runs ramping reads (10 to 100 VUs, 2-minute hold) with a low create/cancel write rate (5/min) because each creation temporarily reserves requester credit.

14. Lifecycle and core need no changes after the deletion merge; deletion scenarios need a separate disposable-user test.
The provisioner creates completed profiles (satisfying the profile requirement), the CLOSED credit state only applies to deleted users, and cleanup deletes errands, not users — so the normal scripts are unaffected. Requester deletion cancelling or confirming errands, courier deletion reopening or expiring errands, REQUESTER_DELETED on accept, closed-account pending settlements, and combined deletion are not covered by these scripts and need a separate dedicated deletion scenario with disposable users, because deletion is destructive and would invalidate the provisioned users for later scenarios.


# Usage Scenario:
Generated initial implementation, decomposed into separate components, and fixed bugs for configuration
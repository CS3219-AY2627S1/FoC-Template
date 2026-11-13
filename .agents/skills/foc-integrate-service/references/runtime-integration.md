# Runtime integration

All repository paths below are relative to the repository root. Read only the sections relevant
to the selected service. Existing documentation can describe older iterations. Resolve current
behavior against source, tests and the newest approved handoff.

## Contracts and application adapters

- Discover the actual service stack from build files, lockfiles, scripts, source and tests.
  Use its documented runtime versions and commands. Check authorization in the backend,
  including resource ownership and the agreed freshness/revocation policy. The integration
  workflow cannot silently introduce a new project-wide eligibility policy.
- For HTTP dependencies, inspect the producer-owned paths, authentication, bounds on remote
  requests and error semantics. Preserve private callbacks and require trust for service
  identities. Keep remote calls outside database mutation locks where the existing design
  permits. Missing dependencies must produce explicit failure/unavailable behavior.
- For messaging, establish exact topics, producer/consumer owners, record keys, schema/version,
  group IDs, result semantics and recovery responsibilities before adding adapters. A record
  key is a domain ordering decision. Follow approved core contracts without silently extending
  their fields. Decide on outbox/inbox or equivalent transactional guarantees for the actual
  effects. A service with no messaging responsibility needs no Kafka client or principal.
- Verify business mutation and outgoing intent commit atomically where required. Consumers
  persist duplicate receipts together with effects before acknowledging. Test the gap between
  broker acceptance and local delivery marking, and between effect commit and offset commit.
  If a command expects an outcome, verify how the original result is recovered after loss.
  Broker receipt, DLT routing and timeouts have distinct meanings from business completion.

## Broker wiring

Inspect `deploy/kafka/README.md`, relevant initialization/verification scripts, and the selected
service's configuration. Reuse the existing broker and topic-initialization conventions.

- Provision only approved topics/groups and service-specific credentials. Grant scoped
  produce/consume/describe access and required DLT access. Check denial of outcome forgery,
  foreign groups and unrelated topics. Applications must not gain broker administration rights.
- Derive listener addresses from the caller's environment. Compose DNS, host ports and
  Kubernetes DNS differ. Verify advertised addresses as well as bootstrap reachability.
- Preserve existing principals/passwords and stored broker data on rerun. New principal setup
  can require a coordinated single-broker restart. Record that impact before activation.
- Use the current local transport convention. Document its authentication/encryption/replication
  limits. A production TLS or multi-broker design requires its own approved scope.

## Gateway, Compose and CI

- Inspect current gateway routes and their precedence. Add actual public paths and packaged
  UI/assets as needed, with service-local authorization. Keep `/internal/**` private. Respect
  shared browser-origin/session behavior and actual WebSocket requirements, if implemented.
- Derive Compose health/dependency behavior, private database networks, volumes, ports and
  secret inputs from existing services and the selected service's needs. Reuse volumes and
  environment values safely. Keep startup resilient to retryable integration dependencies.
- A required Compose variable must also reach `.env.example`, every Compose-running CI job
  and `deploy/kafka/Test-LocalKafka.sh`. CI uses its own explicit environment. Run
  `python3 .github/scripts/compose_env_check.py` after relevant changes.
- Inspect `.github/workflows/ci.yml`, `.github/scripts/image_plan.py` and `.github/README.md`.
  Add supported backend/frontend jobs, image selection/publishing and integration checks only
  for actual runnable components. Use existing package managers, locks, runtime versions and
  verification commands. Run affected script tests where applicable with
  `python3 -m unittest discover -s .github/scripts -p 'test_*.py'`.
- Build immutable service images from a known source revision. Inspect CI output for the real
  published image/tag or use an explicitly local versioned image loaded into the chosen cluster.
  Building, registry publishing and cluster deployment each have separate observable results.

## Verification and handoff

Use existing supported smoke scripts after reading their scope. The shared broker smoke may
restart broker components, so select a disposable project for destructive/failure phases. Keep
live account data and credentials out of fixtures and reports. Check the selected service's
real business effect through producer-owned APIs/tests/storage with appropriate access.

Update the existing service documentation with setup variables, commands, dependency matrix,
failure behavior, verified scope and owner handoffs. A fixture producer verifies the consumer
adapter only. Record real producer acceptance as pending until that producer has been exercised.

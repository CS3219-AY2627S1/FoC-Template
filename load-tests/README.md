# Relay load tests

The JavaScript files in this directory are the source of truth for Relay load tests. Tests execute locally in Docker and can stream metrics to Grafana Cloud with `Invoke-K6Cloud.ps1`.

There are two supported targets:

- Local Docker Compose: the provisioner uses `localhost`, while k6 uses `host.docker.internal`.
- AWS: the provisioner and k6 use the deployed CloudFront hostname over HTTPS.

Grafana Cloud runs use `--local-execution`: Grafana stores and displays metrics, but the requests still come from the local Docker engine.

## Prerequisites

- Docker Desktop running
- Node.js 24 and workspace dependencies installed (`npm ci`)
- Bash for environment startup; on Windows use WSL with Linux Node/npm
- PowerShell 7 (`pwsh`) for `Invoke-K6Cloud.ps1`, including on macOS/Linux
- AWS CLI for AWS provisioning; `kubectl` for Kubernetes/Headlamp checks
- Grafana Cloud k6 token, stack ID, and project ID for streaming

## Local Compose setup and provisioning

Start the local environment from Bash (macOS/Linux or WSL), from the repository root.
The Floci launcher must run first because it generates the required local
Cognito, database, S3, and Kafka configuration:

```bash
npm run up:compose
```

For a full uncached rebuild after application or Dockerfile changes:

```bash
npm run up:compose -- --no-cache
```

Do not use plain `docker compose up` for a fresh Floci environment; it cannot
discover the generated settings in `floci/docker/.generated.env`.

The local provisioner creates three disposable users, verifies them through Floci SES, creates profiles, waits for credit allocation, selects the operational `Octobox` supplier, and creates one open fixture errand.

The provisioner runs on your host, so it must use `localhost`; k6 runs inside
Docker and uses `host.docker.internal`. The PowerShell examples below work in
PowerShell 7 on Windows, macOS, and Linux:

```powershell
$env:BASE_URL = 'http://localhost:8080'
$env:FLOCI_URL = 'http://localhost:4566'
$env:LOAD_TEST_K6_BASE_URL = 'http://host.docker.internal:8080'
$env:LOAD_TEST_ENV_FILE = 'load-tests/.env.generated'

node load-tests/provision-test-data.mjs
```

The provisioner writes `load-tests/.env.generated` with fresh credentials,
supplier details, fixture errand ID, Docker-facing `BASE_URL`, and all smoke,
lifecycle, and NFR settings. It is ignored by Git.

The tracked `.env.example` documents available fields and defaults; Node does
not load it automatically. Do not commit generated files, credentials, or
results.

Verify the local services before provisioning:

```powershell
Invoke-WebRequest http://localhost:8080/healthz
Invoke-WebRequest http://localhost:4566/_aws/ses
```

If provisioning reports `fetch failed`, ensure `$env:BASE_URL` is
`http://localhost:8080`, not `http://host.docker.internal:8080`.

## AWS provisioning

The AWS provisioner is separate from the local Floci provisioner. It creates
three disposable Cognito users with verified email attributes and permanent
passwords, creates Relay profiles through the deployed CloudFront endpoint,
waits for credit allocation, selects operational `Octobox`, and creates one
fixture errand.

The AWS deployment must already be running. The public CloudFront hostname is
the endpoint to test. In PowerShell:

```powershell
$env:AWS_PROFILE = 'relay-sso'
$env:AWS_REGION = 'ap-southeast-1'
$env:AWS_DEFAULT_REGION = $env:AWS_REGION

$cloudFrontDomain = aws cloudfront list-distributions `
  --profile $env:AWS_PROFILE `
  --query "DistributionList.Items[].DomainName" `
  --output text

# Select the deployed distribution from the output above.
$env:BASE_URL = "https://<cloudfront-domain>.cloudfront.net"
$env:COGNITO_USER_POOL_ID = aws cloudformation describe-stacks `
  --stack-name relay-auth `
  --region $env:AWS_REGION `
  --profile $env:AWS_PROFILE `
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" `
  --output text

$env:LOAD_TEST_ENV_FILE = 'load-tests/.env.aws.generated'
$env:LOAD_TEST_SUPPLIER_NAME = 'Octobox'
$env:LOAD_TEST_CLEANUP = 'true'

node load-tests/provision-aws-test-data.mjs
```

The generated `load-tests/.env.aws.generated` contains the CloudFront URL,
credentials, supplier ID, service type, fixture errand ID, and test configuration. The AWS
CLI profile must be allowed to administer users in the Cognito pool.

The AWS provisioner does not delete Cognito users. Remove disposable users
separately if the AWS pool must be cleaned completely.

## Grafana Cloud setup

Set Grafana credentials in the current PowerShell session; never commit the
token:

```powershell
$env:K6_CLOUD_TOKEN = 'your-grafana-cloud-k6-token'
$env:K6_CLOUD_STACK_ID = 'your-grafana-cloud-stack-id'
$env:K6_CLOUD_PROJECT_ID = 'your-grafana-k6-project-id'
```

Load the reusable runner:

```powershell
. ./load-tests/Invoke-K6Cloud.ps1
```

On macOS/Linux, enter `pwsh` from your terminal before running these commands.
On Windows only, if script execution is blocked, use
`Set-ExecutionPolicy -Scope Process Bypass` in that PowerShell session first.

The helper reads test configuration from the file passed through `-EnvFile`,
adds the Docker host gateway, runs k6 with `--local-execution`, and streams
metrics to Grafana Cloud.

## Run local tests and stream to Grafana Cloud

After local provisioning, use `.env.generated`:

```powershell
Invoke-K6Cloud -Script 'errand-browse-smoke.js' -Summary 'local-browse-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'errand-lifecycle.js' -Summary 'local-lifecycle-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'errand-core-scenarios.js' -Summary 'local-core-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'nfr-auth.js' -Summary 'local-nfr-auth-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'nfr-errand-read.js' -Summary 'local-nfr-errand-read-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'nfr-errand-mixed.js' -Summary 'local-nfr-errand-mixed-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'nfr-credit.js' -Summary 'local-nfr-credit-summary.json' -EnvFile 'load-tests/.env.generated'
Invoke-K6Cloud -Script 'nfr-supplier.js' -Summary 'local-nfr-supplier-summary.json' -EnvFile 'load-tests/.env.generated'
```

The local app must remain running throughout the tests. Rerun the provisioner
after `npm run down:compose` with volume cleanup or when generated credentials
change.

## Run AWS tests and stream to Grafana Cloud

After AWS provisioning, use `.env.aws.generated`. It already contains the CloudFront
`BASE_URL`, so no supplier ID or credential needs to be typed into the command:

```powershell
Invoke-K6Cloud -Script 'errand-browse-smoke.js' -Summary 'aws-browse-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'errand-lifecycle.js' -Summary 'aws-lifecycle-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'errand-core-scenarios.js' -Summary 'aws-core-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'nfr-auth.js' -Summary 'aws-nfr-auth-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'nfr-errand-read.js' -Summary 'aws-nfr-errand-read-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'nfr-errand-mixed.js' -Summary 'aws-nfr-errand-mixed-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'nfr-credit.js' -Summary 'aws-nfr-credit-summary.json' -EnvFile 'load-tests/.env.aws.generated'
Invoke-K6Cloud -Script 'nfr-supplier.js' -Summary 'aws-nfr-supplier-summary.json' -EnvFile 'load-tests/.env.aws.generated'
```

The AWS deployment must stay available for the entire run. Tear it down when
finished to avoid unnecessary AWS charges.

## Observe autoscaling with Headlamp

Run the following from the repository root in Bash. For AWS, configure your
profile and region, then add and select the deployed cluster's Kubernetes
context. Replace `relay-sso` and the cluster name `relay` if yours differ:

```bash
export AWS_PROFILE=relay-sso
export AWS_REGION=ap-southeast-1
aws sso login --profile "$AWS_PROFILE"
aws eks update-kubeconfig --region "$AWS_REGION" --name relay --alias relay-aws
kubectl config get-contexts
kubectl config use-context relay-aws
kubectl config current-context
kubectl -n relay get pods
npm run headlamp -- start relay-aws
```

`update-kubeconfig` also selects the context; the explicit `use-context` command
shows how to switch back to it later. The Headlamp helper uses the current
context by default, or the context passed after the action as shown above.
If `KUBECONFIG` is set, these commands use that file; make sure it points to
your intended AWS configuration rather than `floci/eks/.kubeconfig`.

Open http://localhost:9082, paste the printed token, and select cluster `main`
and namespace `relay`. Keep the startup terminal open. In another Bash terminal
with the same AWS profile, region, and kubeconfig, check autoscaling prerequisites:

```bash
npm run headlamp -- check relay-aws
```

CPU/memory metrics must be numeric and KEDA must be available. For local Floci
EKS, use the existing launcher instead; it automatically selects the generated
`floci/eks/.kubeconfig`, so no global context switch is needed:

```bash
npm run views:eks -- headlamp
```

The local EKS environment must already be running (`npm run up:eks`).
See the [deployment guide](../deploy/README.md#observe-autoscaling-in-headlamp)
for setup, permissions, and cleanup.

After provisioning AWS test users, run a sustained Supplier test in the
PowerShell session with `Invoke-K6Cloud` loaded:

```powershell
Invoke-K6Cloud -Script 'nfr-supplier.js' -Summary 'aws-autoscaling-supplier-summary.json' -EnvFile 'load-tests/.env.aws.generated'
```

Watch `supplier-api` under Horizontal Pod Autoscalers, Deployments, and Pods.
Record its initial replicas and metrics, peak replicas, ready Pod count, and
replicas several minutes after load stops, alongside k6 error rate and p95
latency. The default test lasts five minutes at 50 requests/second; increase
`NFR_SUPPLIER_RATE_PER_SEC` or `NFR_SUPPLIER_DURATION` in the generated env file
gradually if CPU stays below target. A run does not guarantee scaling: actual
resource use must exceed the HPA target. Memory can also trigger or sustain
scaling. Keep successful authenticated requests above 99% so errors are not
mistaken for application load.

For Credit HTTP load, use `nfr-credit.js` and inspect `keda-hpa-credit-api`.
HTTP reads exercise CPU/memory scaling; Kafka-lag scaling requires producing
enough errand events to exceed consumer throughput. Inspect the `credit-api`
ScaledObject conditions as well as its HPA during that separate scenario.

## Test coverage

- `errand-browse-smoke.js`: authenticated visible and owned errand reads.
- `errand-lifecycle.js`: create, accept, pickup, delivery, confirmation, and asynchronous credit settlement.
- `errand-core-scenarios.js`: create verification, concurrent acceptance, and credit guards.
- `nfr-auth.js`: authentication arrival-rate workload.
- `nfr-errand-read.js`: ramping authenticated errand reads.
- `nfr-errand-mixed.js`: concurrent errand reads and create/cancel writes. Its
  latency limits are operation-specific: 250 ms for reads, 250 ms for create,
  and 150 ms for cancel.
- `nfr-credit.js`: authenticated credit-balance reads and non-negative balance checks.
- `nfr-credit-estimation.js`: sustained AI credit-estimation recommendations across three users.
- `credit-estimation-rate-limit.js`: exact per-user rate-limit boundary behavior.
- `nfr-supplier.js`: authenticated supplier-query workload.

NFR defaults are bounded by the current Grafana Cloud project limit. The
general errand-read limit is 250 ms because read latency varies between runs.
The mixed test uses separate read/create/cancel limits because those operations
perform different synchronous work; this is threshold calibration, not an
application performance fix. The supplier limit remains 200 ms until its long-tail p99
behavior is investigated. Increase load gradually and record VUs, throughput,
p95 latency, failure rate, threshold status, and the Grafana run link.

Lifecycle and Core are correctness tests, not only latency tests. Their
summaries must contain nonzero scenario-execution counters, HTTP requests, and
checks. A Grafana run showing zero requests must not be reported as passing;
validate it locally with plain `k6 run` before relying on the cloud result.

## Local credit estimation single-instance suite

The local suite runs the sustained estimation NFR and exact per-user
rate-limit boundary test against one `credit-estimation-api` container. A
temporary OpenAI-compatible mock makes responses deterministic and avoids paid
provider calls. A separate temporary Redis instance isolates limiter state and
is reset between the two scenarios.

Start and provision the local environment first as described above. Then run
with Docker Desktop running:

```bash
node load-tests/run-credit-estimation-single-instance.mjs
```

The single runner creates its Compose override and mock AI server configuration
in a temporary directory, verifies that exactly one estimator container is
active, executes both k6 files directly without Grafana Cloud, and restores the
normal Compose estimator configuration afterward. By default, the sustained
test runs at 15 requests per minute for three minutes; the boundary test sends
25 requests and expects exactly 20 successes plus 5 rate-limit responses.
Summaries are written under `load-tests/results/`.

## Cleanup

For local Compose:

```powershell
$env:BASE_URL = 'http://localhost:8080'
$env:LOAD_TEST_ENV_FILE = 'load-tests/.env.generated'
node load-tests/cleanup-test-data.mjs
```

Then remove the local environment and Floci-managed database volumes from Bash:

```bash
npm run down:compose
```

For AWS, use the CloudFront URL and AWS-generated environment:

```powershell
$env:BASE_URL = "https://<cloudfront-domain>.cloudfront.net"
$env:LOAD_TEST_ENV_FILE = 'load-tests/.env.aws.generated'
node load-tests/cleanup-test-data.mjs
```

This removes the fixture errand only. It does not delete Cognito users, RDS
snapshots, S3 objects, or AWS stacks.

## GitHub Actions

`.github/workflows/load-tests.yml` supports two manual targets:

- `local`: starts disposable local Compose services and uses
  `provision-test-data.mjs`.
- `aws`: assumes the configured AWS OIDC role, validates the configured
  CloudFront distribution through the AWS CLI, uses `provision-aws-test-data.mjs`,
  and runs against that CloudFront endpoint.

For both targets, k6 executes on the GitHub runner. Non-PR runs stream metrics
to Grafana Cloud; pull requests run only the local browse smoke test without
cloud credentials. The workflow also runs the full listed suite locally on
matching `main` pushes and daily at 18:00 UTC (02:00 Singapore time).
Manual runs can select `smoke`, `lifecycle`, `core`, `nfr`, or `full`. The estimator
single-instance suite is separate and is not included in those workflow suites.
Summaries and diagnostics are uploaded, and local Compose is cleaned up after
failures.

Configure these repository secrets for non-PR cloud runs:

- `K6_CLOUD_TOKEN`
- `K6_CLOUD_STACK_ID`
- `K6_CLOUD_PROJECT_ID`
- `AWS_LOAD_TEST_ROLE_ARN` (required for the manual `aws` target)

The `aws` target queries enabled CloudFront distributions directly through the
AWS CLI. It requires exactly one enabled distribution so that the workflow
cannot accidentally test the wrong application. No CloudFront URL repository
variable is required.

The AWS target assumes an already-deployed `relay` EKS cluster and
`relay-auth` CloudFormation stack. It does not deploy or tear down AWS
resources automatically.

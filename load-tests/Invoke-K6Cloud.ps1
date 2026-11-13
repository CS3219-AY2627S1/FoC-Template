# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-04
# Scope: Generated initial implementation of the Grafana Cloud k6 runner script.
# Author review: I validated correctness, edited for domain needs, and debugged as necessary.

function Invoke-K6Cloud {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Script,

        [Parameter(Mandatory)]
        [string]$Summary,

        [string]$EnvFile = "load-tests/.env.generated"
    )

    $forwardedVariables = @(
        "BASE_URL", "LOAD_TEST_USER_EMAIL", "LOAD_TEST_USER_PASSWORD",
        "LOAD_TEST_REQUESTER_EMAIL", "LOAD_TEST_REQUESTER_PASSWORD",
        "LOAD_TEST_COURIER_EMAIL", "LOAD_TEST_COURIER_PASSWORD",
        "LOAD_TEST_COURIER_B_EMAIL", "LOAD_TEST_COURIER_B_PASSWORD",
        "LOAD_TEST_SUPPLIER_ID", "LOAD_TEST_SERVICE_TYPE",
        "LOAD_TEST_CREDIT_AMOUNT", "LOAD_TEST_ERRAND_ID", "LOAD_TEST_CLEANUP",
        "SMOKE_VUS", "SMOKE_DURATION",
        "LIFECYCLE_VUS", "LIFECYCLE_ITERATIONS", "LIFECYCLE_MAX_DURATION",
        "SETTLEMENT_TIMEOUT_SECONDS", "SETTLEMENT_POLL_SECONDS",
        "K6_CLOUD_PROJECT_ID",
        "NFR_AUTH_RATE_PER_MIN", "NFR_AUTH_DURATION", "NFR_AUTH_PREALLOCATED_VUS",
        "NFR_AUTH_MAX_VUS", "NFR_AUTH_P95_LIMIT_MS",
        "NFR_START_VUS", "NFR_TARGET_VUS", "NFR_RAMP_DURATION", "NFR_HOLD_DURATION",
        "NFR_RAMP_DOWN_DURATION", "NFR_THINK_TIME", "NFR_P95_LIMIT_MS",
        "NFR_MIXED_READ_TARGET_VUS", "NFR_MIXED_READ_HOLD_DURATION",
        "NFR_MIXED_WRITE_RATE_PER_MIN", "NFR_MIXED_WRITE_DURATION",
        "NFR_MIXED_THINK_TIME", "NFR_MIXED_READ_P95_LIMIT_MS",
        "NFR_MIXED_CREATE_P95_LIMIT_MS", "NFR_MIXED_CANCEL_P95_LIMIT_MS",
        "NFR_CREDIT_RATE_PER_SEC", "NFR_CREDIT_DURATION",
        "NFR_CREDIT_PREALLOCATED_VUS", "NFR_CREDIT_MAX_VUS", "NFR_CREDIT_P95_LIMIT_MS",
        "NFR_SUPPLIER_RATE_PER_SEC", "NFR_SUPPLIER_DURATION",
        "NFR_SUPPLIER_PREALLOCATED_VUS", "NFR_SUPPLIER_MAX_VUS",
        "NFR_SUPPLIER_P95_LIMIT_MS"
    )

    # The generated env file is the single source of test configuration.
    $k6EnvArguments = ($forwardedVariables | ForEach-Object {
        '--env ' + $_ + '="$' + $_ + '"'
    }) -join " "

    $summaryContainerPath = "/scripts/results/$Summary"
    $k6Command = 'k6 cloud run --local-execution ' +
        $k6EnvArguments +
        ' --env K6_SUMMARY_PATH="' + $summaryContainerPath + '" /scripts/' + $Script

    New-Item -ItemType Directory -Force load-tests/results | Out-Null
    if ($IsLinux) {
        & chmod 777 load-tests/results
    }

    docker run --rm -i `
        --add-host host.docker.internal:host-gateway `
        --env-file $EnvFile `
        -e "K6_CLOUD_TOKEN=$env:K6_CLOUD_TOKEN" `
        -e "K6_CLOUD_STACK_ID=$env:K6_CLOUD_STACK_ID" `
        -e "K6_CLOUD_PROJECT_ID=$env:K6_CLOUD_PROJECT_ID" `
        -e "K6_SUMMARY_PATH=$summaryContainerPath" `
        -v "${PWD}/load-tests:/scripts" `
        --entrypoint sh `
        grafana/k6 `
        -c "$k6Command"
}

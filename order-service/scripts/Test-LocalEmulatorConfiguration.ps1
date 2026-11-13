# Read-only CHANGE-105 configuration safety checks. Never prints private .env.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeJson = & docker compose --project-directory $repoRoot -f "$repoRoot/compose.yaml" -f "$repoRoot/compose.http-peers.yaml" -f "$repoRoot/compose.local-live.yaml" config --format json
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration invalid.' }
$config = ($composeJson -join "`n") | ConvertFrom-Json
$script:checks = 0
function Assert-Config($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}
$order = $config.services.'order-service'
$credit = $config.services.'credit-service'
Assert-Config ($order.environment.ORDER_PEERS_MODE -eq 'http') 'Order must use real HTTP peers.'
Assert-Config ($order.environment.ORDER_COMMANDS_ENABLED -eq 'true') 'Durable commands must be enabled.'
Assert-Config ($order.environment.ORDER_USER_SERVICE_MODE -eq 'http') 'Order role lookup must be real.'
Assert-Config ($credit.environment.USER_SERVICE_MODE -eq 'http') 'Credit role lookup must be real.'
Assert-Config ($config.services.'supplier-service'.environment.USER_SERVICE_MODE -eq 'http') 'Supplier role lookup must be real.'
Assert-Config ($order.environment.ORDER_MESSAGING_MODE -eq 'emulator') 'Local Order must select emulator explicitly.'
Assert-Config ($order.environment.PUBSUB_PROJECT_ID -eq 'demo-foc-local') 'No real GCP project for local publishing.'
Assert-Config ($order.environment.PUBSUB_EMULATOR_HOST -eq 'pubsub-emulator:8085') 'Local transport host mismatch.'
Assert-Config (-not $order.environment.GOOGLE_APPLICATION_CREDENTIALS) 'No ADC configured in local Order.'
Assert-Config (-not ($order.volumes | Where-Object { $_.target -match 'gcloud|credential' })) 'No ADC mount.'
Assert-Config ($credit.environment.CREDIT_PUBSUB_PUSH_MODE -eq 'emulator') 'Local Credit must use emulator gate.'
Assert-Config ($credit.environment.FOC_ENVIRONMENT -eq 'local') 'Unsigned push requires local environment.'
Assert-Config ($credit.environment.FIREBASE_AUTH_EMULATOR_HOST -eq 'firebase-emulator:9099') 'Auth emulator required.'
Assert-Config ($order.environment.ORDER_LIFECYCLE_CRON -eq '0 * * * * *') 'Lifecycle cadence must be one minute.'
Assert-Config ($order.environment.ORDER_OUTBOX_RECOVERY_CRON -eq '0 */15 * * * *') 'Recovery cadence must be 15 minutes.'
Assert-Config ($order.environment.ORDER_LIFECYCLE_EXTERNAL_ENABLED -eq 'false') 'External lifecycle hook must be disabled.'
Assert-Config ($order.depends_on.'pubsub-init'.condition -eq 'service_completed_successfully') 'Broker initialization must precede Order.'
Assert-Config (-not $config.services.'credit-push-tunnel' -and -not $config.services.'credit-push-ingress') 'No public tunnel/ingress helper.'
foreach ($environment in @('staging','production')) {
    $envFile = Get-Content -Encoding UTF8 "$repoRoot/infra/environments/$environment.env"
    $suffix = if ($environment -eq 'production') { 'prod' } else { 'staging' }
    foreach ($topic in @('ORDER_COMPLETION_TOPIC=order-completion','ORDER_OPEN_REFUND_TOPIC=open-order-refund','ORDER_ACCEPTED_CANCELLATION_TOPIC=accepted-order-cancellation')) {
        Assert-Config ($envFile -contains "$topic-$suffix-v1") "Missing $environment topic binding."
    }
}
$deployment = Get-Content -Raw -Encoding UTF8 "$repoRoot/order-service/deploy/env.yaml"
Assert-Config ($deployment.Contains('ORDER_MESSAGING_MODE: "cloud"')) 'Cloud transport must be explicit.'
foreach ($key in @('ORDER_COMPLETION_TOPIC','ORDER_OPEN_REFUND_TOPIC','ORDER_ACCEPTED_CANCELLATION_TOPIC')) {
    Assert-Config ($deployment.Contains($key + ': "${' + $key + '}"')) "Cloud topic must interpolate $key."
}
$runtime = Get-Content -Raw -Encoding UTF8 "$repoRoot/order-service/deploy/service.conf"
Assert-Config ($runtime.Contains('--min-instances=1') -and $runtime.Contains('--no-cpu-throttling')) 'Cloud idle CPU approval must be wired.'
Write-Output "PASS $script:checks local/cloud configuration safety assertions. No cloud calls or private settings printed."

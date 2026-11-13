# Local-only configuration/safety tests. No gcloud calls or application DB writes.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$setupPath = Join-Path $PSScriptRoot 'local-live.ps1'
if (-not (Test-Path -LiteralPath $setupPath)) { throw 'RED: local-live.ps1 is not implemented.' }
. $setupPath
$script:assertions = 0
function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw "FAIL: $Message" }
    $script:assertions++
}
function Assert-Rejected([scriptblock] $Operation, [string] $Message) {
    $rejected = $false
    try { & $Operation } catch { $rejected = $true }
    Assert-True $rejected $Message
}
$names = Get-LocalLiveNames 'test-project' 'vincent'
Assert-True ($names.RefundTopic -eq 'open-order-refund-local-vincent-v1') 'Isolated refund name'
Assert-True ($names.CompletionSubscription -eq 'credit-order-completion-local-vincent-v1') 'Isolated completion subscription'
Assert-True ($names.PushAccount -eq 'foc-local-vincent-push@test-project.iam.gserviceaccount.com') 'Real push SA name'
Assert-True ($names.Audience -eq 'https://foc-local-vincent.invalid/credit-push') 'Stable explicit audience'
foreach ($badId in @('main','staging','production','dev','prod','x','Vincent','bad_id','a;remove','toolongdeveloperid')) {
    Assert-Rejected { Get-LocalLiveNames 'test-project' $badId } "Reject unsafe/shared namespace $badId"
}
Assert-Rejected { Get-LocalLiveNames '../project' 'vincent' } 'Reject invalid project'
Assert-LocalPushUrl 'https://sample-tunnel.trycloudflare.com'
$script:assertions++
foreach ($url in @('http://sample.trycloudflare.com','https://localhost:8084','https://sample.trycloudflare.com.evil.test','https://user:pass@sample.trycloudflare.com','https://sample.trycloudflare.com/api','https://sample.trycloudflare.com?token=x')) {
    Assert-Rejected { Assert-LocalPushUrl $url } "Reject unexpected ingress URL $url"
}
$owned = [pscustomobject]@{ labels = [pscustomobject]@{ 'foc-local-test' = 'vincent'; 'foc-component' = 'order-credit' }; topic = 'projects/test-project/topics/open-order-refund-local-vincent-v1' }
Assert-ManagedResource $owned 'vincent' $owned.topic
$script:assertions++
Assert-Rejected { Assert-ManagedResource ([pscustomobject]@{}) 'vincent' } 'Reject unlabeled resource'
Assert-Rejected { Assert-ManagedResource $owned 'other' } 'Reject other developer resource'
Assert-Rejected { Assert-ManagedResource $owned 'vincent' 'projects/test-project/topics/shared-dev' } 'Never retarget foreign topic'
$fakeCloud = @{}
$script:cloudCalls = [System.Collections.Generic.List[string]]::new()
function Invoke-Cloud([string[]] $Arguments, [switch] $AllowMissing) {
    $script:cloudCalls.Add(($Arguments -join ' '))
    if ($Arguments[2] -eq 'describe') { return $fakeCloud[$Arguments[3]] }
    return ''
}
$fakeCloud[$names.RefundTopic] = $owned | ConvertTo-Json -Depth 8 -Compress
Ensure-LocalTopic 'test-project' 'vincent' $names.RefundTopic
Assert-True ($script:cloudCalls.Count -eq 1) 'Reuse owned topic without recreation'
$script:cloudCalls.Clear()
$fakeCloud[$names.RefundTopic] = '{"labels":{"foc-local-test":"peer","foc-component":"order-credit"}}'
Assert-Rejected { Ensure-LocalTopic 'test-project' 'vincent' $names.RefundTopic } 'Refuse existing peer resource before mutation'
Assert-True ($script:cloudCalls.Count -eq 1) 'No mutation after ownership refusal'
$fakeCloud.Clear()
$script:cloudCalls.Clear()
Ensure-LocalTopic 'test-project' 'vincent' $names.RefundTopic
Assert-True ($script:cloudCalls.Count -eq 2 -and $script:cloudCalls[1].Contains('topics create')) 'Create missing isolated topic'
Assert-True ($script:cloudCalls[1].Contains('foc-local-test=vincent')) 'Label created topic'
$script:cloudCalls.Clear()
Ensure-LocalSubscription 'test-project' 'vincent' $names.RefundSubscription $names.RefundTopic $names 'https://sample-tunnel.trycloudflare.com/api/credits/internal/order-events/open-refund'
Assert-True ($script:cloudCalls.Count -eq 2) 'Missing push subscription is created once'
Assert-True ($script:cloudCalls[1].Contains('--push-auth-token-audience https://foc-local-vincent.invalid/credit-push')) 'Configure custom audience on creation'
Assert-True ($script:cloudCalls[1].Contains('--push-auth-service-account foc-local-vincent-push@test-project.iam.gserviceaccount.com')) 'Authenticated push, not public no-auth delivery'
Assert-True ($script:cloudCalls[1].Contains('--dead-letter-topic projects/test-project/topics/order-credit-dlq-local-vincent-v1')) 'DLQ configured'
$fakeCloud[$names.RefundSubscription] = $owned | ConvertTo-Json -Depth 8 -Compress
$script:cloudCalls.Clear()
Ensure-LocalSubscription 'test-project' 'vincent' $names.RefundSubscription $names.RefundTopic $names 'https://new-tunnel.trycloudflare.com/api/credits/internal/order-events/open-refund'
Assert-True ($script:cloudCalls.Count -eq 3 -and $script:cloudCalls[1].Contains('--update-labels=')) 'Owned subscription update uses correct gcloud labels flag'
Assert-True ($script:cloudCalls[2].Contains('modify-push-config') -and $script:cloudCalls[2].Contains('https://new-tunnel.trycloudflare.com')) 'Retarget only owned subscription after tunnel recreation'
$script:cloudCalls.Clear()
Assert-Rejected { Ensure-LocalSubscription 'test-project' 'peer' $names.RefundSubscription $names.RefundTopic $names 'https://new-tunnel.trycloudflare.com/api/credits/internal/order-events/open-refund' } 'Refuse foreign push subscription'
Assert-True ($script:cloudCalls.Count -eq 1) 'No foreign subscription mutations'
$parseTokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($setupPath, [ref]$parseTokens, [ref]$parseErrors)
Assert-True ($parseErrors.Count -eq 0) 'Setup is valid PowerShell 5.1 syntax'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$testEnvironment = @{
    LOCAL_PUBSUB_PROJECT_ID = 'test-project'; LOCAL_TEST_ID = 'vincent'
    # Config-only fixture path, NEVER used to start an application container.
    GOOGLE_APPLICATION_CREDENTIALS_HOST = $PSCommandPath
}
$savedEnvironment = @{}
foreach ($key in $testEnvironment.Keys) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $testEnvironment[$key], 'Process')
}
Push-Location $repoRoot
try {
    $rawConfig = & docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml config --format json
    if ($LASTEXITCODE -ne 0) { throw 'Compose config failed' }
    $config = ($rawConfig -join "`n") | ConvertFrom-Json
    $baseRaw = & docker compose -f compose.yaml -f compose.http-peers.yaml config --format json
    if ($LASTEXITCODE -ne 0) { throw 'Baseline Compose config failed' }
    $baseline = ($baseRaw -join "`n") | ConvertFrom-Json
    foreach ($unchanged in @('user-service','frontend','gateway','order-postgres','credit-postgres','mongodb','firebase-emulator')) {
        $before = $baseline.services.$unchanged | ConvertTo-Json -Depth 60 -Compress
        $after = $config.services.$unchanged | ConvertTo-Json -Depth 60 -Compress
        Assert-True ($before -ceq $after) "Preserve all $unchanged baseline configuration"
    }
    $order = $config.services.'order-service'.environment
    $credit = $config.services.'credit-service'.environment
    Assert-True ($order.ORDER_PEERS_MODE -eq 'http') 'Real Order peers'
    Assert-True ($order.SPRING_PROFILES_ACTIVE -eq 'prod' -and $order.ORDER_USER_SERVICE_MODE -eq 'http') 'Existing authenticated Order security'
    Assert-True ($credit.USER_SERVICE_MODE -eq 'http' -and $config.services.'supplier-service'.environment.USER_SERVICE_MODE -eq 'http') 'Real peer role lookup'
    Assert-True ($order.PUBSUB_PROJECT_ID -eq 'test-project' -and $credit.PUBSUB_PROJECT_ID -eq 'test-project') 'Same isolated project'
    Assert-True ($order.ORDER_OPEN_REFUND_TOPIC -eq $names.RefundTopic) 'Producer refund isolated'
    Assert-True ($credit.CREDIT_ORDER_OPEN_REFUND_SUBSCRIPTION -eq $names.RefundSubscription) 'Consumer subscription matches'
    Assert-True ($credit.CREDIT_PUBSUB_PUSH_SERVICE_ACCOUNT -eq $names.PushAccount -and $credit.CREDIT_PUBSUB_PUSH_AUDIENCE -eq $names.Audience) 'OIDC configuration matches provisioning'
    Assert-True ($order.ORDER_LIFECYCLE_CRON -eq '0 * * * * *' -and $order.ORDER_OUTBOX_RECOVERY_CRON -eq '0 */15 * * * *') 'Approved cadence'
    Assert-True ($order.SPRING_DATASOURCE_URL.StartsWith('jdbc:postgresql://order-postgres:5432/')) 'Order database stays local'
    Assert-True ($credit.SPRING_DATASOURCE_URL.StartsWith('jdbc:postgresql://credit-postgres:5432/')) 'Credit database stays local'
    foreach ($helper in @('credit-push-ingress','credit-push-tunnel')) {
        Assert-True (-not ($config.services.$helper.PSObject.Properties.Name -contains 'ports')) "No host ports on $helper"
    }
    Assert-True (-not ($config.services.PSObject.Properties.Name -contains 'pubsub-emulator')) 'No mock broker'
} finally {
    Pop-Location
    foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
}
Write-Host "PASS: $script:assertions local-live safety/config assertions; no cloud writes or app DB changes."

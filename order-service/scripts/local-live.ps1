# CHANGE-088 / ADR-029. PowerShell 5.1+, Docker Compose v2 and Google Cloud CLI.
# Never prints credentials; no keys, database resets or shared subscription edits.
[CmdletBinding()]
param([ValidateSet('Setup','Check','Pause')][string] $Action = 'Check')

# ADR-036: retained historical helper, disabled before any cloud/network action.
throw 'Cloud-local Setup/Check/Pause is retired. Use docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml up -d --build. Topics/subscriptions are initialized locally by pubsub-init; see order-service/docs/local-live-testing.md. No cloud resources changed.'

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LocalLiveNames([string] $ProjectId, [string] $DeveloperId) {
    if ($ProjectId -notmatch '^[a-z][a-z0-9-]{4,61}[a-z0-9]$') { throw 'Use a valid GCP project ID, not a project number/path.' }
    if ($DeveloperId -cnotmatch '^[a-z][a-z0-9-]{0,10}[a-z0-9]$' -or $DeveloperId -in @('main','staging','production','dev','prod')) {
        throw 'LOCAL_TEST_ID must be your unique 2-12 character lowercase developer namespace, not a shared environment.'
    }
    return [pscustomobject]@{
        RefundTopic = "open-order-refund-local-$DeveloperId-v1"
        CompletionTopic = "order-completion-local-$DeveloperId-v1"
        PenaltyTopic = "accepted-order-cancellation-local-$DeveloperId-v1"
        RefundSubscription = "credit-open-order-refund-local-$DeveloperId-v1"
        CompletionSubscription = "credit-order-completion-local-$DeveloperId-v1"
        DeadLetterTopic = "order-credit-dlq-local-$DeveloperId-v1"
        RecoverySubscription = "order-credit-dlq-recovery-local-$DeveloperId-v1"
        PushAccountId = "foc-local-$DeveloperId-push"
        PushAccount = "foc-local-$DeveloperId-push@$ProjectId.iam.gserviceaccount.com"
        Audience = "https://foc-local-$DeveloperId.invalid/credit-push"
    }
}

function Assert-LocalPushUrl([string] $BaseUrl) {
    $uri = $null
    if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or $uri.Host -notmatch '^[a-z0-9-]+\.trycloudflare\.com$' -or
        $uri.UserInfo -ne '' -or -not $uri.IsDefaultPort -or
        $uri.AbsolutePath -ne '/' -or $uri.Query -ne '' -or $uri.Fragment -ne '') {
        throw 'Expected only the HTTPS base URL of this Docker Quick Tunnel.'
    }
}

function Assert-ManagedResource($Resource, [string] $DeveloperId, [string] $ExpectedTopic = '') {
    $labelsProperty = $Resource.PSObject.Properties['labels']
    if ($null -eq $labelsProperty) { throw 'Refusing to alter an unlabeled cloud resource.' }
    $owner = $labelsProperty.Value.PSObject.Properties['foc-local-test']
    $component = $labelsProperty.Value.PSObject.Properties['foc-component']
    if ($null -eq $owner -or $owner.Value -ne $DeveloperId -or
        $null -eq $component -or $component.Value -ne 'order-credit') {
        throw 'Refusing to alter a resource not owned by this isolated developer test.'
    }
    if ($ExpectedTopic -ne '') {
        $topicProperty = $Resource.PSObject.Properties['topic']
        if ($null -eq $topicProperty -or $topicProperty.Value -ne $ExpectedTopic) {
            throw 'Refusing to retarget a subscription associated with another topic.'
        }
    }
}

function Invoke-Cloud([string[]] $Arguments, [switch] $AllowMissing) {
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& gcloud @Arguments --quiet 2>&1)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"
    if ($code -ne 0) {
        if ($AllowMissing -and $text -match '(NOT_FOUND|not found|does not exist)') { return $null }
        throw "gcloud failed (exit $code): $text"
    }
    return $text
}

function Invoke-Compose([string[]] $Arguments) {
    # Capture JSON privately: it may include database passwords. Never log it.
    $oldPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 converts even normal native stderr progress into
        # error records. Do not let Stop abort before inspecting the exit code.
        # Keep stderr separate from private stdout/config JSON.
        $ErrorActionPreference = 'Continue'
        $output = @(& docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml @Arguments 2>$null)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($code -ne 0) { throw "Docker Compose failed (exit $code); check .env and Docker Desktop." }
    return ($output -join "`n")
}

function Get-LocalLiveConfig {
    $config = (Invoke-Compose @('config','--format','json')) | ConvertFrom-Json
    $order = $config.services.'order-service'.environment
    $projectId = [string]$order.PUBSUB_PROJECT_ID
    $topic = [string]$order.ORDER_OPEN_REFUND_TOPIC
    if ($topic -notmatch '^open-order-refund-local-(.+)-v1$') { throw 'Order is not configured for isolated local-live topics.' }
    $developerId = $Matches[1]
    $names = Get-LocalLiveNames $projectId $developerId
    $credit = $config.services.'credit-service'.environment
    if ($order.ORDER_PEERS_MODE -ne 'http' -or $order.SPRING_PROFILES_ACTIVE -ne 'prod' -or
        $order.ORDER_USER_SERVICE_MODE -ne 'http' -or
        $order.ORDER_COMPLETION_TOPIC -ne $names.CompletionTopic -or
        $order.ORDER_ACCEPTED_CANCELLATION_TOPIC -ne $names.PenaltyTopic -or
        $credit.PUBSUB_PROJECT_ID -ne $projectId -or
        $credit.CREDIT_PUBSUB_PUSH_SERVICE_ACCOUNT -ne $names.PushAccount -or
        $credit.CREDIT_PUBSUB_PUSH_AUDIENCE -ne $names.Audience -or
        $credit.CREDIT_ORDER_COMPLETION_SUBSCRIPTION -ne $names.CompletionSubscription -or
        $credit.CREDIT_ORDER_OPEN_REFUND_SUBSCRIPTION -ne $names.RefundSubscription -or
        $credit.USER_SERVICE_MODE -ne 'http') { throw 'Local-live producer/consumer/authentication configuration does not match.' }
    $mount = @($config.services.'order-service'.volumes | Where-Object { $_.target -eq '/var/run/secrets/google/application_default_credentials.json' })
    if ($mount.Count -ne 1 -or -not $mount[0].read_only) { throw 'Personal ADC must be mounted read-only exactly once.' }
    return [pscustomobject]@{ ProjectId = $projectId; DeveloperId = $developerId; Names = $names; AdcPath = $mount[0].source }
}

function Ensure-LocalTopic([string] $ProjectId, [string] $DeveloperId, [string] $Name) {
    $existing = Invoke-Cloud @('pubsub','topics','describe',$Name,'--project',$ProjectId,'--format=json') -AllowMissing
    if ($existing) { Assert-ManagedResource ($existing | ConvertFrom-Json) $DeveloperId; return }
    [void](Invoke-Cloud @('pubsub','topics','create',$Name,'--project',$ProjectId,
        "--labels=foc-local-test=$DeveloperId,foc-component=order-credit",'--message-retention-duration=7d'))
}

function Get-OwnedSubscription([string] $ProjectId, [string] $DeveloperId, [string] $Name, [string] $Topic, [switch] $AllowMissing) {
    $existing = Invoke-Cloud @('pubsub','subscriptions','describe',$Name,'--project',$ProjectId,'--format=json') -AllowMissing:$AllowMissing
    if (-not $existing) { return $null }
    $resource = $existing | ConvertFrom-Json
    Assert-ManagedResource $resource $DeveloperId "projects/$ProjectId/topics/$Topic"
    return $resource
}

function Ensure-LocalSubscription([string] $ProjectId, [string] $DeveloperId, [string] $Name,
    [string] $Topic, $Names, [string] $PushEndpoint = '') {
    $existing = Get-OwnedSubscription $ProjectId $DeveloperId $Name $Topic -AllowMissing
    $operation = 'create'
    if ($null -ne $existing) { $operation = 'update' }
    $labelsFlag = '--labels'
    if ($operation -eq 'update') { $labelsFlag = '--update-labels' }
    $arguments = @('pubsub','subscriptions',$operation,$Name,'--project',$ProjectId,
        "$labelsFlag=foc-local-test=$DeveloperId,foc-component=order-credit",'--ack-deadline=30',
        '--message-retention-duration=7d','--expiration-period=14d')
    if ($operation -eq 'create') { $arguments += @('--topic',$Topic) }
    if ($PushEndpoint -ne '') {
        $arguments += @('--min-retry-delay=10s','--max-retry-delay=600s',
            '--dead-letter-topic',"projects/$ProjectId/topics/$($Names.DeadLetterTopic)",'--max-delivery-attempts=10')
        if ($operation -eq 'create') {
            $arguments += @('--push-endpoint',$PushEndpoint,'--push-auth-service-account',$Names.PushAccount,'--push-auth-token-audience',$Names.Audience)
        }
    } elseif ($null -ne $existing -and $existing.PSObject.Properties['pushConfig'] -and
        $existing.pushConfig.PSObject.Properties['pushEndpoint']) {
        throw 'DLQ recovery subscription must stay pull-only; refusing existing push configuration.'
    }
    [void](Invoke-Cloud $arguments)
    if ($operation -eq 'update' -and $PushEndpoint -ne '') {
        [void](Invoke-Cloud @('pubsub','subscriptions','modify-push-config',$Name,'--project',$ProjectId,
            '--push-endpoint',$PushEndpoint,'--push-auth-service-account',$Names.PushAccount,'--push-auth-token-audience',$Names.Audience))
    }
}

function Get-LocalTunnelUrl {
    $id = (Invoke-Compose @('ps','-q','credit-push-tunnel')).Trim()
    if ($id -notmatch '^[a-f0-9]{12,64}$') { throw 'Tunnel is not running; run Setup or the local-live Compose up command.' }
    $oldPreference = $ErrorActionPreference
    try {
        # cloudflared writes normal logs to stderr; PS 5.1 must not treat them
        # as terminating NativeCommandError records when redirecting them.
        $ErrorActionPreference = 'Continue'
        $logs = @(& docker logs $id 2>&1) | ForEach-Object { $_.ToString() }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($code -ne 0) { throw 'Cannot read local tunnel logs.' }
    $matches = [regex]::Matches(($logs -join "`n"), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($matches.Count -eq 0) { return $null }
    $baseUrl = $matches[$matches.Count - 1].Value
    Assert-LocalPushUrl $baseUrl
    return $baseUrl
}

function Get-HttpStatus([string] $Url, [string] $Method) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
        return [int]$response.StatusCode
    } catch {
        if ($null -ne $_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        throw
    }
}

function Invoke-LocalLive {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install/start Docker Desktop first.' }
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'Install Google Cloud CLI and run gcloud auth login plus gcloud auth application-default login first. No cloud resources changed.' }
    $settings = Get-LocalLiveConfig
    $projectId = $settings.ProjectId
    $developerId = $settings.DeveloperId
    $names = $settings.Names
    if ($Action -eq 'Pause') {
        foreach ($pair in @(@($names.RefundSubscription,$names.RefundTopic),@($names.CompletionSubscription,$names.CompletionTopic))) {
            $existing = Get-OwnedSubscription $projectId $developerId $pair[0] $pair[1] -AllowMissing
            if ($null -ne $existing) {
                [void](Invoke-Cloud @('pubsub','subscriptions','modify-push-config',$pair[0],'--project',$projectId,'--push-endpoint='))
            }
        }
        Write-Host 'Owned test push subscriptions paused (pull/backlog retained). Docker/cloud data NOT deleted.'
        return
    }
    if (-not (Test-Path -LiteralPath $settings.AdcPath -PathType Leaf) -or (Get-Item -LiteralPath $settings.AdcPath).Length -eq 0) {
        throw 'ADC file is missing/empty. Run gcloud auth application-default login, then set GOOGLE_APPLICATION_CREDENTIALS_HOST in ignored .env.'
    }
    $account = (Invoke-Cloud @('auth','list','--filter=status:ACTIVE','--format=value(account)')).Trim()
    if ($account -notmatch '^[^\s@]+@[^\s@]+$' -or $account.EndsWith('.gserviceaccount.com')) {
        throw 'Use your personal Google account for CLI/ADC; do not share service-account keys.'
    }
    if ($Action -eq 'Setup') {
        [void](Invoke-Compose @('up','-d','--no-deps','--no-recreate','credit-push-ingress','credit-push-tunnel'))
        $baseUrl = $null
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $baseUrl = Get-LocalTunnelUrl
            if ($baseUrl) { break }
            Start-Sleep -Seconds 2
        }
        if (-not $baseUrl) { throw 'No tunnel URL after 60s. Inspect docker compose logs credit-push-tunnel; no push resources configured.' }
        [void](Invoke-Cloud @('services','enable','pubsub.googleapis.com','--project',$projectId))
        $projectNumber = (Invoke-Cloud @('projects','describe',$projectId,'--format=value(projectNumber)')).Trim()
        if ($projectNumber -notmatch '^\d+$') { throw 'Cannot resolve project number.' }
        $serviceAgent = "service-$projectNumber@gcp-sa-pubsub.iam.gserviceaccount.com"
        foreach ($topic in @($names.RefundTopic,$names.CompletionTopic,$names.PenaltyTopic,$names.DeadLetterTopic)) {
            Ensure-LocalTopic $projectId $developerId $topic
        }
        $sa = Invoke-Cloud @('iam','service-accounts','describe',$names.PushAccount,'--project',$projectId,'--format=json') -AllowMissing
        $displayName = "FoC local Order/Credit push ($developerId)"
        if ($sa) {
            if (($sa | ConvertFrom-Json).displayName -ne $displayName) { throw 'Push SA name is occupied by another owner; no identity changes made.' }
        } else {
            [void](Invoke-Cloud @('iam','service-accounts','create',$names.PushAccountId,'--project',$projectId,'--display-name',$displayName))
        }
        foreach ($binding in @(@("serviceAccount:$serviceAgent",'roles/iam.serviceAccountTokenCreator'),@("user:$account",'roles/iam.serviceAccountUser'))) {
            [void](Invoke-Cloud @('iam','service-accounts','add-iam-policy-binding',$names.PushAccount,'--project',$projectId,'--member',$binding[0],'--role',$binding[1]))
        }
        foreach ($topic in @($names.RefundTopic,$names.CompletionTopic,$names.PenaltyTopic)) {
            [void](Invoke-Cloud @('pubsub','topics','add-iam-policy-binding',$topic,'--project',$projectId,'--member',"user:$account",'--role=roles/pubsub.publisher'))
        }
        [void](Invoke-Cloud @('pubsub','topics','add-iam-policy-binding',$names.DeadLetterTopic,'--project',$projectId,'--member',"serviceAccount:$serviceAgent",'--role=roles/pubsub.publisher'))
        Ensure-LocalSubscription $projectId $developerId $names.RecoverySubscription $names.DeadLetterTopic $names
        foreach ($pair in @(
            @($names.RefundSubscription,$names.RefundTopic,'open-refund'),
            @($names.CompletionSubscription,$names.CompletionTopic,'completion'))) {
            $pushEndpoint = "$baseUrl/api/credits/internal/order-events/$($pair[2])"
            Ensure-LocalSubscription $projectId $developerId $pair[0] $pair[1] $names $pushEndpoint
            [void](Invoke-Cloud @('pubsub','subscriptions','add-iam-policy-binding',$pair[0],'--project',$projectId,'--member',"serviceAccount:$serviceAgent",'--role=roles/pubsub.subscriber'))
        }
        Write-Host "SETUP: isolated refund/completion push -> $baseUrl/api/credits/internal/order-events/<type>"
        Write-Host 'Start/build the local-live application stack, then run -Action Check before UI testing.'
        Write-Host 'No Credit subscription created for accepted-cancellation (User penalty only).'
        return
    }
    $baseUrl = Get-LocalTunnelUrl
    if (-not $baseUrl) { throw 'Tunnel has no HTTPS URL.' }
    foreach ($topic in @($names.RefundTopic,$names.CompletionTopic,$names.PenaltyTopic,$names.DeadLetterTopic)) {
        $resource = Invoke-Cloud @('pubsub','topics','describe',$topic,'--project',$projectId,'--format=json')
        Assert-ManagedResource ($resource | ConvertFrom-Json) $developerId
    }
    [void](Get-OwnedSubscription $projectId $developerId $names.RecoverySubscription $names.DeadLetterTopic)
    foreach ($pair in @(
        @($names.RefundSubscription,$names.RefundTopic,'open-refund'),
        @($names.CompletionSubscription,$names.CompletionTopic,'completion'))) {
        $sub = Get-OwnedSubscription $projectId $developerId $pair[0] $pair[1]
        if ($sub.pushConfig.pushEndpoint -ne "$baseUrl/api/credits/internal/order-events/$($pair[2])" -or
            $sub.pushConfig.oidcToken.serviceAccountEmail -ne $names.PushAccount -or
            $sub.pushConfig.oidcToken.audience -ne $names.Audience -or
            $sub.deadLetterPolicy.deadLetterTopic -ne "projects/$projectId/topics/$($names.DeadLetterTopic)") {
            throw 'Subscription endpoint/authentication/DLQ mismatch. Rerun Setup after tunnel recreation.'
        }
    }
    foreach ($eventPath in @('open-refund','completion')) {
        if ((Get-HttpStatus "$baseUrl/api/credits/internal/order-events/$eventPath" 'POST') -ne 401) { throw 'Expected Credit to reject unauthenticated push with 401; do not test with auth bypass.' }
        if ((Get-HttpStatus "$baseUrl/api/credits/internal/order-events/$eventPath" 'GET') -ne 405) { throw 'Tunnel should reject non-POST event requests.' }
    }
    if ((Get-HttpStatus "$baseUrl/api/credits/me" 'GET') -ne 404) { throw 'Tunnel unexpectedly exposes general Credit API.' }
    Write-Host 'CHECK PASS: owned cloud push configuration matches tunnel; Credit rejects unauthenticated delivery; other routes/methods blocked.'
    Write-Host 'This is NOT financial verification. Test local UI workflows and confirm local Credit ledger/balances and event IDs.'
}

# Dot-source for deterministic tests without cloud/container side effects.
if ($MyInvocation.InvocationName -ne '.') {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    Push-Location $repoRoot
    try { Invoke-LocalLive } finally { Pop-Location }
}

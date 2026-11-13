#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile = 'foc-local', [switch] $KeepResources)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Common.ps1"
$runId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$testNamespace = "foc-kafka-smoke-$runId"
Initialize-KafkaTools $Profile $testNamespace
$portForward = $null
$http = $null
$temporaryLogs = @()
try {
    Send-KafkaDocument @{ apiVersion = 'v1'; kind = 'Namespace'; metadata = @{
        name = $testNamespace; labels = @{ 'foc/kafka-smoke-owner' = $runId }
    }} -Arguments @('create', '-f', '-')
    & "$PSScriptRoot/Apply-LocalKafka.ps1" -Profile $Profile -Namespace $testNamespace
    $brokerUid = (Invoke-KafkaKubectl @('get', 'pod', 'kafka-0', '-o', 'jsonpath={.metadata.uid}')) -join ''
    # Applying twice must preserve Secrets/storage and safely rerun the topic/ACL Job.
    & "$PSScriptRoot/Apply-LocalKafka.ps1" -Profile $Profile -Namespace $testNamespace
    $uidAfterApply = (Invoke-KafkaKubectl @('get', 'pod', 'kafka-0', '-o', 'jsonpath={.metadata.uid}')) -join ''
    if ($brokerUid -ne $uidAfterApply) { throw 'An unchanged second apply unexpectedly replaced the broker pod.' }
    $claimUid = (Invoke-KafkaKubectl @('get', 'pvc', 'data-kafka-0', '-o', 'jsonpath={.metadata.uid}')) -join ''

    # The broker/service flow must not depend on the optional browser UI.
    Invoke-KafkaKubectl @('scale', 'deployment/kafka-ui', '--replicas=0')
    Invoke-KafkaKubectl @('exec', 'kafka-0', '--', 'env', 'KAFKA_HEAP_OPTS=-Xms32m -Xmx128m',
        'KAFKA_VERIFY_CONSUMER_TIMEOUT_SECONDS=60', 'KAFKA_VERIFY_DENIAL_TIMEOUT_SECONDS=60',
        'bash', '/opt/foc-kafka/verify.sh')
    $eventId = (Invoke-KafkaKubectl @('exec', 'kafka-0', '--', 'cat', '/tmp/foc-kafka-verification/event-id') -join '').Trim()
    if ($eventId -notmatch '^[0-9a-f-]{36}$') { throw 'The isolated test did not record a valid event identity.' }
    Invoke-KafkaKubectl @('scale', 'deployment/kafka-ui', '--replicas=1')
    Invoke-KafkaKubectl @('rollout', 'status', 'deployment/kafka-ui', '--timeout=600s')

    $portReservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $portReservation.Start()
    $localPort = $portReservation.LocalEndpoint.Port
    $portReservation.Stop()
    $stdout = [IO.Path]::GetTempFileName()
    $stderr = [IO.Path]::GetTempFileName()
    $temporaryLogs = @($stdout, $stderr)
    $portForward = Start-Process -FilePath $script:KafkaMinikube -ArgumentList @('-p', $Profile,
        'kubectl', '--', "--context=$Profile", '-n', $testNamespace, 'port-forward',
        'service/kafka-ui', "${localPort}:8080", '--address=127.0.0.1') `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.CookieContainer = [Net.CookieContainer]::new()
    $http = [Net.Http.HttpClient]::new($handler)
    $http.Timeout = [TimeSpan]::FromSeconds(10)
    $origin = "http://127.0.0.1:$localPort"
    $loginPage = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = $http.GetAsync("$origin/login").GetAwaiter().GetResult()
            if ([int]$response.StatusCode -eq 200) {
                $loginPage = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                break
            }
        } catch { if ($portForward.HasExited) { throw 'UI port-forward exited before becoming available.' } }
        Start-Sleep -Seconds 2
    }
    if (-not $loginPage) { throw 'The UI login page did not become available.' }
    $unauthenticated = $http.GetAsync("$origin/api/clusters").GetAwaiter().GetResult()
    if ([int]$unauthenticated.StatusCode -notin @(302, 401, 403)) { throw 'UI API was not protected by login.' }
    $uiSecret = Read-KafkaSecret 'kafka-ui-secrets'
    $form = [Collections.Generic.Dictionary[string,string]]::new()
    $form['username'] = ConvertFrom-KafkaSecretValue $uiSecret.data.SPRING_SECURITY_USER_NAME
    $form['password'] = ConvertFrom-KafkaSecretValue $uiSecret.data.SPRING_SECURITY_USER_PASSWORD
    $csrf = [regex]::Match($loginPage, 'name="_csrf"[^>]*value="([^"]+)"')
    if ($csrf.Success) { $form['_csrf'] = $csrf.Groups[1].Value }
    $formBody = [Net.Http.FormUrlEncodedContent]::new($form)
    $loginResult = $http.PostAsync("$origin/login", $formBody).GetAwaiter().GetResult()
    if ([int]$loginResult.StatusCode -ne 302 -or "$($loginResult.Headers.Location)" -match 'error') {
        throw 'UI login failed. Credentials were not printed.'
    }
    $formBody.Dispose(); $form.Clear(); $uiSecret = $null
    $clustersResult = $http.GetAsync("$origin/api/clusters").GetAwaiter().GetResult()
    $clustersJson = $clustersResult.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ([int]$clustersResult.StatusCode -ne 200 -or $clustersJson -notmatch '"readOnly"\s*:\s*true') {
        throw 'The authenticated UI did not report a read-only cluster.'
    }
    $topics = $http.GetAsync("$origin/api/clusters/foc-local/topics").GetAwaiter().GetResult()
    $topicsJson = $topics.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ([int]$topics.StatusCode -ne 200 -or $topicsJson -notmatch 'user.events') { throw 'UI could not list broker topics.' }
    Write-Host 'UI login, authenticated topic access and read-only cluster checks passed.'

    # Replace only the disposable broker pod; prove records, ACLs, cluster ID and the PVC survive.
    Invoke-KafkaKubectl @('delete', 'pod', 'kafka-0', '--wait=true', '--timeout=180s')
    Invoke-KafkaKubectl @('rollout', 'status', 'statefulset/kafka', '--timeout=600s')
    $newClaimUid = (Invoke-KafkaKubectl @('get', 'pvc', 'data-kafka-0', '-o', 'jsonpath={.metadata.uid}')) -join ''
    if ($claimUid -ne $newClaimUid) { throw 'Broker replacement did not reuse the original PVC.' }
    $eventId | & $script:KafkaMinikube -p $Profile kubectl -- "--context=$Profile" -n $testNamespace `
        exec -i kafka-0 -- bash -c 'mkdir -p /tmp/foc-kafka-verification; tr -d "\r\n" > /tmp/foc-kafka-verification/event-id'
    if ($LASTEXITCODE -ne 0) { throw 'Could not restore the test identity (not broker data) for the persistence assertion.' }
    Invoke-KafkaKubectl @('exec', 'kafka-0', '--', 'env', 'KAFKA_HEAP_OPTS=-Xms32m -Xmx128m',
        'KAFKA_VERIFY_CONSUMER_TIMEOUT_SECONDS=60', 'KAFKA_VERIFY_DENIAL_TIMEOUT_SECONDS=60',
        'bash', '/opt/foc-kafka/verify.sh', 'after-restart')
    Write-Host 'PASS: Kubernetes initialization, service/UI ACLs, UI-independent delivery, login and persisted broker records.'
} finally {
    if ($http) { $http.Dispose() }
    if ($portForward) { if (-not $portForward.HasExited) { $portForward.Kill($true); $portForward.WaitForExit(5000) | Out-Null }; $portForward.Dispose() }
    foreach ($log in $temporaryLogs) { Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue }
    if ($KeepResources) { Write-Host "Retained disposable namespace $testNamespace for diagnosis." }
    else {
        $owner = (Invoke-KafkaKubectl @('get', 'namespace', $testNamespace, '--ignore-not-found', '-o', 'jsonpath={.metadata.labels.foc/kafka-smoke-owner}')) -join ''
        if ($owner -eq $runId -and $testNamespace -eq "foc-kafka-smoke-$runId") {
            Invoke-KafkaKubectl @('delete', 'namespace', $testNamespace, '--wait=false')
            Write-Host 'Removed only the disposable smoke namespace and its test storage. foc-local application data was untouched.'
        } else { Write-Warning "Cleanup refused: could not confirm ownership of $testNamespace." }
    }
}

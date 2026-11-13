#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('gateway', 'supplier', 'credit', 'order', 'admin', 'chat', 'notification')]
    [string] $Service,
    [string] $Profile = 'foc-local',
    [switch] $CheckDatabaseRestart
)

$ErrorActionPreference = 'Stop'
$command = Get-Command minikube -ErrorAction SilentlyContinue
$minikube = if ($command) { $command.Source } else {
    Join-Path $env:ProgramFiles 'Kubernetes/Minikube/minikube.exe'
}
function Invoke-Kubectl {
    param([string[]] $Arguments)
    $result = & $minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Kubernetes check failed: $($Arguments -join ' ')" }
    return $result
}
function Assert-Http {
    param([string] $Url, [int] $Expected, [switch] $InvalidToken,
        [ValidateSet('GET','POST')][string] $Method = 'GET')
    # Gateway is the authorized caller of backends under NetworkPolicies. Its JRE image
    # has bash/coreutils, so no diagnostic container or cross-service exception is needed.
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'http') { throw 'This local smoke helper expects HTTP endpoints.' }
    $target = if ($uri.Host -eq 'gateway') { '127.0.0.1' } else { $uri.Host }
    $request = "$Method $($uri.PathAndQuery) HTTP/1.1`r`nHost: $($uri.Authority)`r`nConnection: close`r`n"
    if ($Method -eq 'POST') { $request += "Content-Length: 0`r`n" }
    if ($InvalidToken) { $request += "Authorization: Bearer invalid-token`r`n" }
    $request += "`r`n"
    $status = ''
    $attempts = if ($Expected -eq 200) { 13 } else { 1 }
    for ($attempt = 0; $attempt -lt $attempts; $attempt++) {
        $line = $request | & $minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local `
            exec -i deployment/gateway -- timeout 20 bash -c `
            'exec 3<>/dev/tcp/"$1"/"$2"; cat >&3; IFS= read -r response <&3; printf "%s" "$response"' bash $target "$($uri.Port)"
        if ($LASTEXITCODE -eq 0 -and ($line -join '') -match '^HTTP/\S+\s+(\d{3})') { $status = $Matches[1] }
        if ($status -eq "$Expected") { break }
        if ($attempt + 1 -lt $attempts) { Start-Sleep -Seconds 2 }
    }
    if ("$status" -ne "$Expected") { throw "$Url expected $Expected, received $status" }
    Write-Host "PASS $Expected $Url"
}

$deployment = if ($Service -eq 'gateway') { 'gateway' } else { "$Service-service" }
Invoke-Kubectl @('rollout', 'status', "deployment/$deployment", '--timeout=300s')
$port = @{ gateway = 8088; supplier = 8080; credit = 8083; order = 8082; admin = 8084; chat = 8085; notification = 8086 }[$Service]
$base = "http://${deployment}:$port"
Assert-Http "$base/actuator/health" 200
if ($Service -eq 'gateway') {
    Assert-Http "$base/" 200
    Assert-Http "$base/.well-known/jwks.json" 200
    Assert-Http "$base/api/users/me" 401
    Assert-Http "$base/not-a-configured-route" 404
    return
}
Assert-Http "$base/v3/api-docs" 200
switch ($Service) {
    admin {
        Assert-Http "$base/admin" 200
        Assert-Http "$base/api/admin/cases" 401
        Assert-Http "$base/api/admin/cases" 401 -InvalidToken
        Assert-Http 'http://gateway:8088/admin' 200
        Assert-Http 'http://gateway:8088/api/admin/cases' 401
        Assert-Http 'http://gateway:8088/internal/admin/cases/00000000-0000-0000-0000-000000000001/access' 404
    }
    supplier {
        Assert-Http "$base/suppliers" 200
        Assert-Http "$base/api/suppliers" 200
        Assert-Http "$base/api/admin/suppliers" 401
        Assert-Http "$base/api/admin/suppliers" 401 -InvalidToken
        Assert-Http 'http://gateway:8088/suppliers' 200
        Assert-Http 'http://gateway:8088/api/suppliers' 200
    }
    credit {
        Assert-Http "$base/credits" 200
        Assert-Http "$base/api/credits/me" 401
        Assert-Http "$base/api/credits/me" 401 -InvalidToken
        Assert-Http 'http://gateway:8088/credits' 200
        Assert-Http 'http://gateway:8088/api/credits/me' 401
    }
    order {
        Assert-Http "$base/api/orders" 401 -InvalidToken
        # An unauthenticated creation must fail before input validation or mutation.
        Assert-Http "$base/api/orders" 401 -Method POST
        Assert-Http 'http://gateway:8088/docs/order/openapi.json' 200
        Assert-Http 'http://gateway:8088/api/orders' 401 -Method POST
    }
    notification {
        Assert-Http "$base/notifications" 200
        Assert-Http 'http://gateway:8088/notifications' 200
        Assert-Http "$base/api/notifications/me" 401
        Assert-Http "$base/api/notifications/me" 401 -InvalidToken
        Assert-Http "$base/api/notifications/me/unread-count" 401
        Assert-Http 'http://gateway:8088/api/notifications/me' 401
        Assert-Http 'http://gateway:8088/docs/notification/openapi.json' 200
    }
    chat {
        Assert-Http "$base/api/chat/preferences" 401
        Assert-Http "$base/api/chat/preferences" 401 -InvalidToken
        Assert-Http 'http://gateway:8088/api/chat/preferences' 401
        Invoke-Kubectl @('rollout', 'status', 'statefulset/rabbitmq', '--timeout=180s')
    }
}

$database = "$Service-db"
Invoke-Kubectl @('rollout', 'status', "statefulset/$database", '--timeout=180s')
$query = "select count(*) from flyway_schema_history where success;"
$sqlArgs = @('exec', "$database-0", '--', 'psql', '-U', "${Service}_user",
    '-d', "${Service}_db", '-tAc', $query)
$before = Invoke-Kubectl $sqlArgs
if ([int] "$before" -lt 1) { throw 'No successful database migrations found.' }
$claim = "data-$database-0"
$uid = Invoke-Kubectl @('get', 'pvc', $claim, '-o', 'jsonpath={.metadata.uid}')
Write-Host "PASS database migrations: $before; persistent claim: $claim"
if ($CheckDatabaseRestart) {
    # Replace only the database pod, never its StatefulSet, claim, Secret or namespace.
    Invoke-Kubectl @('delete', 'pod', "$database-0", '--wait=true')
    Invoke-Kubectl @('rollout', 'status', "statefulset/$database", '--timeout=180s')
    $after = Invoke-Kubectl $sqlArgs
    $afterUid = Invoke-Kubectl @('get', 'pvc', $claim, '-o', 'jsonpath={.metadata.uid}')
    if ("$before" -ne "$after" -or "$uid" -ne "$afterUid") {
        throw 'Database restart did not preserve the migration records and claim identity.'
    }
    Assert-Http "$base/actuator/health" 200
    Write-Host 'PASS database pod replacement retained migrations and the same persistent claim'
}

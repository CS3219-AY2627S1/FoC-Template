#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('supplier', 'credit', 'order', 'notification')]
    [string] $Service,
    [string] $Profile = 'foc-local'
)

$ErrorActionPreference = 'Stop'
$command = Get-Command minikube -ErrorAction SilentlyContinue
$minikube = if ($command) { $command.Source } else {
    Join-Path $env:ProgramFiles 'Kubernetes/Minikube/minikube.exe'
}
if (-not (Test-Path -LiteralPath $minikube)) {
    throw 'Install Minikube or add it to PATH before running this script.'
}

$name = "$Service-service-secrets"
$existing = & $minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local `
    get secret $name --ignore-not-found -o name
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the selected local cluster.' }
if ($existing) {
    Write-Host "$name already exists; its database password was preserved."
    return
}

$claim = & $minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local `
    get pvc "data-$Service-db-0" --ignore-not-found -o name
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing database storage.' }
if ($claim) {
    throw 'Database storage exists without its Secret. Recover the original password; do not generate a replacement.'
}

# Generate only this service's password; never print or save a Secret manifest.
$password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$secret = @{
    apiVersion = 'v1'
    kind = 'Secret'
    metadata = @{ name = $name; namespace = 'foc-local' }
    type = 'Opaque'
    stringData = @{ DB_PASSWORD = $password }
} | ConvertTo-Json -Depth 5 -Compress
try {
    $secret | & $minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local create -f -
    if ($LASTEXITCODE -ne 0) { throw 'Secret creation failed; no existing password was overwritten.' }
} finally {
    $secret = $null
    $password = $null
}

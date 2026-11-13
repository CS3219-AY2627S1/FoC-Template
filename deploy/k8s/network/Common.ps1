#Requires -Version 7.2
function Initialize-NetTools([string] $Profile) {
    $script:NetProfile = $Profile
    $command = Get-Command minikube -ErrorAction SilentlyContinue
    $script:NetMinikube = if ($command) { $command.Source } else {
        Join-Path $env:ProgramFiles 'Kubernetes/Minikube/minikube.exe'
    }
    if (-not (Test-Path -LiteralPath $script:NetMinikube)) { throw 'Minikube is required.' }
}
function Invoke-NetKubectl([string[]] $Arguments) {
    $result = & $script:NetMinikube -p $script:NetProfile kubectl -- "--context=$script:NetProfile" @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Network-policy kubectl operation failed: $($Arguments[0])" }
    $result
}
function Send-NetDocument($Document, [string[]] $Arguments = @('apply', '-f', '-')) {
    $json = $Document | ConvertTo-Json -Depth 40 -Compress
    $result = $json | & $script:NetMinikube -p $script:NetProfile kubectl -- "--context=$script:NetProfile" @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Could not submit network-policy resource.' }
    $result
}
function Get-NetPolicies([string] $Namespace) {
    $items = @()
    $source=(Get-Content "$PSScriptRoot/policies.yaml" -Raw)+"`n---`n"+
        (Get-Content "$PSScriptRoot/../../../admin-service/k8s/network.yaml" -Raw)+"`n---`n"+
        (Get-Content "$PSScriptRoot/../../../chat-service/k8s/network.yaml" -Raw)+"`n---`n"+
        (Get-Content "$PSScriptRoot/../../../notification-service/k8s/network.yaml" -Raw)
    foreach ($yaml in ($source -split '(?m)^---[ \t]*\r?$')) {
        $raw = $yaml | & $script:NetMinikube -p $script:NetProfile kubectl -- "--context=$script:NetProfile" create --dry-run=client -f - -o json
        if ($LASTEXITCODE -ne 0) { throw 'Policy client validation failed.' }
        $item = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
        $item.metadata.namespace = $Namespace
        $items += $item
    }
    @{ apiVersion = 'v1'; kind = 'List'; items = $items }
}

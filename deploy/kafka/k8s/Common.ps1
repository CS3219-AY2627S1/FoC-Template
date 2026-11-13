# Shared only by the local Kafka helpers; never changes the active kubeconfig context.
function Initialize-KafkaTools {
    param([string] $Profile, [string] $Namespace)
    $script:KafkaProfile = $Profile
    $script:KafkaNamespace = $Namespace
    $command = Get-Command minikube -ErrorAction SilentlyContinue
    $script:KafkaMinikube = if ($command) { $command.Source } else {
        Join-Path $env:ProgramFiles 'Kubernetes/Minikube/minikube.exe'
    }
    if (-not (Test-Path -LiteralPath $script:KafkaMinikube)) { throw 'Install Minikube or add it to PATH.' }
}

function Invoke-KafkaKubectl {
    param([string[]] $Arguments)
    $result = & $script:KafkaMinikube -p $script:KafkaProfile kubectl -- "--context=$script:KafkaProfile" `
        -n $script:KafkaNamespace @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Kafka kubectl operation failed: $($Arguments[0]). No credentials are printed by this helper." }
    $result
}

function Send-KafkaDocument {
    param([object] $Document, [string[]] $Arguments = @('apply', '-f', '-'))
    $documentJson = $Document | ConvertTo-Json -Depth 40 -Compress
    try {
        # Secrets use create, not apply: do not duplicate their data in a last-applied annotation.
        $result = $documentJson | & $script:KafkaMinikube -p $script:KafkaProfile kubectl -- `
            "--context=$script:KafkaProfile" -n $script:KafkaNamespace @Arguments
        if ($LASTEXITCODE -ne 0) { throw 'Could not submit Kafka resource. Secret values were not printed by this helper.' }
        $result
    } finally { $documentJson = $null }
}

function Read-KafkaSecret {
    param([string] $Name)
    $raw = Invoke-KafkaKubectl @('get', 'secret', $Name, '--ignore-not-found', '-o', 'json')
    if (-not $raw) { return $null }
    ($raw -join "`n") | ConvertFrom-Json -AsHashtable
}

function ConvertFrom-KafkaSecretValue {
    param([string] $Value)
    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function Ensure-KafkaSecret {
    param([string] $Name, [hashtable] $Values)
    $existing = Read-KafkaSecret $Name
    if ($existing) {
        foreach ($key in $Values.Keys) {
            if (-not $existing.data.ContainsKey($key) -or
                (ConvertFrom-KafkaSecretValue $existing.data[$key]) -cne $Values[$key]) {
                throw "Secret $Name does not match the broker credentials. Recover matching values; automatic rotation is not supported."
            }
        }
        Write-Host "Preserved $Name."
        return
    }
    Send-KafkaDocument -Document @{
        apiVersion = 'v1'; kind = 'Secret'; type = 'Opaque'
        metadata = @{ name = $Name; namespace = $script:KafkaNamespace }
        stringData = $Values
    } -Arguments @('create', '-f', '-')
}

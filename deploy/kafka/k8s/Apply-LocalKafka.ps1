#Requires -Version 7.2
[CmdletBinding()]
param(
    [string] $Profile = 'foc-local',
    [ValidatePattern('^foc-[a-z0-9-]+$')][string] $Namespace = 'foc-local',
    [switch] $InitializeOnly
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Common.ps1"
Initialize-KafkaTools $Profile $Namespace
$existingNamespace = Invoke-KafkaKubectl @('get', 'namespace', $Namespace, '--ignore-not-found', '-o', 'name')
if (-not $existingNamespace) {
    if($InitializeOnly){throw 'InitializeOnly requires an existing namespace/broker.'}
    Send-KafkaDocument @{ apiVersion = 'v1'; kind = 'Namespace'; metadata = @{
        name = $Namespace; labels = @{ 'app.kubernetes.io/part-of' = 'friend-on-campus' }
    }} -Arguments @('create', '-f', '-')
}
if(-not $InitializeOnly){& "$PSScriptRoot/New-KafkaSecrets.ps1" -Profile $Profile -Namespace $Namespace}

$scripts = [ordered]@{}
foreach ($name in @('lib.sh', 'broker-entrypoint.sh', 'healthcheck.sh', 'initialize.sh', 'verify.sh')) {
    # ConfigMap data is LF-normalized even if a Windows checkout predates .gitattributes.
    $scripts[$name] = (Get-Content -LiteralPath "$PSScriptRoot/../$name" -Raw).Replace("`r`n", "`n")
}
$scripts['probe.sh'] = (Get-Content -LiteralPath "$PSScriptRoot/probe.sh" -Raw).Replace("`r`n", "`n")
if($InitializeOnly){
    $current=(Invoke-KafkaKubectl @('get','configmap','kafka-scripts','-o','json') -join "`n")|ConvertFrom-Json -AsHashtable
    foreach($name in $scripts.Keys){
        if($name -ne 'initialize.sh' -and $current.data[$name] -cne $scripts[$name]){throw "Runtime script $name differs; InitializeOnly cannot change broker runtime configuration."}
    }
    $ready=(Invoke-KafkaKubectl @('get','statefulset','kafka','-o','jsonpath={.status.readyReplicas}') -join '').Trim()
    if($ready -ne '1'){throw 'InitializeOnly requires the existing one-broker deployment to be ready.'}
    $patch=@{metadata=@{resourceVersion=$current.metadata.resourceVersion};data=@{'initialize.sh'=$scripts['initialize.sh']}}|ConvertTo-Json -Depth 5 -Compress
    Invoke-KafkaKubectl @('patch','configmap','kafka-scripts','--type=merge','--patch',$patch)
}else{
Send-KafkaDocument @{ apiVersion = 'v1'; kind = 'ConfigMap'; metadata = @{
    name = 'kafka-scripts'; namespace = $Namespace
}; data = $scripts }
$cli = [ordered]@{}
$cliSource = (Get-Content -LiteralPath "$PSScriptRoot/cli.sh" -Raw).Replace("`r`n", "`n")
foreach ($name in @('kafka-topics.sh', 'kafka-configs.sh', 'kafka-acls.sh', 'kafka-broker-api-versions.sh',
        'kafka-console-producer.sh', 'kafka-console-consumer.sh', 'kafka-get-offsets.sh')) {
    $cli[$name] = $cliSource
}
Send-KafkaDocument @{ apiVersion = 'v1'; kind = 'ConfigMap'; metadata = @{
    name = 'kafka-cli'; namespace = $Namespace
}; data = $cli }
# Include the broker Secret version without printing or persisting its credential values. A new or
# rotated client identity must restart Kafka so broker-entrypoint regenerates its JAAS file.
$brokerSecret = Read-KafkaSecret 'kafka-broker-secrets'
if (-not $brokerSecret) { throw 'kafka-broker-secrets was not created.' }
# Put the checksum into the first apply too, avoiding two broker starts on fresh installation.
$configText = (Get-Content "$PSScriptRoot/broker.yaml" -Raw) + ($scripts | ConvertTo-Json -Compress) +
    $cliSource + $brokerSecret.metadata.resourceVersion
$checksum = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($configText))).ToLowerInvariant()
$brokerSecret = $null
$items = @()
# kubectl create emits separate JSON objects for multi-document YAML, not one JSON List.
foreach ($yamlDocument in ((Get-Content "$PSScriptRoot/broker.yaml" -Raw) -split '(?m)^---[ \t]*\r?$')) {
    $raw = $yamlDocument | & $script:KafkaMinikube -p $Profile kubectl -- "--context=$Profile" `
        -n $Namespace create --dry-run=client -f - -o json
    if ($LASTEXITCODE -ne 0) { throw 'Broker manifest client validation failed.' }
    $item = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($item.kind -eq 'StatefulSet') {
        $item.spec.template.metadata.annotations = @{ 'foc/config-checksum' = $checksum }
    }
    $items += $item
}
$resources = @{ apiVersion = 'v1'; kind = 'List'; items = $items }
Send-KafkaDocument $resources -Arguments @('apply', '--dry-run=server', '-f', '-')
Send-KafkaDocument $resources
Invoke-KafkaKubectl @('rollout', 'status', 'statefulset/kafka', '--timeout=600s')
}

# New Job names avoid mutating an immutable Job template; initialization itself is idempotent.
$job = (Invoke-KafkaKubectl @('create', '--dry-run=client', '-f', "$PSScriptRoot/initialize-job.yaml", '-o', 'json') -join "`n") | ConvertFrom-Json -AsHashtable
$job.metadata.name = 'kafka-init-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
Send-KafkaDocument $job -Arguments @('create', '--dry-run=server', '-f', '-')
Send-KafkaDocument $job -Arguments @('create', '-f', '-')
Invoke-KafkaKubectl @('wait', '--for=condition=complete', "job/$($job.metadata.name)", '--timeout=1200s')
if($InitializeOnly){Write-Host "Kafka topic/ACL initialization completed in $Profile / $Namespace; broker, credentials and UI were not redeployed.";return}
Invoke-KafkaKubectl @('apply', '--dry-run=server', '-f', "$PSScriptRoot/ui.yaml")
Invoke-KafkaKubectl @('apply', '-f', "$PSScriptRoot/ui.yaml")
Invoke-KafkaKubectl @('rollout', 'status', 'deployment/kafka-ui', '--timeout=600s')
Write-Host "Kafka and read-only UI are ready in $Profile / $Namespace. No application Deployment or database was modified."

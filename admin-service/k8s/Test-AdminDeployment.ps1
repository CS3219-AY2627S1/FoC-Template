#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile='foc-local',[switch] $CheckDatabaseRestart)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../../deploy/kafka/k8s/Common.ps1"
Initialize-KafkaTools $Profile 'foc-local'
& "$PSScriptRoot/../../deploy/k8s/Test-LocalDeployment.ps1" -Service admin -Profile $Profile -CheckDatabaseRestart:$CheckDatabaseRestart
function Assert-Tcp([string]$Source,[string]$Target,[int]$Port,[bool]$Allowed) {
    $null=Invoke-KafkaKubectl @('exec',"deployment/$Source",'--','true')
    # Test L3/L4 policies independently of intermittent short-name DNS search failures.
    # Gateway HTTP smoke checks above separately exercise normal Service DNS/routing.
    $targetIp=(Invoke-KafkaKubectl @('get','pods','-l',"app=$Target",'-o','jsonpath={.items[0].status.podIP}') -join '').Trim()
    if(-not $targetIp){throw "No live target pod for $Target; cannot prove isolation."}
    $null = & $script:KafkaMinikube -p $Profile kubectl -- "--context=$Profile" -n foc-local exec "deployment/$Source" -- timeout 5 bash -c 'exec 3<>/dev/tcp/"$1"/"$2"' bash $targetIp "$Port" 2>&1
    if (($LASTEXITCODE -eq 0) -ne $Allowed) { throw "Unexpected connection: $Source -> ${Target}:$Port allowed=$Allowed" }
    Write-Host "PASS allowed=$Allowed $Source -> ${Target}:$Port"
}
Assert-Tcp admin-service admin-db 5432 $true
Assert-Tcp admin-service user-service 8081 $true
Assert-Tcp admin-service kafka 9092 $true
Assert-Tcp gateway admin-service 8084 $true
# Check forbidden targets are alive through their authorized caller before denial assertions.
Assert-Tcp user-service user-db 5432 $true
Assert-Tcp admin-service user-db 5432 $false
Assert-Tcp gateway admin-db 5432 $false
Assert-Tcp user-service admin-db 5432 $false
# Supplier -> Admin denial is covered by the isolated matrix. An unrelated service's
# CrashLoop/exec failure must not be counted as successful network isolation.
$listeners=(Invoke-KafkaKubectl @('logs','deployment/admin-service','--tail=2000')) -join "`n"
foreach($topic in @('credit.admin.events','user.admin.events')) {
    if($listeners -notmatch ('partitions assigned: \[[^\r\n]*'+[regex]::Escape($topic)+'-\d')) { throw "No actual Admin partition assignment observed for $topic; broker connectivity unverified." }
}
Write-Host 'PASS: real Admin Kafka consumers assigned outcome partitions. No simulated owner outcomes or financial/account actions submitted.'

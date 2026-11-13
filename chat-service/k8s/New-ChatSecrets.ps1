#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile = 'foc-local')

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../../deploy/kafka/k8s/Common.ps1"
Initialize-KafkaTools $Profile 'foc-local'

$secret = Read-KafkaSecret 'chat-service-secrets'
if ($secret) {
    foreach ($key in @('DB_PASSWORD', 'RABBITMQ_PASSWORD')) {
        if (-not $secret.data.ContainsKey($key)) {
            throw "Chat Secret is missing $key; recover the original value before deploying."
        }
    }
    Write-Host 'chat-service-secrets already exists; database and RabbitMQ credentials were preserved.'
    return
}

foreach ($claim in @('data-chat-db-0', 'data-rabbitmq-0')) {
    if (Invoke-KafkaKubectl @('get', 'pvc', $claim, '--ignore-not-found', '-o', 'name')) {
        throw "$claim exists without chat-service-secrets. Recover the original credentials; do not generate replacements."
    }
}

try {
    Ensure-KafkaSecret 'chat-service-secrets' @{
        DB_PASSWORD = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        RABBITMQ_PASSWORD = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    }
    Write-Host 'Chat database and RabbitMQ credentials were created without printing or saving them to files.'
} finally {
    $secret = $null
}

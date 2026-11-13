#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile='foc-local')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../../deploy/kafka/k8s/Common.ps1"
Initialize-KafkaTools $Profile 'foc-local'
$secret=Read-KafkaSecret 'admin-service-secrets'
if (-not $secret) {
    $claim=Invoke-KafkaKubectl @('get','pvc','data-admin-db-0','--ignore-not-found','-o','name')
    if ($claim) { throw 'Admin storage exists without its Secret. Recover the original credentials.' }
    $rsa=[Security.Cryptography.RSA]::Create(2048)
    try {
        Ensure-KafkaSecret 'admin-service-secrets' @{
            ADMIN_DB_PASSWORD=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
            ADMIN_SERVICE_PRIVATE_KEY=[Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
            ADMIN_SERVICE_KEY_ID='admin-k8s-1'
            # No Chat key exists yet: do not invent a trusted caller.
            ADMIN_SERVICE_TRUSTED_KEYS='{}'
        }
    } finally { $rsa.Dispose() }
    $secret=Read-KafkaSecret 'admin-service-secrets'
}
$rsa=[Security.Cryptography.RSA]::Create()
try {
    foreach($key in @('ADMIN_DB_PASSWORD','ADMIN_SERVICE_PRIVATE_KEY','ADMIN_SERVICE_KEY_ID','ADMIN_SERVICE_TRUSTED_KEYS')) {
        if (-not $secret.data.ContainsKey($key)) { throw "Admin Secret is missing $key; recover it." }
    }
    $rsa.ImportPkcs8PrivateKey([Convert]::FromBase64String((ConvertFrom-KafkaSecretValue $secret.data.ADMIN_SERVICE_PRIVATE_KEY)),[ref]$null)
    if ($rsa.KeySize -lt 2048) { throw 'Admin signing key is too small.' }
    $kid=ConvertFrom-KafkaSecretValue $secret.data.ADMIN_SERVICE_KEY_ID
    $entry=@{subject='admin-service';publicKey=[Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())}
    # Preserve any other pinned service identities on User's current deployment.
    $deployment=((Invoke-KafkaKubectl @('get','deployment','user-service','-o','json')) -join "`n") | ConvertFrom-Json -AsHashtable
    $current=@{}
    $envEntry=$deployment.spec.template.spec.containers[0].env | Where-Object name -eq 'USER_SERVICE_TRUSTED_KEYS'
    if ($envEntry) {
        if ($envEntry.value) { $current=$envEntry.value | ConvertFrom-Json -AsHashtable }
        elseif ($envEntry.valueFrom.configMapKeyRef) {
            $ref=$envEntry.valueFrom.configMapKeyRef
            $map=((Invoke-KafkaKubectl @('get','configmap',$ref.name,'-o','json')) -join "`n") | ConvertFrom-Json -AsHashtable
            $current=$map.data[$ref.key] | ConvertFrom-Json -AsHashtable
        } elseif ($envEntry.valueFrom.secretKeyRef) {
            $ref=$envEntry.valueFrom.secretKeyRef
            $old=Read-KafkaSecret $ref.name
            $current=(ConvertFrom-KafkaSecretValue $old.data[$ref.key]) | ConvertFrom-Json -AsHashtable
        } else { throw 'Unsupported existing User trust source; review before replacing.' }
    }
    if ($current.ContainsKey($kid) -and ($current[$kid].subject -ne $entry.subject -or $current[$kid].publicKey -cne $entry.publicKey)) {
        throw 'User already pins a different key for this Admin identity. No trust rotation performed.'
    }
    $current[$kid]=$entry
    Send-KafkaDocument @{apiVersion='v1';kind='ConfigMap';metadata=@{name='admin-user-trust';namespace='foc-local'};
        data=@{USER_SERVICE_TRUSTED_KEYS=($current | ConvertTo-Json -Depth 10 -Compress)}}
    Write-Host 'Admin credentials preserved/created; User public-key trust prepared. No private keys printed or exported.'
} finally { $rsa.Dispose(); $secret=$null }

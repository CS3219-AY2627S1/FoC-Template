#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile='foc-local')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../../deploy/kafka/k8s/Common.ps1"
Initialize-KafkaTools $Profile 'foc-local'
$config=((Invoke-KafkaKubectl @('get','configmap','admin-service-config','-o','json')) -join "`n") | ConvertFrom-Json -AsHashtable
$image=(Invoke-KafkaKubectl @('get','deployment','admin-service','-o','jsonpath={.spec.template.spec.containers[0].image}')) -join ''
Write-Host "Cluster $Profile / foc-local; deployed Admin image: $image"
$missing=[Collections.Generic.List[string]]::new()
foreach($setting in @('ADMIN_KAFKA_ENABLED','ADMIN_CASE_EVENTS_ENABLED')) {
    if($config.data[$setting] -ne 'true'){$missing.Add("Runtime setting $setting=true")}
}
if($config.data.ADMIN_CASE_EVENTS_TRANSACTION_ID -notmatch '^admin-case-events-[A-Za-z0-9._-]{1,100}$'){
    $missing.Add('Stable database-specific ADMIN_CASE_EVENTS_TRANSACTION_ID')
}
# Read-only broker metadata. Credentials remain inside its existing pod; no events are sent.
$probe=@'
set -euo pipefail
source /opt/foc-kafka/lib.sh
properties=$(mktemp)
trap 'rm -f "$properties"' EXIT
write_client_properties "$properties" foc_admin "$KAFKA_ADMIN_PASSWORD"
echo TOPICS
/opt/foc-kafka-cli/kafka-topics.sh --bootstrap-server localhost:9092 --command-config "$properties" --list
echo TOPIC_ACLS
/opt/foc-kafka-cli/kafka-acls.sh --bootstrap-server localhost:9092 --command-config "$properties" --list --topic admin.events
echo TRANSACTION_ACLS
/opt/foc-kafka-cli/kafka-acls.sh --bootstrap-server localhost:9092 --command-config "$properties" --list --transactional-id admin-case-events- --resource-pattern-type prefixed
echo CLUSTER_ACLS
/opt/foc-kafka-cli/kafka-acls.sh --bootstrap-server localhost:9092 --command-config "$properties" --list --cluster
printf 'TRANSACTION_SETTINGS=%s/%s\n' "$KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR" "$KAFKA_TRANSACTION_STATE_LOG_MIN_ISR"
'@
$raw=$probe | & $script:KafkaMinikube -p $Profile kubectl -- "--context=$Profile" -n foc-local exec -i kafka-0 -- bash -c 'tr -d "\r" | bash'
if($LASTEXITCODE -ne 0){throw 'Could not verify broker metadata; no cluster configuration changed.'}
$wire=$raw -join "`n"
if($raw -notcontains 'admin.events'){$missing.Add('Broker topic admin.events')}
$topic=($wire -split 'TOPIC_ACLS')[1] -split 'TRANSACTION_ACLS' | Select-Object -First 1
$transaction=($wire -split 'TRANSACTION_ACLS')[1]
if($raw -notcontains 'TRANSACTION_SETTINGS=1/1'){$missing.Add('Single-node transaction-state replication/min-ISR settings 1/1')}
if(($wire -split 'CLUSTER_ACLS')[1] -notmatch 'principal=User:admin_service, host=\*, operation=IDEMPOTENT_WRITE, permissionType=ALLOW'){
    $missing.Add('Admin cluster IDEMPOTENT_WRITE')
}
foreach($operation in @('WRITE','DESCRIBE')){
    $permission="principal=User:admin_service, host=\*, operation=$operation, permissionType=ALLOW"
    if($topic -notmatch $permission){$missing.Add("Admin $operation on admin.events")}
    if($transaction -notmatch $permission){$missing.Add("Admin $operation on admin-case-events- transactional prefix")}
}
if($missing.Count){foreach($item in $missing){Write-Host "MISSING: $item"};throw 'Lifecycle runtime prerequisites are incomplete; reviewed configuration/image rollout is required.'}
Write-Host 'PASS: topic, explicit relay configuration and scoped Admin permissions. Verify image revision and real committed delivery separately; this metadata check is not Chat acceptance.'

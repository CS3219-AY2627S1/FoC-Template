#Requires -Version 7.2
[CmdletBinding()]
param([ValidateSet('foc-local')][string]$Profile='foc-local',[switch]$Apply)
$ErrorActionPreference='Stop'
function Kube {
    if($MyInvocation.ExpectingInput){$input | & minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local @args}
    else{& minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local @args}
    if($LASTEXITCODE -ne 0){throw 'Local Kubernetes operation failed; no credentials are printed.'}
}
function Read-Resource($kind,$name){(Kube get $kind $name -o json|Out-String)|ConvertFrom-Json -AsHashtable}
function Decode($value){[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}
function Encode($value){[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value))}
function Identity($resource,$prefix,$subject){
    $rsa=[Security.Cryptography.RSA]::Create()
    try{
        $kid=Decode $resource.data["${prefix}_SERVICE_KEY_ID"]
        $bytes=[Convert]::FromBase64String((Decode $resource.data["${prefix}_SERVICE_PRIVATE_KEY"]))
        $used=0;$rsa.ImportPkcs8PrivateKey($bytes,[ref]$used)
        if($rsa.KeySize -lt 2048 -or $kid -notmatch '^[A-Za-z0-9._-]{1,100}$'){throw 'Invalid existing identity.'}
        @{kid=$kid;entry=@{subject=$subject;publicKey=[Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())}}
    }finally{$rsa.Dispose()}
}
$admin=Read-Resource secret admin-service-secrets
$order=Read-Resource secret order-service-secrets
$credit=Read-Resource secret credit-service-secrets
$user=Read-Resource configmap admin-user-trust
$updates=@{}
$hasKey=$order.data.ContainsKey('ORDER_SERVICE_PRIVATE_KEY')
if($hasKey -ne $order.data.ContainsKey('ORDER_SERVICE_KEY_ID')){throw 'Incomplete Order identity; recover it instead of rotating keys.'}
if(-not $hasKey){
    $rsa=[Security.Cryptography.RSA]::Create(3072)
    try{
        $order.data.ORDER_SERVICE_KEY_ID=Encode 'order-service-1'
        $order.data.ORDER_SERVICE_PRIVATE_KEY=Encode ([Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey()))
    }finally{$rsa.Dispose()}
    $updates['order-service-secrets']=$order
    Write-Host 'MISSING Order identity for current-account authorization; a new identity will be saved only with -Apply.'
}
$adminIdentity=Identity $admin ADMIN admin-service
$orderIdentity=Identity $order ORDER order-service
$pins=$user.data.USER_SERVICE_TRUSTED_KEYS|ConvertFrom-Json -AsHashtable
if($pins -isnot [Collections.IDictionary]){throw 'Invalid User trust map.'}
if($pins.ContainsKey($orderIdentity.kid)){
    $pin=$pins[$orderIdentity.kid]
    if($pin.subject -cne 'order-service' -or $pin.publicKey -cne $orderIdentity.entry.publicKey){throw 'Conflicting Order pin; no resources changed.'}
}else{
    $pins[$orderIdentity.kid]=$orderIdentity.entry
    $user.data.USER_SERVICE_TRUSTED_KEYS=$pins|ConvertTo-Json -Depth 8 -Compress
    $updates['admin-user-trust']=$user
}
# Remove only exact current pins used exclusively by the deleted HTTP dispute writes.
# Keep the Order private identity and its User pin: current-account authorization still uses them.
foreach($item in @(@{resource=$order;field='ORDER_SERVICE_TRUSTED_KEYS';identity=$adminIdentity},@{resource=$credit;field='CREDIT_SERVICE_TRUSTED_KEYS';identity=$orderIdentity})){
    $map=(Decode $item.resource.data[$item.field])|ConvertFrom-Json -AsHashtable
    if($map -isnot [Collections.IDictionary]){throw 'Invalid existing service trust map.'}
    if($map.ContainsKey($item.identity.kid)){
        $pin=$map[$item.identity.kid]
        if($pin.subject -ceq $item.identity.entry.subject -and $pin.publicKey -ceq $item.identity.entry.publicKey){
            $map.Remove($item.identity.kid)
            $item.resource.data[$item.field]=Encode ($map|ConvertTo-Json -Depth 8 -Compress)
            $updates[$item.resource.metadata.name]=$item.resource
        }
    }
}
foreach($name in $updates.Keys){
    if($Apply){
        $resource=$updates[$name];$resource.metadata.Remove('managedFields')|Out-Null
        $resource|ConvertTo-Json -Depth 30 -Compress|Kube replace -f -
        Write-Host "Reconciled $name; unrelated data and credentials preserved."
    }else{Write-Host "Planned update: $name"}
}
if($Apply){
    Kube apply -f "$PSScriptRoot/config.yaml" -f "$PSScriptRoot/../../order-service/k8s/config.yaml" -f "$PSScriptRoot/../../credit-service/k8s/config.yaml"
    Kube apply -f "$PSScriptRoot/../../deploy/k8s/network/policies.yaml" -f "$PSScriptRoot/network.yaml"
}
$admin=$null;$order=$null;$credit=$null;$updates=$null
Write-Host 'Kafka dispute runtime reconciliation finished. Application rollouts and topic initialization are separate.'

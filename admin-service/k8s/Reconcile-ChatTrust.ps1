#Requires -Version 7.2
[CmdletBinding()]
param([ValidateSet('foc-local')][string]$Profile='foc-local', [switch]$Apply)
$ErrorActionPreference='Stop'
# Existing service identities only. Never generates/rotates a key or exports private material.
function Read-Resource([string]$Kind,[string]$Name) {
    $raw = kubectl "--context=$Profile" -n foc-local get $Kind $Name -o json
    if($LASTEXITCODE -ne 0){throw "Missing existing $Kind/$Name; credentials must be recovered, not regenerated."}
    ($raw -join "`n") | ConvertFrom-Json -AsHashtable
}
function Secret-Text($Resource,[string]$Key) {
    if(-not $Resource.data.ContainsKey($Key)){throw "Required existing credential field $Key is missing."}
    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Resource.data[$Key]))
}
function Public-Identity($Resource,[string]$Prefix,[string]$Subject) {
    $kid=Secret-Text $Resource "${Prefix}_SERVICE_KEY_ID"
    if($kid -notmatch '^[A-Za-z0-9._-]{1,100}$'){throw 'Invalid service key identifier.'}
    $rsa=[Security.Cryptography.RSA]::Create()
    try {
        $consumed=0
        $rsa.ImportPkcs8PrivateKey([Convert]::FromBase64String((Secret-Text $Resource "${Prefix}_SERVICE_PRIVATE_KEY")),[ref]$consumed)
        if($rsa.KeySize -lt 2048){throw 'Existing service signing key is too small.'}
        @{kid=$kid; entry=@{subject=$Subject;publicKey=[Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())}}
    } finally {$rsa.Dispose()}
}
$updates=[Collections.Generic.List[object]]::new()
function Prepare-Pin([string]$Kind,[string]$Name,[string]$Field,$Identity,$Resource) {
    $raw=if($Kind -eq 'secret'){
        if($Resource.data.ContainsKey($Field)){Secret-Text $Resource $Field}else{'{}'}
    }else{$Resource.data[$Field]}
    if([string]::IsNullOrWhiteSpace($raw)){throw "Trust field $Field is empty or absent on $Kind/$Name."}
    $map=$raw | ConvertFrom-Json -AsHashtable
    if($map -isnot [Collections.IDictionary]){throw 'Existing trust map is not an object.'}
    if($map.ContainsKey($Identity.kid)){
        $pin=$map[$Identity.kid]
        if($pin.subject -cne $Identity.entry.subject -or $pin.publicKey -cne $Identity.entry.publicKey){throw "Conflicting existing pin on $Kind/$Name; no trust was changed."}
        Write-Host "VERIFIED existing $($Identity.entry.subject) pin on $Kind/$Name"
    }else{
        $map[$Identity.kid]=$Identity.entry
        $value=$map | ConvertTo-Json -Depth 8 -Compress
        if($Kind -eq 'secret'){$value=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value))}
        $updates.Add(@{kind=$Kind;name=$Name;field=$Field;value=$value;subject=$Identity.entry.subject;version=$Resource.metadata.resourceVersion})
        Write-Host "MISSING $($Identity.entry.subject) pin on $Kind/$Name"
    }
}
$admin=Read-Resource secret admin-service-secrets
$chat=Read-Resource secret chat-service-secrets
$adminIdentity=Public-Identity $admin ADMIN admin-service
$chatIdentity=Public-Identity $chat CHAT chat-service
# Validate every map before making any changes; retain all unrelated keys and data fields.
Prepare-Pin secret chat-service-secrets CHAT_SERVICE_TRUSTED_KEYS $adminIdentity $chat
Prepare-Pin secret admin-service-secrets ADMIN_SERVICE_TRUSTED_KEYS $chatIdentity $admin
Prepare-Pin configmap admin-user-trust USER_SERVICE_TRUSTED_KEYS $chatIdentity (Read-Resource configmap admin-user-trust)
Prepare-Pin secret order-service-secrets ORDER_SERVICE_TRUSTED_KEYS $chatIdentity (Read-Resource secret order-service-secrets)
Prepare-Pin secret credit-service-secrets CREDIT_SERVICE_TRUSTED_KEYS $chatIdentity (Read-Resource secret credit-service-secrets)
foreach($update in $updates){
    if($Apply){
        $patch=@{metadata=@{resourceVersion=$update.version};data=@{$update.field=$update.value}} | ConvertTo-Json -Depth 5 -Compress
        # kubectl patch does not treat --patch-file=- as stdin. This contains public pins only.
        kubectl "--context=$Profile" -n foc-local patch $update.kind $update.name --type=merge --patch $patch
        if($LASTEXITCODE -ne 0){throw "Could not reconcile public trust on $($update.kind)/$($update.name)."}
        Write-Host "ADDED public $($update.subject) pin on $($update.kind)/$($update.name)"
    }
}
$admin=$null; $chat=$null; $patch=$null
if(-not $Apply -and $updates.Count){throw "$($updates.Count) public trust pin(s) require reconciliation; rerun with -Apply after review."}
Write-Host 'Trust checked against existing signing identities. No private key or JWT signing identity changed.'

#Requires -Version 7.2
[CmdletBinding()]
param([ValidateSet('foc-local')][string]$Profile='foc-local',[switch]$Apply)
$ErrorActionPreference='Stop'
# Provision only a missing Credit service identity. Never rotate database/JWT/service credentials.
function Read-Existing([string]$Kind,[string]$Name){
    $raw=kubectl "--context=$Profile" -n foc-local get $Kind $Name -o json
    if($LASTEXITCODE -ne 0){throw "Missing existing $Kind/$Name; recover existing storage credentials first."}
    ($raw -join "`n")|ConvertFrom-Json -AsHashtable
}
function Decode-Value([string]$Value){[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))}
function Encode-Value([string]$Value){[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))}
$secret=Read-Existing secret credit-service-secrets
$hasKid=$secret.data.ContainsKey('CREDIT_SERVICE_KEY_ID')
$hasKey=$secret.data.ContainsKey('CREDIT_SERVICE_PRIVATE_KEY')
if($hasKid -ne $hasKey){throw 'Incomplete existing Credit identity; no credentials changed.'}
if(-not $hasKey -and -not $Apply){Write-Host 'MISSING Credit service signing identity; rerun with -Apply after owner review.';exit 1}
$rsa=[Security.Cryptography.RSA]::Create()
try{
    if($hasKey){
        $kid=Decode-Value $secret.data.CREDIT_SERVICE_KEY_ID
        $consumed=0
        $rsa.ImportPkcs8PrivateKey([Convert]::FromBase64String((Decode-Value $secret.data.CREDIT_SERVICE_PRIVATE_KEY)),[ref]$consumed)
        if($kid -notmatch '^[A-Za-z0-9._-]{1,100}$' -or $rsa.KeySize -lt 2048){throw 'Invalid existing Credit identity; no credentials changed.'}
        Write-Host 'VERIFIED existing Credit service identity.'
    }else{
        $rsa.KeySize=3072;$kid='credit-service-admin-1'
    }
    $public=[Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())
    $trust=Read-Existing configmap admin-user-trust
    $pins=$trust.data.USER_SERVICE_TRUSTED_KEYS|ConvertFrom-Json -AsHashtable
    if($pins -isnot [Collections.IDictionary]){throw 'User public trust map is invalid.'}
    if($pins.ContainsKey($kid)){
        if($pins[$kid].subject -cne 'credit-service' -or $pins[$kid].publicKey -cne $public){throw 'Conflicting Credit public pin; no credentials changed.'}
        Write-Host 'VERIFIED Credit public pin in User trust.'
    }else{
        $pins[$kid]=@{subject='credit-service';publicKey=$public}
        if($Apply){
            # Save a new private identity only after every existing public pin was validated.
            if(-not $hasKey){
                $secret.data.CREDIT_SERVICE_KEY_ID=Encode-Value $kid
                $secret.data.CREDIT_SERVICE_PRIVATE_KEY=Encode-Value ([Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey()))
                $secret.metadata.Remove('managedFields')|Out-Null
                $secret|ConvertTo-Json -Depth 30 -Compress|kubectl "--context=$Profile" -n foc-local replace -f -
                if($LASTEXITCODE -ne 0){throw 'Could not save missing Credit identity.'}
            }
            $patch=@{metadata=@{resourceVersion=$trust.metadata.resourceVersion};data=@{USER_SERVICE_TRUSTED_KEYS=($pins|ConvertTo-Json -Depth 8 -Compress)}}|ConvertTo-Json -Depth 12 -Compress
            kubectl "--context=$Profile" -n foc-local patch configmap admin-user-trust --type=merge --patch $patch
            if($LASTEXITCODE -ne 0){throw 'Credit identity saved; public trust update needs retry with the same identity.'}
            Write-Host 'ADDED Credit public pin; existing credentials and trust entries retained.'
        }else{Write-Host 'MISSING Credit public pin; rerun with -Apply after owner review.';exit 1}
    }
}finally{$rsa.Dispose();$secret=$null;$trust=$null;$patch=$null}

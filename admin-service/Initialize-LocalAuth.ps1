# Dot-source this script in the local development shell before starting Admin/User.
# It sets process environment only and never changes User's signing key.
$ErrorActionPreference = 'Stop'
if (-not $env:ADMIN_SERVICE_PRIVATE_KEY) {
    $adminServiceRsa = [System.Security.Cryptography.RSA]::Create(2048)
    try {
        $env:ADMIN_SERVICE_PRIVATE_KEY = [Convert]::ToBase64String($adminServiceRsa.ExportPkcs8PrivateKey())
    } finally { $adminServiceRsa.Dispose() }
}
$adminServiceRsa = [System.Security.Cryptography.RSA]::Create()
try {
    $adminServiceKeyBytes = [Convert]::FromBase64String($env:ADMIN_SERVICE_PRIVATE_KEY)
    $adminServiceRsa.ImportPkcs8PrivateKey($adminServiceKeyBytes, [ref]0)
    if (-not $env:ADMIN_SERVICE_KEY_ID) { $env:ADMIN_SERVICE_KEY_ID = 'admin-service-local-1' }
    $adminServiceTrust = @{}
    if ($env:USER_SERVICE_TRUSTED_KEYS) {
        $adminServiceTrust = ConvertFrom-Json -AsHashtable $env:USER_SERVICE_TRUSTED_KEYS
    }
    $adminServiceTrust[$env:ADMIN_SERVICE_KEY_ID] = @{
        subject = 'admin-service'
        publicKey = [Convert]::ToBase64String($adminServiceRsa.ExportSubjectPublicKeyInfo())
    }
    $env:USER_SERVICE_TRUSTED_KEYS = ConvertTo-Json -Compress $adminServiceTrust
} finally { $adminServiceRsa.Dispose() }
Write-Host 'Admin service identity and User public-key trust are configured in this shell.'

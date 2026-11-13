param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $repositoryRoot "certs"
$caKey = Join-Path $certificateDirectory "ca.key"
$caCertificate = Join-Path $certificateDirectory "ca.crt"
$serverKey = Join-Path $certificateDirectory "user-service.key"
$serverRequest = Join-Path $certificateDirectory "user-service.csr"
$serverCertificate = Join-Path $certificateDirectory "user-service.crt"
$extensionFile = Join-Path $certificateDirectory "user-service.ext"
$requestConfig = Join-Path $certificateDirectory "openssl-req.cnf"

$opensslCommand = Get-Command openssl -ErrorAction SilentlyContinue
if ($null -ne $opensslCommand) {
    $opensslPath = $opensslCommand.Source
} else {
    $gitOpenSsl = "C:\Program Files\Git\usr\bin\openssl.exe"
    if (-not (Test-Path -LiteralPath $gitOpenSsl)) {
        throw "OpenSSL was not found on PATH or in the standard Git for Windows location."
    }
    $opensslPath = $gitOpenSsl
}
New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

$persistentFiles = @($caKey, $caCertificate, $serverKey, $serverCertificate)
if (-not $Force -and ($persistentFiles | Where-Object { Test-Path -LiteralPath $_ })) {
    throw "Development certificates already exist. Re-run with -Force to replace them."
}

@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=user-service
DNS.2=localhost
IP.1=127.0.0.1
"@ | Set-Content -LiteralPath $extensionFile -Encoding ascii

# Pass a config explicitly: some OpenSSL builds on PATH (such as Git's
# mingw64 one) look for a default openssl.cnf that does not exist.
@"
[req]
distinguished_name=dn

[dn]

[v3_ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always,issuer
"@ | Set-Content -LiteralPath $requestConfig -Encoding ascii

& $opensslPath req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes `
    -config $requestConfig -extensions v3_ca -keyout $caKey -out $caCertificate -subj "/CN=FoC Development CA"
if ($LASTEXITCODE -ne 0) { throw "Failed to create the development CA." }

& $opensslPath req -new -newkey rsa:2048 -sha256 -nodes `
    -config $requestConfig -keyout $serverKey -out $serverRequest -subj "/CN=user-service"
if ($LASTEXITCODE -ne 0) { throw "Failed to create the User Service certificate request." }

& $opensslPath x509 -req -sha256 -days 825 -in $serverRequest `
    -CA $caCertificate -CAkey $caKey -CAcreateserial `
    -out $serverCertificate -extfile $extensionFile
if ($LASTEXITCODE -ne 0) { throw "Failed to sign the User Service certificate." }

Remove-Item -LiteralPath $serverRequest, $extensionFile, $requestConfig -Force
$serialFile = Join-Path $certificateDirectory "ca.srl"
if (Test-Path -LiteralPath $serialFile) {
    Remove-Item -LiteralPath $serialFile -Force
}

Write-Host "Created development TLS material in $certificateDirectory."
Write-Host "The private keys and certificates are ignored by Git."

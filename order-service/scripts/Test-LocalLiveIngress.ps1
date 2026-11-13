# Isolated nginx wire test. Does not start the app, tunnel or touch application DBs.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$network = "foc-order-ingress-test-$suffix"
$origin = "foc-order-origin-test-$suffix"
$ingress = "foc-order-proxy-test-$suffix"
$config = (Resolve-Path (Join-Path $PSScriptRoot '../deploy/local-live/nginx.conf')).Path
$fixture = (Resolve-Path (Join-Path $PSScriptRoot 'fixtures')).Path
$createdContainers = @()
$networkCreated = $false
try {
    & docker network create $network | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create isolated test network' }
    $networkCreated = $true
    & docker run -d --name $origin --network $network --network-alias credit-service --read-only --cap-drop ALL --security-opt no-new-privileges:true --mount "type=bind,source=$fixture,target=/test,readonly" node:24-alpine node /test/credit-push-origin.mjs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start synthetic origin fixture' }
    $createdContainers += $origin
    & docker run -d --name $ingress --network $network --network-alias ingress-test --user 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges:true --tmpfs /tmp:mode=1777 --mount "type=bind,source=$config,target=/etc/nginx/nginx.conf,readonly" --entrypoint nginx nginx:1.28-alpine -g 'daemon off;' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start restricted nginx' }
    $createdContainers += $ingress
    & docker run --rm --network $network --read-only --cap-drop ALL --security-opt no-new-privileges:true --mount "type=bind,source=$fixture,target=/test,readonly" node:24-alpine node /test/test-credit-push-ingress.mjs
    if ($LASTEXITCODE -ne 0) { throw 'nginx routing test failed' }
} finally {
    # Exact names generated in this test only; never enumerate/remove app containers.
    foreach ($container in $createdContainers) {
        if ($container -notmatch '^foc-order-(origin|proxy)-test-[a-f0-9]{12}$') { throw 'Unsafe test cleanup target' }
        & docker rm -f $container | Out-Null
    }
    if ($networkCreated) { & docker network rm $network | Out-Null }
}

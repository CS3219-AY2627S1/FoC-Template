$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$composeArgs = @('-p', 'foc-order-credit-test', '-f', $composeFile)
$testExitCode = 1
try {
    & docker compose @composeArgs build --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Integration image build failed' }
    # Fresh API processes avoid retaining the previous runner's test JWKS.
    & docker compose @composeArgs up -d --force-recreate credit-service order-service
    if ($LASTEXITCODE -ne 0) { throw 'Integration stack startup failed' }
    & docker compose @composeArgs run --use-aliases --no-deps --rm runner
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        & docker compose @composeArgs logs --tail 60 credit-service order-service
    }
} finally {
    # This project has only disposable tmpfs databases, never development volumes.
    & docker compose @composeArgs down --remove-orphans
}
exit $testExitCode

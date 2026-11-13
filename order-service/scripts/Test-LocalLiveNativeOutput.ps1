# Regression for Windows PowerShell 5.1 native stderr handling. No Docker/GCP calls.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-live.ps1')
$script:nativeFixture = Join-Path $PSScriptRoot 'fixtures/native-compose-output.cmd'
$script:assertions = 0
function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw "FAIL: $Message" }
    $script:assertions++
}
# Keep the real native process/streams; replace only executable selection.
function docker { & $script:nativeFixture @args }

$result = Invoke-Compose @('success')
Assert-True (($result | ConvertFrom-Json).fixture -eq $true) 'Native stderr at exit 0 must not prevent JSON capture'
Assert-True ($result.Trim() -eq '{"fixture":true}') 'Stderr progress never contaminates stdout JSON'
Assert-True ($ErrorActionPreference -eq 'Stop') 'Restore caller Stop preference after success'

$failure = $null
try { [void](Invoke-Compose @('fail')) } catch { $failure = $_.Exception.Message }
Assert-True ($null -ne $failure -and $failure.Contains('exit 23')) 'Nonzero native status must still fail with its exit code'
Assert-True (-not $failure.Contains('fixture-private-stderr')) 'Do not expose captured private config/diagnostics'
Assert-True ($ErrorActionPreference -eq 'Stop') 'Restore caller Stop preference after failure'

$failure = $null
try { [void](Invoke-Compose @('silent-fail')) } catch { $failure = $_.Exception.Message }
Assert-True ($null -ne $failure -and $failure.Contains('exit 24')) 'Silent nonzero status is not success'
Assert-True ((Invoke-Compose @('empty')) -eq '') 'Empty stdout at exit 0 stays empty'

$ErrorActionPreference = 'Continue'
$result = Invoke-Compose @('success')
Assert-True ($ErrorActionPreference -eq 'Continue') 'Restore caller Continue preference too'
$ErrorActionPreference = 'Stop'
function docker { throw 'fixture-launch-exception' }
$failure = $null
try { [void](Invoke-Compose @('success')) } catch { $failure = $_.Exception.Message }
Assert-True ($failure -eq 'fixture-launch-exception') 'A command launch exception must propagate'
Assert-True ($ErrorActionPreference -eq 'Stop') 'Finally restores preference on a launch exception'

Write-Host "PASS: $script:assertions native output/exit/preference assertions; no Docker or cloud changes."

param(
    [Parameter(Mandatory)][Guid]$OrderId,
    [Parameter(Mandatory)][Guid[]]$ParticipantIds,
    [ValidateRange(1024,65535)][int]$Port = 18085,
    [switch]$Incomplete,
    [Guid]$CaseId = [Guid]::Empty
)
$ErrorActionPreference = 'Stop'
if (-not $ParticipantIds.Count) { throw 'At least one explicit fixture participant is required.' }
$report = Join-Path $PSScriptRoot 'target/surefire-reports/TEST-com.friendoncampus.admin.CaseWorkflowTest.xml'
if (-not (Test-Path -LiteralPath $report)) { throw 'Run the Admin tests first to generate the local test classpath.' }
$fixtureClass = Join-Path $PSScriptRoot 'target/test-classes/com/friendoncampus/admin/ReportEligibilityFixture.class'
if (-not (Test-Path -LiteralPath $fixtureClass)) { throw 'Run Maven test-compile after pulling this fixture.' }
[xml]$testReport = Get-Content -LiteralPath $report -Raw
$fixtureClasspath = ($testReport.testsuite.properties.property | Where-Object name -eq 'java.class.path').value
if (-not $fixtureClasspath) { throw 'No test classpath found; rerun the Admin tests.' }
Write-Host 'Starting a TEST-ONLY fixture, not Chat. Only the supplied errand/participants are fixtures.'
Write-Host "Configure the Admin process with ADMIN_CHAT_URL=http://127.0.0.1:$Port; stop this fixture with Ctrl+C."
$fixtureArgs = @($OrderId, ($ParticipantIds -join ','), $Port, ($Incomplete.IsPresent.ToString().ToLowerInvariant()))
if ($CaseId -ne [Guid]::Empty) { $fixtureArgs += $CaseId }
& java -cp $fixtureClasspath com.friendoncampus.admin.ReportEligibilityFixture @fixtureArgs
if ($LASTEXITCODE -ne 0) { throw "Eligibility fixture exited with code $LASTEXITCODE" }

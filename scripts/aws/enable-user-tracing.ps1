# AI assistance: OpenAI Codex, 2026-11-09.
# Default mode previews only local settings. -Deploy registers and deploys a revision.
[CmdletBinding()]
param(
    [switch]$Deploy,
    [string]$ExpectedRevision = 'campusgo-user:2'
)

$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath "$PSScriptRoot/user-tracing.json" -Raw | ConvertFrom-Json
if (-not $Deploy) {
    Write-Output "Proposed additions to user-service (expected source: $ExpectedRevision):"
    $settings | ConvertTo-Json
    Write-Output 'Preview only. No AWS calls or deployment performed.'
    return
}

. "$PSScriptRoot/common.ps1"
$serviceResult = Aws @('ecs', 'describe-services', '--cluster', 'campusgo', '--services', 'user-service')
if ($serviceResult.failures.Count -gt 0 -or $serviceResult.services.Count -ne 1) {
    throw 'Could not identify user-service; no changes made.'
}
$service = $serviceResult.services[0]
$previous = $service.taskDefinition
if (($previous -split '/')[-1] -ne $ExpectedRevision) {
    throw 'The deployed revision changed since review. Review it before proceeding.'
}
if ($service.deployments.Count -ne 1 -or $service.deployments[0].rolloutState -ne 'COMPLETED') {
    throw 'An existing deployment is not complete. No changes made.'
}

# Preserve existing configuration in memory; never print the full task definition.
$source = Aws @('ecs', 'describe-task-definition', '--task-definition', $previous, '--include', 'TAGS')
$definition = $source.taskDefinition
$containers = @($definition.containerDefinitions | Where-Object name -eq 'user')
if ($containers.Count -ne 1) { throw 'Expected exactly one user container.' }
$container = $containers[0]
$settingNames = @($settings.PSObject.Properties.Name)
$container.environment = @($container.environment | Where-Object { $_.name -notin $settingNames })
foreach ($setting in $settings.PSObject.Properties) {
    $container.environment += [pscustomobject]@{ name = $setting.Name; value = [string]$setting.Value }
}

# DescribeTaskDefinition includes read-only fields that registration does not accept.
$readOnly = @('taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities',
    'registeredAt', 'registeredBy', 'deregisteredAt')
$request = @{}
foreach ($property in $definition.PSObject.Properties) {
    if ($property.Name -notin $readOnly) { $request[$property.Name] = $property.Value }
}
if ($source.tags) { $request.tags = $source.tags }

# Existing helper uses a temporary file outside the repository and deletes it in finally.
$registered = AwsRequest @('ecs', 'register-task-definition') $request
$next = $registered.taskDefinition.taskDefinitionArn
Write-Output "Registered: $next"
Write-Output "Previous revision for rollback: $previous"
$null = Aws @('ecs', 'update-service', '--cluster', 'campusgo', '--service', 'user-service', '--task-definition', $next)
Write-Output 'User-service rollout started. Deployment completion and HTTP verification remain required.'

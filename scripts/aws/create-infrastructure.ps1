. "$PSScriptRoot/common.ps1"
# Generate the broker credential in memory. Never print or commit it.
$parameters = Aws @('ssm','describe-parameters','--parameter-filters','Key=Name,Values=/campusgo/rabbitmq/password')
if (-not $parameters.Parameters) {
    $password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $null = AwsRequest @('ssm','put-parameter') @{Name='/campusgo/rabbitmq/password';Type='SecureString';Value=$password;Description='CampusGo demo broker password'}
    $password = $null
}
$request = @{
    StackName='campusgo-network-broker';ChangeSetName='initial-deployment';ChangeSetType='CREATE'
    TemplateBody=(Get-Content "$PSScriptRoot/infrastructure.json" -Raw)
    Capabilities=@('CAPABILITY_IAM')
    Parameters=@(
        @{ParameterKey='Vpc';ParameterValue='vpc-01d627fb2c3be7f47'},
        @{ParameterKey='Subnet';ParameterValue='subnet-0fd80fc1c34dc14d8'},
        @{ParameterKey='Ami';ParameterValue='ami-01127915c7b29e7ca'}
    )
}
$result = AwsRequest @('cloudformation','create-change-set') $request
Write-Output "Created change set: $($result.Id)"

[CmdletBinding()]
param(
    [string]$ImageTag = '20261110',
    [string]$GrafanaImageTag = '20261110-dashboard-fix'
)
. "$PSScriptRoot/../common.ps1"
$network = (Aws @('cloudformation','describe-stacks','--stack-name','campusgo-network-broker')).Stacks[0]
$outputs = @{}
foreach ($entry in $network.Outputs) { $outputs[$entry.OutputKey] = $entry.OutputValue }
$broker = (Aws @('ec2','describe-instances','--instance-ids',$outputs.BrokerId)).Reservations[0].Instances[0]
$brokerGroups = (Aws (@('ec2','describe-security-groups','--group-ids') + @($broker.SecurityGroups.GroupId))).SecurityGroups
$brokerGroup = @($brokerGroups | Where-Object GroupName -like '*-BrokerSecurityGroup-*')
if ($brokerGroup.Count -ne 1) { throw 'Expected a single broker security group.' }
$userService = (Aws @('ecs','describe-services','--cluster','campusgo','--services','user-service')).services[0]
$executionRole = (Aws @('ecs','describe-task-definition','--task-definition',$userService.taskDefinition,'--query','taskDefinition.executionRoleArn'))
$parameters = @{
    VpcId=$broker.VpcId
    Subnets=($userService.networkConfiguration.awsvpcConfiguration.subnets -join ',')
    ApplicationSecurityGroup=$outputs.InternalSecurityGroup
    BrokerSecurityGroup=$brokerGroup[0].GroupId
    BrokerPrivateIp=$broker.PrivateIpAddress
    NamespaceId=$outputs.NamespaceId
    ExecutionRoleArn=$executionRole
}
foreach ($name in @('Grafana','Tempo','Collector','Prometheus')) {
    $repository='campusgo/monitoring-'+$name.ToLowerInvariant()
    $tag = if ($name -eq 'Grafana') { $GrafanaImageTag } else { $ImageTag }
    $image=(Aws @('ecr','describe-images','--repository-name',$repository,'--image-ids',"imageTag=$tag")).imageDetails[0]
    $parameters[$name+'Image']="807733922601.dkr.ecr.${Region}.amazonaws.com/${repository}@$($image.imageDigest)"
}
$arguments=@('cloudformation','deploy','--stack-name','campusgo-monitoring','--template-file',"$PSScriptRoot/stack.json",'--no-fail-on-empty-changeset','--capabilities','CAPABILITY_IAM','--parameter-overrides')
foreach ($key in $parameters.Keys) { $arguments += "$key=$($parameters[$key])" }
& aws.exe @arguments --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { throw 'Monitoring stack deployment failed.' }

[CmdletBinding()]
param([ValidateSet('Start','Stop','Status')][string]$Action='Status')
. "$PSScriptRoot/common.ps1"
$services=@('monitoring-service','api-gateway-service','frontend-service','user-service','supplier-service','order-service','credit-service','chat-service')
$stack=(Aws @('cloudformation','describe-stacks','--stack-name','campusgo-network-broker')).Stacks[0]
$instanceId=($stack.Outputs | Where-Object OutputKey -eq BrokerId).OutputValue
if (-not $instanceId) { throw 'Cannot find broker instance' }
$database=(Aws @('rds','describe-db-instances','--db-instance-identifier','campusgo-db')).DBInstances[0]
$instance=(Aws @('ec2','describe-instances','--instance-ids',$instanceId)).Reservations[0].Instances[0]
if ($Action -eq 'Stop') {
    foreach ($service in ($services | Where-Object { $_ -ne 'monitoring-service' })) { $null=Aws @('ecs','update-service','--cluster','campusgo','--service',$service,'--desired-count','0') }
    $null=Aws @('ecs','update-service','--cluster','campusgo','--service','monitoring-service','--desired-count','0')
    Write-Output 'Waiting for ECS services to stop before stopping their dependencies...'
    $null=Aws (@('ecs','wait','services-stable','--cluster','campusgo','--services')+$services)
    if ($instance.State.Name -eq 'running') { $null=Aws @('ec2','stop-instances','--instance-ids',$instanceId) }
    if ($database.DBInstanceStatus -eq 'available') { $null=Aws @('rds','stop-db-instance','--db-instance-identifier','campusgo-db') }
    elseif ($database.DBInstanceStatus -notin @('stopped','stopping')) { throw "Database is $($database.DBInstanceStatus). Run Stop again after it becomes available." }
    Write-Output 'Stop requested. Storage still incurs charges; RDS automatically restarts after seven days.'
} elseif ($Action -eq 'Start') {
    if ($database.DBInstanceStatus -eq 'stopped') { $null=Aws @('rds','start-db-instance','--db-instance-identifier','campusgo-db') }
    if ($instance.State.Name -eq 'stopped') { $null=Aws @('ec2','start-instances','--instance-ids',$instanceId) }
    Write-Output 'Waiting for the database and broker host...'
    $null=Aws @('rds','wait','db-instance-available','--db-instance-identifier','campusgo-db')
    $null=Aws @('ec2','wait','instance-running','--instance-ids',$instanceId)
    foreach ($service in $services) { $null=Aws @('ecs','update-service','--cluster','campusgo','--service',$service,'--desired-count','1') }
    Write-Output 'Waiting for the application and monitoring ECS services...'
    $null=Aws (@('ecs','wait','services-stable','--cluster','campusgo','--services')+$services)
}
(Aws (@('ecs','describe-services','--cluster','campusgo','--services')+$services)).services | Select-Object serviceName,desiredCount,runningCount,pendingCount
Write-Output ('RDS: '+(Aws @('rds','describe-db-instances','--db-instance-identifier','campusgo-db')).DBInstances[0].DBInstanceStatus)
Write-Output ('RabbitMQ host: '+(Aws @('ec2','describe-instances','--instance-ids',$instanceId)).Reservations[0].Instances[0].State.Name)
$tasks=Aws @('ecs','list-tasks','--cluster','campusgo','--service-name','api-gateway-service','--desired-status','RUNNING')
if ($tasks.taskArns.Count -gt 0) {
    $task=(Aws @('ecs','describe-tasks','--cluster','campusgo','--tasks',$tasks.taskArns[0])).tasks[0]
    $eni=($task.attachments.details | Where-Object name -eq networkInterfaceId).value
    if ($eni) {
        $address=(Aws @('ec2','describe-network-interfaces','--network-interface-ids',$eni)).NetworkInterfaces[0].Association.PublicIp
        if ($address) { Write-Output "Demo URL: http://$address (changes when the task is replaced)" }
    }
}

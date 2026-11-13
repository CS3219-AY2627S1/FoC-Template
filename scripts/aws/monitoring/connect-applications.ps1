. "$PSScriptRoot/../common.ps1"
$settings = Get-Content "$PSScriptRoot/application-telemetry.json" -Raw | ConvertFrom-Json
$records=@()
foreach ($name in @('user','supplier','order','credit')) {
    $service=(Aws @('ecs','describe-services','--cluster','campusgo','--services',"$name-service")).services[0]
    if ($service.deployments.Count -ne 1 -or $service.deployments[0].rolloutState -ne 'COMPLETED') { throw "Wait for $name-service deployment to complete." }
    $source=Aws @('ecs','describe-task-definition','--task-definition',$service.taskDefinition,'--include','TAGS')
    $definition=$source.taskDefinition
    $container=@($definition.containerDefinitions | Where-Object name -eq $name)
    if ($container.Count -ne 1) { throw "Expected one $name container." }
    $keys=@($settings.PSObject.Properties.Name)+@('OTEL_SERVICE_NAME')
    $container[0].environment=@($container[0].environment | Where-Object name -notin $keys)
    foreach ($setting in $settings.PSObject.Properties) { $container[0].environment += @{name=$setting.Name;value=[string]$setting.Value} }
    $container[0].environment += @{name='OTEL_SERVICE_NAME';value="$name-service"}
    $request=@{}
    foreach ($property in $definition.PSObject.Properties) {
        if ($property.Name -notin @('taskDefinitionArn','revision','status','requiresAttributes','compatibilities','registeredAt','registeredBy','deregisteredAt')) { $request[$property.Name]=$property.Value }
    }
    if ($source.tags) { $request.tags=$source.tags }
    $new=(AwsRequest @('ecs','register-task-definition') $request).taskDefinition.taskDefinitionArn
    $records += @{service="$name-service";previous=$service.taskDefinition;next=$new}
    $records | ConvertTo-Json -Depth 5 | Set-Content "$PSScriptRoot/application-rollout.json" -Encoding utf8
    $null=Aws @('ecs','update-service','--cluster','campusgo','--service',"$name-service",'--task-definition',$new)
    Write-Output "$name-service: $($service.taskDefinition) -> $new"
}

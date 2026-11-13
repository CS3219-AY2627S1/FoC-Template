# Reapply the current, separately deployed service revisions without reading secrets.
. "$PSScriptRoot/common.ps1"
foreach ($name in @('user','supplier','order','credit','chat','frontend','api-gateway')) {
    $null=Aws @('ecs','update-service','--cluster','campusgo','--service',"$name-service",'--desired-count','1','--force-new-deployment')
    Write-Output "Redeploying $name-service using its current task definition"
}

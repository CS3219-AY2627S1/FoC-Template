[CmdletBinding()]
param([Parameter(Mandatory)][int]$ActorId)
. "$PSScriptRoot/common.ps1"
if ($ActorId -le 0) { throw 'ActorId must identify an existing user' }
$service=(Aws @('ecs','describe-services','--cluster','campusgo','--services','supplier-service')).services[0]
$source=(Aws @('ecs','describe-task-definition','--task-definition',$service.taskDefinition)).taskDefinition
$definition=@{}
foreach ($key in @('executionRoleArn','networkMode','containerDefinitions','requiresCompatibilities','cpu','memory','runtimePlatform')) { $definition[$key]=$source.$key }
$definition.family='campusgo-supplier-seed'
$definition.containerDefinitions[0].image='807733922601.dkr.ecr.ap-southeast-1.amazonaws.com/campusgo/supplier-service:backend-20261103-181855'
$csv=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot '../../data/csv/supplier-seed-data.csv')))
$code=@'
import { db } from "./src/prisma/db.ts";
const existing = await db.orm.public.Supplier.first();
await db.close();
if (existing) { console.log("Supplier database already contains data; seed skipped."); }
else {
  await Deno.writeTextFile("/tmp/suppliers.csv", atob("CSV_BASE64"));
  const result = await new Deno.Command("deno", {args:["run","-A","src/tasks/seedSuppliers.ts","/tmp/suppliers.csv","--actor-id=ACTOR_ID"],stdout:"inherit",stderr:"inherit"}).spawn().status;
  Deno.exit(result.code);
}
'@
$code=$code.Replace('CSV_BASE64',$csv).Replace('ACTOR_ID',[string]$ActorId)
$definition.containerDefinitions[0].command=@('deno','eval',$code)
$taskDefinition=(AwsRequest @('ecs','register-task-definition') $definition).taskDefinition.taskDefinitionArn
$result=AwsRequest @('ecs','run-task') @{cluster='campusgo';taskDefinition=$taskDefinition;launchType='FARGATE';count=1;networkConfiguration=$service.networkConfiguration}
if ($result.failures.Count) { throw ($result.failures | ConvertTo-Json) }
Write-Output $result.tasks[0].taskArn

[CmdletBinding()]
param(
    [ValidateSet('Prepare', 'Status')][string]$Action = 'Prepare',
    [string]$Profile = 'campusgo',
    [string]$Region = 'ap-southeast-1',
    [string]$EnvFile = (Join-Path $env:USERPROFILE 'Desktop\.env'),
    [string]$ImageTag = 'backend-20261103-181855',
    [string]$StateFile = (Join-Path $env:TEMP 'campusgo-backend-init-state.json')
)

$ErrorActionPreference = 'Stop'
$env:AWS_PAGER = ''

function Invoke-AwsJson {
    param([string[]]$Arguments)
    $output = & aws @Arguments --profile $Profile --region $Region --output json --no-cli-pager
    if ($LASTEXITCODE -ne 0) { throw "AWS operation failed: $($Arguments[0]) $($Arguments[1])" }
    if ($output) { return ($output -join "`n" | ConvertFrom-Json) }
}

function Invoke-AwsRequest {
    param([string[]]$Arguments, $Request)
    # Task definitions contain credentials. Never save them in the repository or print them.
    $requestPath = Join-Path $env:TEMP ('campusgo-request-' + [guid]::NewGuid() + '.json')
    try {
        [IO.File]::WriteAllText($requestPath, ($Request | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
        return Invoke-AwsJson ($Arguments + @('--cli-input-json', "file://$requestPath"))
    } finally {
        if (Test-Path -LiteralPath $requestPath) { Remove-Item -LiteralPath $requestPath }
    }
}

if ($Action -eq 'Status') {
    $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    foreach ($entry in $state) {
        $response = Invoke-AwsJson @('ecs', 'describe-tasks', '--cluster', 'campusgo', '--tasks', $entry.taskArn)
        if ($response.failures.Count -gt 0) { throw "Cannot inspect task for $($entry.service)" }
        $task = $response.tasks[0]
        $container = $task.containers | Where-Object name -eq $entry.container
        [pscustomobject]@{Service=$entry.service; Definition=$entry.taskDefinition; Status=$task.lastStatus; ExitCode=$container.exitCode; Reason=$task.stoppedReason} | Format-List
        if ($task.lastStatus -eq 'STOPPED') {
            $taskId = ($entry.taskArn -split '/')[-1]
            $logs = Invoke-AwsJson @('logs', 'get-log-events', '--log-group-name', $entry.logGroup, '--log-stream-name', "ecs/$($entry.container)/$taskId")
            $logs.events | Where-Object { $_.message -match '"kind":"result"|ERROR|error:|Error:' } | ForEach-Object { $_.message }
        }
    }
    return
}

$identity = Invoke-AwsJson @('sts', 'get-caller-identity')
if ($identity.Account -ne '807733922601') { throw 'Wrong AWS account; no changes made.' }
$source = Invoke-AwsJson @('ecs', 'describe-services', '--cluster', 'campusgo', '--services', 'supplier-service')
if ($source.services.Count -ne 1) { throw 'Expected the existing supplier service.' }
$supplier = $source.services[0]
$definition = (Invoke-AwsJson @('ecs', 'describe-task-definition', '--task-definition', $supplier.taskDefinition)).taskDefinition
$supplierContainer = $definition.containerDefinitions | Where-Object name -eq 'supplier'
$supplierEnv = @{}
foreach ($entry in $supplierContainer.environment) { $supplierEnv[$entry.name] = $entry.value }
foreach ($key in @('DATABASE_URL', 'JWT_ACCESS_SECRET')) {
    if (-not $supplierEnv[$key]) { throw "Supplier task definition is missing $key" }
}
$databaseUri = [Uri]$supplierEnv['DATABASE_URL']
if ($databaseUri.Host -ne 'campusgo-db.cl6e8ai2q2b9.ap-southeast-1.rds.amazonaws.com') {
    throw 'Supplier service still points to an unexpected RDS endpoint.'
}
if ($databaseUri.AbsolutePath -ne '/suppliers') { throw 'Unexpected source database.' }

$fileEnv = @{}
foreach ($line in (Get-Content -LiteralPath $EnvFile)) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $key = $matches[1]
        $value = $matches[2].Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
        elseif ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Substring(1, $value.Length - 2) }
        else { $value = ($value -replace '\s+#.*$', '').TrimEnd() }
        $fileEnv[$key] = $value
    }
}
foreach ($key in @('JWT_REFRESH_SECRET', 'JWT_ACCESS_TOKEN_TTL', 'JWT_REFRESH_TOKEN_TTL')) {
    if (-not $fileEnv[$key]) { throw "Environment file is missing $key" }
}

$services = @(
    @{Name='user'; Database='users'},
    @{Name='order'; Database='orders'},
    @{Name='credit'; Database='credit'}
)
$previous = @()
if (Test-Path -LiteralPath $StateFile) {
    $previous = @(Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json)
    foreach ($entry in $previous) {
        $task = (Invoke-AwsJson @('ecs', 'describe-tasks', '--cluster', 'campusgo', '--tasks', $entry.taskArn)).tasks
        if ($task -and $task[0].lastStatus -ne 'STOPPED') { throw 'An initialization task is still active. Use -Action Status first.' }
    }
}
$records = @()
foreach ($service in $services) {
    $name = $service.Name
    $serviceName = "$name-service"
    $image = "807733922601.dkr.ecr.$Region.amazonaws.com/campusgo/${serviceName}:$ImageTag"
    $null = Invoke-AwsJson @('ecr', 'describe-images', '--repository-name', "campusgo/$serviceName", '--image-ids', "imageTag=$ImageTag")
    $logGroup = "/ecs/campusgo-$name"
    $groups = Invoke-AwsJson @('logs', 'describe-log-groups', '--log-group-name-prefix', $logGroup)
    if (-not ($groups.logGroups | Where-Object logGroupName -eq $logGroup)) {
        $null = Invoke-AwsJson @('logs', 'create-log-group', '--log-group-name', $logGroup)
    }
    $null = Invoke-AwsJson @('logs', 'put-retention-policy', '--log-group-name', $logGroup, '--retention-in-days', '7')
    $dbUrl = $supplierEnv['DATABASE_URL'] -replace '/suppliers(?=\?|$)', "/$($service.Database)"
    $environment = @(
        @{name='PORT';value='3000'},
        @{name='NODE_ENV';value='production'},
        @{name='DATABASE_URL';value=$dbUrl},
        @{name='JWT_ACCESS_SECRET';value=$supplierEnv['JWT_ACCESS_SECRET']}
    )
    if ($name -eq 'user') {
        foreach ($key in @('JWT_REFRESH_SECRET', 'JWT_ACCESS_TOKEN_TTL', 'JWT_REFRESH_TOKEN_TTL')) {
            $environment += @{name=$key;value=$fileEnv[$key]}
        }
    }
    # Runtime messaging and service discovery are intentionally configured in the next stage.
    $request = @{
        family="campusgo-$name"; networkMode='awsvpc'; requiresCompatibilities=@('FARGATE')
        cpu='512'; memory='1024'; executionRoleArn=$definition.executionRoleArn
        runtimePlatform=@{cpuArchitecture='X86_64';operatingSystemFamily='LINUX'}
        containerDefinitions=@(@{
            name=$name; image=$image; essential=$true
            command=@('deno','run','-A','src/index.ts')
            portMappings=@(@{containerPort=3000;protocol='tcp';name="$name-http";appProtocol='http'})
            environment=$environment
            logConfiguration=@{logDriver='awslogs';options=@{'awslogs-group'=$logGroup;'awslogs-region'=$Region;'awslogs-stream-prefix'='ecs'}}
        })
    }
    $registered = Invoke-AwsRequest @('ecs','register-task-definition') $request
    $taskDefinitionArn = $registered.taskDefinition.taskDefinitionArn
    Write-Host "Registered campusgo-$name revision $($registered.taskDefinition.revision)"
    # Use the CLI installed in each image, including credit's newer Prisma version.
    # Initialization is additive; no db update, drops, or destructive migration flags.
    $init = 'deno run -A node_modules/prisma/dist/prisma.js contract emit && deno run -A node_modules/prisma/dist/prisma.js db init --no-interactive && deno run -A node_modules/prisma/dist/prisma.js db verify'
    $run = @{
        cluster='campusgo';taskDefinition=$taskDefinitionArn;launchType='FARGATE';count=1
        startedBy='campusgo-schema-init';networkConfiguration=$supplier.networkConfiguration
        overrides=@{containerOverrides=@(@{name=$name;command=@('sh','-c',$init)})}
    }
    $result = Invoke-AwsRequest @('ecs','run-task') $run
    if ($result.failures.Count -gt 0 -or $result.tasks.Count -ne 1) { throw "Could not launch initialization for $serviceName" }
    $records += [pscustomobject]@{service=$serviceName;container=$name;taskDefinition=$taskDefinitionArn;taskArn=$result.tasks[0].taskArn;logGroup=$logGroup}
    [IO.File]::WriteAllText($StateFile, (ConvertTo-Json -InputObject @($records) -Depth 6), [Text.UTF8Encoding]::new($false))
    Write-Host "Started initialization for $serviceName"
}
Write-Host 'All initialization tasks launched. Run this script with -Action Status to check results.'

[CmdletBinding()]
param(
    [ValidateSet('RabbitMQ','Grafana')][string]$Dashboard = 'Grafana',
    [string]$Profile = 'campusgo',
    [string]$Region = 'ap-southeast-1',
    [int]$LocalPort = 0,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$env:AWS_PAGER = ''
if (-not (Get-Command aws.exe -ErrorAction SilentlyContinue)) { throw 'Install AWS CLI v2 first.' }
if (-not (Get-Command session-manager-plugin -ErrorAction SilentlyContinue) -and
    (Test-Path 'C:/Program Files/Amazon/SessionManagerPlugin/bin/session-manager-plugin.exe')) {
    $env:PATH = 'C:/Program Files/Amazon/SessionManagerPlugin/bin;' + $env:PATH
}
if (-not (Get-Command session-manager-plugin -ErrorAction SilentlyContinue)) {
    throw 'Install the AWS Session Manager plugin, then reopen PowerShell. See monitoring/README.md.'
}
function ReadAws([string[]]$Arguments) {
    $output = & aws.exe @Arguments --profile $Profile --region $Region --output json
    if ($LASTEXITCODE -ne 0) { throw "AWS call failed. If your session expired, run: aws sso login --profile $Profile" }
    if ($output) { ($output -join "`n") | ConvertFrom-Json }
}
if ((ReadAws @('sts','get-caller-identity')).Account -ne '807733922601') { throw 'Wrong AWS account.' }
if ($Check) { Write-Output 'AWS identity and local prerequisites are ready.'; return }
$stack = (ReadAws @('cloudformation','describe-stacks','--stack-name','campusgo-network-broker')).Stacks[0]
$instance = ($stack.Outputs | Where-Object OutputKey -eq BrokerId).OutputValue
if (-not $instance) { throw 'Broker host not found.' }
if ($Dashboard -eq 'RabbitMQ') {
    # Resolve the container address each time; this does not restart or change RabbitMQ.
    $request = @{InstanceIds=@($instance);DocumentName='AWS-RunShellScript';Parameters=@{commands=@('docker inspect rabbitmq --format ''{{range .NetworkSettings.Networks}}{{.IPAddress}}{{println}}{{end}}''')}}
    $requestFile = Join-Path $env:TEMP ('campusgo-dashboard-' + [guid]::NewGuid() + '.json')
    try {
        [IO.File]::WriteAllText($requestFile, ($request | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
        $command = ReadAws @('ssm','send-command','--cli-input-json',"file://$requestFile")
    } finally { Remove-Item -LiteralPath $requestFile -ErrorAction SilentlyContinue }
    $result = $null
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Seconds 1
        $response = & aws.exe ssm get-command-invocation --command-id $command.Command.CommandId --instance-id $instance --profile $Profile --region $Region --output json 2>$null
        if ($LASTEXITCODE -ne 0) { continue }
        $result = ($response -join "`n") | ConvertFrom-Json
        if ($result.Status -in @('Success','Failed','Cancelled','TimedOut')) { break }
    }
    if ($result.Status -ne 'Success') { throw 'Could not resolve RabbitMQ container address.' }
    $remoteHost = ($result.StandardOutputContent.Trim() -split '\s+')[0]
    $address = $null
    if (-not [Net.IPAddress]::TryParse($remoteHost,[ref]$address)) { throw 'Invalid container address.' }
    $remotePort = 15672
} else {
    $tasks = ReadAws @('ecs','list-tasks','--cluster','campusgo','--service-name','monitoring-service','--desired-status','RUNNING')
    if ($tasks.taskArns.Count -ne 1) { throw 'Expected one running monitoring task. Wait for rollout to complete.' }
    $task = (ReadAws (@('ecs','describe-tasks','--cluster','campusgo','--tasks') + $tasks.taskArns)).tasks[0]
    $remoteHost = ($task.attachments.details | Where-Object name -eq privateIPv4Address).value
    if (-not $remoteHost) { throw 'Monitoring task private IP not available.' }
    $remotePort = 3000
}
if ($LocalPort -eq 0) { $LocalPort = $remotePort }
if ($LocalPort -lt 1024 -or $LocalPort -gt 65535) { throw 'Local port must be 1024-65535.' }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$LocalPort)
try { $listener.Start() } finally { $listener.Stop() }
$parameters = "host=$remoteHost,portNumber=$remotePort,localPortNumber=$LocalPort"
Write-Output "$Dashboard will be available at http://localhost:$LocalPort after the session reports readiness. Keep this terminal open; Ctrl+C closes the tunnel."
# The Windows plugin can hang connecting to its own AF_UNIX multiplexing socket.
# Its documented source falls back to TCP loopback when Unix socket creation fails.
# A temp path longer than sockaddr_un.sun_path selects that built-in fallback.
# This affects only this process and its children, not the user's system settings.
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$socketTemp = $null
try {
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $socketTemp = Join-Path $previousTemp ('campusgo-ssm-tcp-' + ('socket-fallback-' * 6))
        New-Item -ItemType Directory -Path $socketTemp -Force | Out-Null
        $env:TEMP = $socketTemp
        $env:TMP = $socketTemp
    }
    & aws.exe ssm start-session --target $instance --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters $parameters --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard tunnel exited unsuccessfully.' }
} finally {
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
    if ($socketTemp -and (Test-Path -LiteralPath $socketTemp)) {
        # Remove only an empty directory; never recursively delete plugin files.
        Remove-Item -LiteralPath $socketTemp -ErrorAction SilentlyContinue
    }
}

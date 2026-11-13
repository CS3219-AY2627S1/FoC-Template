#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile = 'foc-local', [switch] $Live)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Common.ps1"
Initialize-NetTools $Profile

if ($Live) {
    $namespace = 'foc-local'
    function Assert-LiveTcp([string] $Source, [string] $Target, [int] $Port, [bool] $Allowed) {
        # Fresh connections, no credentials, application mutations or synthetic business events.
        $null = & $script:NetMinikube -p $Profile kubectl -- "--context=$Profile" -n $namespace exec "deployment/$Source" -- `
            timeout 5 bash -c 'exec 3<>/dev/tcp/"$1"/"$2"' bash $Target "$Port" 2>&1
        $open = $LASTEXITCODE -eq 0
        if ($open -ne $Allowed) { throw "Unexpected TCP result: $Source -> ${Target}:$Port (expected allowed=$Allowed)." }
        Write-Host "PASS allowed=$Allowed $Source -> ${Target}:$Port"
    }
    foreach ($service in @('user', 'supplier', 'order', 'credit')) {
        Assert-LiveTcp "$service-service" "$service-db" 5432 $true
        if ($service -ne 'user') { Assert-LiveTcp "$service-service" user-service 8081 $true }
    }
    Assert-LiveTcp admin-service order-service 8082 $false
    Assert-LiveTcp order-service credit-service 8083 $false
    Assert-LiveTcp chat-service chat-db 5432 $true
    Assert-LiveTcp chat-service user-service 8081 $true
    Assert-LiveTcp chat-service kafka 9092 $true
    Assert-LiveTcp chat-service rabbitmq 5672 $true
    foreach ($service in @('user', 'order', 'credit')) { Assert-LiveTcp "$service-service" kafka 9092 $true }
    foreach ($pair in @(@('user-service',8081), @('supplier-service',8080), @('order-service',8082), @('credit-service',8083), @('chat-service',8085))) {
        Assert-LiveTcp gateway $pair[0] $pair[1] $true
    }
    Assert-LiveTcp notification-service notification-db 5432 $true
    Assert-LiveTcp notification-service user-service 8081 $true
    Assert-LiveTcp notification-service kafka 9092 $true
    Assert-LiveTcp gateway notification-service 8086 $true
    Assert-LiveTcp notification-service order-db 5432 $false
    Assert-LiveTcp order-service notification-db 5432 $false
    Assert-LiveTcp supplier-service user-db 5432 $false
    Assert-LiveTcp user-service supplier-db 5432 $false
    Assert-LiveTcp gateway user-db 5432 $false
    Assert-LiveTcp supplier-service kafka 9092 $false
    Assert-LiveTcp user-service credit-service 8083 $false
    Assert-LiveTcp user-service kafka-ui 8080 $false
    Assert-LiveTcp supplier-service api.sendgrid.com 443 $false
    $status = Invoke-NetKubectl @('-n', $namespace, 'exec', 'deployment/user-service', '--',
        'curl', '--silent', '--max-time', '20', '--output', '/dev/null', '--write-out', '%{http_code}',
        'https://api.sendgrid.com/v3/mail/send')
    if (($status -join '') -notmatch '^[2345][0-9]{2}$') { throw 'Public HTTPS/DNS to SendGrid failed.' }
    Write-Host 'PASS: SendGrid HTTPS is reachable (unauthenticated GET only; no email sent).'
    function Assert-LocalTunnel([string] $Service, [int] $Port, [hashtable] $Checks) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        $listener.Start(); $localPort=$listener.LocalEndpoint.Port; $listener.Stop()
        $tunnel = Start-Process -FilePath $script:NetMinikube -ArgumentList @('-p',$Profile,'kubectl','--',
            "--context=$Profile",'-n',$namespace,'port-forward',"service/$Service","${localPort}:$Port",'--address=127.0.0.1') `
            -WindowStyle Hidden -PassThru
        $handler=[Net.Http.HttpClientHandler]::new(); $handler.AllowAutoRedirect=$false
        $http=[Net.Http.HttpClient]::new($handler); $http.Timeout=[TimeSpan]::FromSeconds(10)
        try {
            foreach ($path in $Checks.Keys) {
                $status=0
                for($attempt=0;$attempt -lt 15;$attempt++) {
                    try { $response=$http.GetAsync("http://127.0.0.1:$localPort$path").GetAwaiter().GetResult(); $status=[int]$response.StatusCode; $response.Dispose() }
                    catch { if($tunnel.HasExited){throw 'Local verification tunnel exited.'} }
                    if($status -in $Checks[$path]){break}
                    Start-Sleep -Seconds 1
                }
                if($status -notin $Checks[$path]){throw "Unexpected administrative HTTP status: $Service $path -> $status"}
                Write-Host "PASS localhost administrative access: $Service $path -> $status"
            }
        } finally {
            $http.Dispose()
            if(-not $tunnel.HasExited){$tunnel.Kill($true);$tunnel.WaitForExit(5000) | Out-Null}
            $tunnel.Dispose()
        }
    }
    Assert-LocalTunnel gateway 8088 @{'/actuator/health'=@(200);'/'=@(200);'/api/users/me'=@(401);'/suppliers'=@(200);'/credits'=@(200)}
    Assert-LocalTunnel kafka-ui 8080 @{'/login'=@(200);'/api/clusters'=@(302,401,403)}
    return
}

$runId = [guid]::NewGuid().ToString('N').Substring(0,12)
$namespace = "foc-netpol-test-$runId"
try {
    Send-NetDocument @{ apiVersion='v1'; kind='Namespace'; metadata=@{
        name=$namespace; labels=@{ 'foc/network-test-owner'=$runId }
    }} -Arguments @('create','-f','-')
    # Small listeners model the real pod labels and ports, not the business applications/data.
    $roles = [ordered]@{
        gateway=@(8088); 'user-service'=@(8081); 'supplier-service'=@(8080)
        'order-service'=@(8082); 'credit-service'=@(8083); 'admin-service'=@(8084); 'chat-service'=@(8085)
        'admin-db'=@(5432); 'chat-db'=@(5432); rabbitmq=@(5672,15672)
        'notification-service'=@(8086); 'notification-db'=@(5432)
        'user-db'=@(5432); 'supplier-db'=@(5432); 'order-db'=@(5432); 'credit-db'=@(5432)
        kafka=@(9092,9093); 'kafka-ui'=@(8080); 'kafka-init'=@(9999)
    }
    $resources = @()
    foreach ($role in $roles.Keys) {
        $commands = @($roles[$role] | ForEach-Object { "httpd -p $_" }) -join '; '
        $resources += @{ apiVersion='v1'; kind='Pod'; metadata=@{
            name=$role; namespace=$namespace; labels=@{app=$role}
        }; spec=@{
            automountServiceAccountToken=$false; restartPolicy='Never'
            containers=@(@{name='probe'; image='busybox:1.37.0'; command=@('sh','-c',"$commands; exec sleep 900")
                resources=@{requests=@{cpu='5m';memory='8Mi'};limits=@{cpu='100m';memory='32Mi'}}
                securityContext=@{runAsUser=1000;runAsNonRoot=$true;allowPrivilegeEscalation=$false;capabilities=@{drop=@('ALL')}}
            })
        }}
        $resources += @{apiVersion='v1';kind='Service';metadata=@{name=$role;namespace=$namespace};spec=@{
            selector=@{app=$role};ports=@($roles[$role] | ForEach-Object {@{name="tcp-$_";port=$_;targetPort=$_}})
        }}
    }
    Send-NetDocument @{apiVersion='v1';kind='List';items=$resources}
    Invoke-NetKubectl @('-n',$namespace,'wait','--for=condition=Ready','pod','--all','--timeout=180s')
    function Assert-TestTcp([string] $Source, [string] $Target, [int] $Port, [bool] $Allowed) {
        $attempts=if($Allowed){3}else{1}
        for($attempt=0;$attempt -lt $attempts;$attempt++) {
            $null = & $script:NetMinikube -p $Profile kubectl -- "--context=$Profile" -n $namespace exec $Source -- nc -z -w 5 $Target "$Port" 2>&1
            $open = $LASTEXITCODE -eq 0
            if($open -or $attempt+1 -eq $attempts){break}
            # Allow a loaded local policy/DNS controller to converge; never retry away a denial failure.
            Start-Sleep -Seconds 2
        }
        if ($open -ne $Allowed) { throw "Unexpected isolated result: $Source -> ${Target}:$Port (allowed=$Allowed)." }
        Write-Host "PASS allowed=$Allowed $Source -> ${Target}:$Port"
    }
    # Prove forbidden destinations really are listening BEFORE applying the same policy files.
    Assert-TestTcp supplier-service user-db 5432 $true
    Assert-TestTcp gateway user-db 5432 $true
    Assert-TestTcp supplier-service kafka 9092 $true
    Assert-TestTcp user-service kafka-ui 8080 $true
    Assert-TestTcp gateway admin-db 5432 $true
    Assert-TestTcp admin-service user-db 5432 $true
    Assert-TestTcp order-service notification-db 5432 $true
    Assert-TestTcp notification-service order-db 5432 $true
    Send-NetDocument (Get-NetPolicies $namespace) -Arguments @('apply','--dry-run=server','-f','-')
    Send-NetDocument (Get-NetPolicies $namespace)
    Start-Sleep -Seconds 3
    foreach ($service in @('user','supplier','order','credit')) {
        Assert-TestTcp "$service-service" "$service-db" 5432 $true
        if ($service -ne 'user') { Assert-TestTcp "$service-service" user-service 8081 $true }
    }
    foreach ($pair in @(@('user-service',8081),@('supplier-service',8080),@('order-service',8082),@('credit-service',8083),@('chat-service',8085))) {
        Assert-TestTcp gateway $pair[0] $pair[1] $true
    }
    foreach ($service in @('user-service','order-service','credit-service','chat-service','kafka-ui','kafka-init')) {
        Assert-TestTcp $service kafka 9092 $true
    }
    Assert-TestTcp kafka kafka 9093 $true
    Assert-TestTcp gateway admin-service 8084 $true
    Assert-TestTcp admin-service admin-db 5432 $true
    Assert-TestTcp admin-service user-service 8081 $true
    Assert-TestTcp admin-service kafka 9092 $true
    Assert-TestTcp admin-service chat-service 8085 $true
    Assert-TestTcp admin-service order-service 8082 $false
    Assert-TestTcp order-service credit-service 8083 $false
    Assert-TestTcp admin-service credit-service 8083 $false
    Assert-TestTcp chat-service chat-db 5432 $true
    Assert-TestTcp chat-service user-service 8081 $true
    Assert-TestTcp chat-service kafka 9092 $true
    Assert-TestTcp chat-service rabbitmq 5672 $true
    Assert-TestTcp gateway notification-service 8086 $true
    Assert-TestTcp notification-service notification-db 5432 $true
    Assert-TestTcp notification-service user-service 8081 $true
    Assert-TestTcp notification-service kafka 9092 $true
    Assert-TestTcp notification-service order-db 5432 $false
    Assert-TestTcp notification-service order-service 8082 $false
    Assert-TestTcp order-service notification-db 5432 $false
    Assert-TestTcp gateway notification-db 5432 $false
    Assert-TestTcp chat-service notification-db 5432 $false
    Assert-TestTcp user-service notification-service 8086 $false
    Assert-TestTcp admin-service user-db 5432 $false
    Assert-TestTcp gateway admin-db 5432 $false
    Assert-TestTcp user-service admin-db 5432 $false
    Assert-TestTcp supplier-service admin-service 8084 $false
    foreach ($pair in @(@('supplier-service','user-db',5432),@('gateway','user-db',5432),
            @('user-service','supplier-db',5432),@('supplier-service','kafka',9092),
            @('user-service','credit-service',8083),@('user-service','kafka-ui',8080),
            @('kafka-ui','user-db',5432),@('kafka-init','user-db',5432))) {
        Assert-TestTcp $pair[0] $pair[1] $pair[2] $false
    }
    # Query an explicit A record: BusyBox short-name/AAAA search behaviour can report
    # failure after a successful A answer. Validate the requested Service IP too.
    $expectedIp = (Invoke-NetKubectl @('-n',$namespace,'get','service','user-db','-o','jsonpath={.spec.clusterIP}')) -join ''
    $answer = Invoke-NetKubectl @('-n',$namespace,'exec','user-service','--','nslookup','-type=A',"user-db.$namespace.svc.cluster.local.")
    if(($answer -join "`n") -notmatch [regex]::Escape($expectedIp)){throw 'DNS did not return the expected test Service IP.'}
    $dns = (Invoke-NetKubectl @('-n','kube-system','get','service','kube-dns','-o','jsonpath={.spec.clusterIP}')) -join ''
    Assert-TestTcp user-service $dns 53 $true
    Write-Host 'PASS: isolated allow/deny matrix, DNS and initializer access. Enforcement is active.'
} finally {
    $owner = (Invoke-NetKubectl @('get','namespace',$namespace,'--ignore-not-found','-o','jsonpath={.metadata.labels.foc/network-test-owner}')) -join ''
    if ($owner -eq $runId -and $namespace -eq "foc-netpol-test-$runId") {
        Invoke-NetKubectl @('delete','namespace',$namespace,'--wait=false')
    } else { Write-Warning "Cleanup refused: ownership of $namespace not confirmed." }
}

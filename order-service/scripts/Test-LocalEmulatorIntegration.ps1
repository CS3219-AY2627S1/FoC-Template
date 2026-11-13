param([string]$Gateway = 'http://127.0.0.1:8080')

# CHANGE-105: real applications, local emulators, fresh test users only.
# Creates test users/orders; never resets databases or changes cloud resources.
$ErrorActionPreference = 'Stop'
if ($Gateway -ne 'http://127.0.0.1:8080' -and $Gateway -ne 'http://localhost:8080') {
    throw 'This test is restricted to the local gateway; do not target staging/production.'
}
$script:checks = 0
function Assert-That($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}
function Send-Json([string]$Method, [string]$Url, $Body, [string]$Token = '') {
    $requestOptions = @{Method=$Method; Uri=$Url; ContentType='application/json; charset=utf-8'; TimeoutSec=20}
    if ($Token) { $requestOptions.Headers = @{Authorization="Bearer $Token"} }
    if ($null -ne $Body) { $requestOptions.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)) }
    try { Invoke-RestMethod @requestOptions } catch {
        $detail = $_.ErrorDetails.Message
        if (-not $detail -and $_.Exception.Response) {
            $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            try { $detail = $reader.ReadToEnd() } finally { $reader.Dispose() }
        }
        throw "$Method $Url failed: $detail"
    }
}
function New-TestUser {
    $suffix = [guid]::NewGuid().ToString('N')
    $email = "change105-$suffix@u.nus.edu"
    $auth = Send-Json POST 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key' @{
        email=$email; password=([guid]::NewGuid().ToString('N')+'aA1!'); returnSecureToken=$true
    }
    $null = Send-Json POST "$Gateway/api/users" @{userId=$auth.localId; email=$email} $auth.idToken
    return @{uid=$auth.localId; token=$auth.idToken}
}
function Assert-HttpStatus([string]$Method, [string]$Path, [int]$Expected, $Body = $null, [string]$Token = '') {
    $probeOptions = @{Method=$Method; Uri="$Gateway$Path"; ContentType='application/json'; UseBasicParsing=$true; TimeoutSec=20}
    if ($Token) { $probeOptions.Headers = @{Authorization="Bearer $Token"} }
    if ($null -ne $Body) { $probeOptions.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)) }
    $status = 0
    try { $status = [int](Invoke-WebRequest @probeOptions).StatusCode }
    catch {
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode } else { throw }
    }
    Assert-That ($status -eq $Expected) "$Method $Path expected $Expected, received $status."
}
function Balance($User) { Send-Json GET "$Gateway/api/credits/me" $null $User.token }
function Wait-CreditAccount($User) {
    for ($i=0; $i -lt 180; $i++) {
        try {
            $balance = Invoke-RestMethod -Method GET -Uri "$Gateway/api/credits/me" `
                -Headers @{Authorization="Bearer $($User.token)"} -TimeoutSec 20
            if ($balance.totalBalance -eq 50 -and $balance.reservedBalance -eq 0) {
                Assert-That $true 'Credit account provisioned from UserCreated event'; return
            }
        } catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($status -ne 404) { throw }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Credit account was not provisioned within 90 seconds of User Service registration.'
}
function Wait-Balance($User, [long]$Total, [long]$Reserved) {
    for ($i=0; $i -lt 30; $i++) {
        $balance = Balance $User
        if ($balance.totalBalance -eq $Total -and $balance.reservedBalance -eq $Reserved) {
            Assert-That $true 'Credit balance'; return
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Credit did not reach the expected balance after actual Pub/Sub delivery.'
}
function New-OrderBody($User) {
    $expiry = [DateTime]::UtcNow.AddMinutes(60)
    $expiry = $expiry.AddMinutes((15 - ($expiry.Minute % 15)) % 15)
    $expiry = [DateTime]::SpecifyKind([DateTime]::new($expiry.Year,$expiry.Month,$expiry.Day,$expiry.Hour,$expiry.Minute,0),[DateTimeKind]::Utc)
    return @{commandId=[guid]::NewGuid().ToString(); requesterId=$User.uid;
        itemDescription='CHANGE-105 real Compose verification'; pickupSupplierId=$script:pickup;
        deliverySupplierId=$script:delivery; offeredCredits=5; deliveryTimeLimitMinutes=15;
        expiresAt=$expiry.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"); automaticRepost=$false;
        repostCreditAmount=0; repostDeliveryDurationMinutes=0}
}
function Act($Order, [string]$Action, $User, [string]$Key = ([guid]::NewGuid().ToString())) {
    Send-Json POST "$Gateway/api/orders/$($Order.id)/$Action" @{
        commandId=$Key; actorId=$User.uid; expectedVersion=$Order.version
    } $User.token
}

$requester = New-TestUser
$courier = New-TestUser
Wait-CreditAccount $requester
Wait-CreditAccount $courier
Assert-HttpStatus GET '/api/credits/me' 401
Assert-HttpStatus GET '/api/orders/internal/outbox/failed' 403 $null $requester.token
$context = Send-Json GET "$Gateway/api/users/role-context" $null $requester.token
Assert-That ($context.userId -eq $requester.uid -and $context.roles -contains 'requester') 'Actual User role lookup failed.'
$catalog = Send-Json GET "$Gateway/api/suppliers" $null $requester.token
$items = if ($catalog.items) { @($catalog.items) } elseif ($catalog.content) { @($catalog.content) } else { @($catalog) }
$active = @($items | Where-Object { $_.active -ne $false })
Assert-That ($active.Count -ge 2) 'Need two active actual Supplier catalogue entries.'
$script:pickup = $active[0].id
$script:delivery = $active[1].id
if (-not $script:pickup) { $script:pickup = $active[0].supplierId; $script:delivery = $active[1].supplierId }
Assert-That ($script:pickup -and $script:delivery -and $script:pickup -ne $script:delivery) 'Supplier IDs must differ.'
$caps = Send-Json GET "$Gateway/api/orders/commands/capabilities" $null $requester.token
Assert-That ($caps.enabled -and $caps.protocol -eq 'credit-command-v1') 'Live command protocol must be enabled.'

$body = New-OrderBody $requester
$oversized = $body.Clone()
$oversized.commandId = ('x' * 129)
Assert-HttpStatus POST '/api/orders' 400 $oversized $requester.token
$opened = Send-Json POST "$Gateway/api/orders" $body $requester.token
Assert-That ($opened.status -eq 'OPEN') 'Legacy creation must use the durable coordinator and return OPEN.'
$replay = Send-Json POST "$Gateway/api/orders" $body $requester.token
Assert-That ($replay.id -eq $opened.id) 'Creation replay changed the candidate ID.'
Wait-Balance $requester 50 5
$historical = Send-Json GET "$Gateway/api/credits/commands/$($body.commandId)" $null $requester.token
Assert-That ($historical.orderId -eq $opened.id -and $historical.outcome -eq 'APPLIED') 'Actual Credit saved-command lookup failed.'
$cancelled = Act $opened cancel $requester
Assert-That ($cancelled.status -eq 'CANCELLED') 'Cancellation did not finalize.'
Wait-Balance $requester 50 0
Assert-HttpStatus GET "/api/orders/$($cancelled.id)" 404 $null $courier.token
Assert-HttpStatus GET "/api/orders/$($cancelled.id)" 200 $null $requester.token
Write-Output 'PASS actual creation/replay/cancellation/refund'

$opened = Send-Json POST "$Gateway/api/orders" (New-OrderBody $requester) $requester.token
$accepted = Act $opened accept $courier
Assert-That ($accepted.status -eq 'ACCEPTED' -and $accepted.courierId -eq $courier.uid) 'Actual courier assignment failed.'
$aborted = Act $accepted cancel-accepted $courier
Assert-That ($aborted.status -eq 'OPEN' -and $aborted.id -eq $opened.id -and -not $aborted.courierId) 'Abort should reopen same business ID.'
Wait-Balance $requester 50 5
$accepted = Act $aborted accept $courier
Assert-That ($accepted.status -eq 'ACCEPTED') 'New acceptance after durable clear failed.'
$started = Act $accepted start $courier
$picked = Act $started pickup $courier
$delivered = Act $picked deliver $courier
Assert-That ($delivered.status -eq 'DELIVERED') 'Courier progress flow failed.'
$completionKey = [guid]::NewGuid().ToString()
$completed = Act $delivered complete $requester $completionKey
Assert-That ($completed.status -eq 'COMPLETED') 'Completion failed.'
$replayed = Act $delivered complete $requester $completionKey
Assert-That ($replayed.id -eq $completed.id) 'Completion replay changed order.'
Wait-Balance $requester 45 0
Wait-Balance $courier 55 0
Write-Output 'PASS actual acceptance/abort/reaccept/progress/completion/transfer'
Write-Output "PASS $script:checks assertions. Fresh local test accounts/orders are retained. No tokens printed."

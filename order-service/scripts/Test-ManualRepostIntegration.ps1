param([string]$Gateway = 'http://127.0.0.1:8080')

# CHANGE-106: actual local User/Supplier/Order/Credit + Auth/PubSub emulators.
# Fresh fixtures only. No cloud action, token logging or volume/database reset.
# Run from the Compose root after rebuilding Order/frontend. The sole SQL fixture
# changes this test's newly created Order expiry so the normal minute job can run.
. "$PSScriptRoot/Test-LocalEmulatorIntegration.ps1" -Gateway $Gateway
$manualUser = New-TestUser
$original = Send-Json POST "$Gateway/api/orders" (New-OrderBody $manualUser) $manualUser.token
if ($original.id -notmatch '^[a-fA-F0-9-]{36}$' -or $manualUser.uid -notmatch '^[A-Za-z0-9_-]{1,128}$') {
    throw 'Unexpected fixture identity; refusing SQL setup.'
}
$configJson = (& docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml config --format json 2>$null) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect local Compose configuration.' }
$dbEnvironment = ($configJson | ConvertFrom-Json).services.'order-postgres'.environment
$sql = "UPDATE orders SET expires_at=clock_timestamp()-interval '1 second' WHERE id='$($original.id)' AND requester_id='$($manualUser.uid)' AND status='OPEN';"
& docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml exec -T order-postgres psql -U $dbEnvironment.POSTGRES_USER -d $dbEnvironment.POSTGRES_DB -v ON_ERROR_STOP=1 -c $sql
if ($LASTEXITCODE -ne 0) { throw 'Fixture expiry update failed.' }
$expired = $null
for ($attempt=0; $attempt -lt 70; $attempt++) {
    $current = Send-Json GET "$Gateway/api/orders/$($original.id)" $null $manualUser.token
    if ($current.status -eq 'EXPIRED') { $expired=$current; break }
    Start-Sleep -Seconds 1
}
Assert-That ($null -ne $expired) 'The actual minute scheduler did not expire the fixture.'
Wait-Balance $manualUser 50 0
$key = [guid]::NewGuid().ToString()
$request = @{commandId=$key; actorId=$manualUser.uid; expectedVersion=$expired.version;
    itemDescription='CHANGE-106 durable manual repost'; offeredCredits=5; deliveryTimeLimitMinutes=15;
    expiresAt=(New-OrderBody $manualUser).expiresAt}
$completed = Send-Json POST "$Gateway/api/orders/commands/$($expired.id)/repost" $request $manualUser.token
Assert-That ($completed.status -eq 'COMPLETED' -and $completed.outcome -eq 'SUCCESS') 'Durable manual repost did not succeed.'
$successor = $completed.result
Assert-That ($successor.status -eq 'OPEN' -and $successor.id -ne $expired.id -and $successor.originalOrderId -eq $expired.id) 'Repost successor identity/status is wrong.'
$replay = Send-Json POST "$Gateway/api/orders/commands/$($expired.id)/repost" $request $manualUser.token
Assert-That ($replay.result.id -eq $successor.id) 'Command replay created another successor.'
$legacyReplay = Send-Json POST "$Gateway/api/orders/$($expired.id)/repost" $request $manualUser.token
Assert-That ($legacyReplay.id -eq $successor.id) 'Legacy repost bypassed the saved command.'
$historical = Send-Json GET "$Gateway/api/credits/commands/$key" $null $manualUser.token
Assert-That ($historical.operation -eq 'RESERVE' -and $historical.outcome -eq 'APPLIED' -and $historical.orderId -eq $successor.id) 'Actual Credit did not bind RESERVE to the new candidate.'
$old = Send-Json GET "$Gateway/api/orders/$($expired.id)" $null $manualUser.token
Assert-That ($old.status -eq 'EXPIRED' -and $old.repostedOrderId -eq $successor.id) 'Original history/link was not retained.'
$list = Send-Json GET "$Gateway/api/orders/mine?userId=$($manualUser.uid)&mode=requester&page=1&size=20" $null $manualUser.token
Assert-That (@($list.items | Where-Object id -eq $expired.id).Count -eq 0) 'Linked expired original is still visible in My Requests.'
Assert-That (@($list.items | Where-Object id -eq $successor.id).Count -eq 1) 'My Requests must contain one successor.'
Wait-Balance $manualUser 50 5
# Leave a terminal, refunded fixture rather than a reserved test task.
$cancelled = Act $successor cancel $manualUser
Assert-That ($cancelled.status -eq 'CANCELLED') 'Successor cancellation failed.'
Wait-Balance $manualUser 50 0
Write-Output "PASS manual repost and inherited regression: $script:checks assertions. Fresh fixtures retained; no tokens printed."

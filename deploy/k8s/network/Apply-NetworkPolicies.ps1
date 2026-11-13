#Requires -Version 7.2
[CmdletBinding()]
param([string] $Profile='foc-local')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Common.ps1"
Initialize-NetTools $Profile
Invoke-NetKubectl @('get','namespace','foc-local','-o','name') | Out-Null
$existing = (Invoke-NetKubectl @('-n','foc-local','get','networkpolicies','-o','json') -join "`n") | ConvertFrom-Json
foreach ($policy in $existing.items) {
    if ($policy.metadata.labels.'foc/network-isolation' -ne 'v1') {
        throw 'Additional NetworkPolicies need review: allow rules are additive. Nothing applied.'
    }
}
$daemonsets = (Invoke-NetKubectl @('get','daemonsets','-A','-o','json') -join "`n") | ConvertFrom-Json
if ($daemonsets.items.metadata.name -match 'calico|cilium|kube-router') {
    throw 'Another network provider is present. Review enforcement; do not install two policy engines.'
}
$agent = $daemonsets.items | Where-Object { $_.metadata.name -eq 'kube-network-policies' }
if ($agent -and $agent.metadata.labels.'foc/network-component' -ne 'enforcer') {
    throw 'An unmanaged policy agent already exists; refusing to overwrite it.'
}
Invoke-NetKubectl @('apply','--dry-run=server','-f',"$PSScriptRoot/enforcer.yaml")
Invoke-NetKubectl @('apply','-f',"$PSScriptRoot/enforcer.yaml")
Invoke-NetKubectl @('-n','kube-system','rollout','status','daemonset/kube-network-policies','--timeout=180s')
# Do not isolate business pods until a disposable positive/negative test proves enforcement.
& "$PSScriptRoot/Test-NetworkPolicies.ps1" -Profile $Profile
$policies = Get-NetPolicies 'foc-local'
Send-NetDocument $policies -Arguments @('apply','--dry-run=server','-f','-')
try {
    Send-NetDocument $policies
    & "$PSScriptRoot/Test-NetworkPolicies.ps1" -Profile $Profile -Live
} catch {
    # Remove only this feature's allow/deny policies, never storage or application resources.
    Invoke-NetKubectl @('-n','foc-local','delete','networkpolicy','-l','foc/network-isolation=v1','--wait=true')
    throw "Live checks failed; this feature's policies were removed. $($_.Exception.Message)"
}
Write-Host 'Network isolation applied and verified; no business images, credentials or data changed.'

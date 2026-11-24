[CmdletBinding()]
param([string] $Bicep = 'bicep')
$ErrorActionPreference = 'Stop'

function Compile-Template([string] $name) {
    $json = & $Bicep build (Join-Path $PSScriptRoot "$name.bicep") --stdout
    if ($LASTEXITCODE -ne 0) { throw "Bicep compilation failed for $name." }
    return ($json -join "`n") | ConvertFrom-Json
}

$main = Compile-Template 'main'
$budget = Compile-Template 'budget'
$db = $main.resources | Where-Object type -eq 'Microsoft.DBforPostgreSQL/flexibleServers'
$vm = $main.resources | Where-Object type -eq 'Microsoft.Compute/virtualMachines'
$nsg = $main.resources | Where-Object type -eq 'Microsoft.Network/networkSecurityGroups'
$ip = $main.resources | Where-Object type -eq 'Microsoft.Network/publicIPAddresses'
$rules = $nsg.properties.securityRules
if ($main.parameters.postgresAdminPassword.type -ne 'secureString' -or
    $db.properties.version -ne '17' -or $db.properties.storage.storageSizeGB -ne 32 -or
    $db.properties.network.publicNetworkAccess -ne 'Disabled' -or
    -not $db.properties.network.privateDnsZoneArmResourceId -or -not $db.properties.network.delegatedSubnetResourceId -or
    $vm.properties.osProfile.linuxConfiguration.disablePasswordAuthentication -ne $true -or
    $vm.properties.storageProfile.imageReference.version -ne "[parameters('ubuntuImageVersion')]" -or
    $ip.sku.name -ne 'Standard' -or $ip.properties.publicIPAllocationMethod -ne 'Static' -or
    ($rules | Where-Object name -eq 'deny-other-inbound').properties.access -ne 'Deny') {
    throw 'Compiled infrastructure template violated an acceptance invariant.'
}
$alerts = $budget.resources.properties.notifications
if ($alerts.actual50.threshold -ne 50 -or $alerts.actual80.threshold -ne 80 -or
    $alerts.actual100.threshold -ne 100 -or $alerts.forecast100.threshold -ne 100 -or
    $alerts.forecast100.thresholdType -ne 'Forecasted') {
    throw 'Compiled budget template did not preserve the expected alerts.'
}
Write-Output 'Both templates compiled and placement, security, and cost alert invariants passed.'

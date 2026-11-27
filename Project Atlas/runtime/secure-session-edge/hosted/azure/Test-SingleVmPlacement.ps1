[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ResourceGroup,
    [Parameter(Mandatory)] [string] $OperatorSshCidr,
    [Parameter(Mandatory)] [string] $UbuntuImageVersion
)

$ErrorActionPreference = 'Stop'
if ($ResourceGroup -cne 'rg-atlas-mos140c-acceptance') {
    throw 'Select the exact synthetic acceptance resource group.'
}
if ($UbuntuImageVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw 'Supply the exact verified Ubuntu image version.'
}
if ($OperatorSshCidr -notmatch '^(?<address>(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3})/32$') {
    throw 'Supply an explicit IPv4 /32 for operator SSH.'
}
$parsedAddress = $null
if (![System.Net.IPAddress]::TryParse($Matches.address, [ref] $parsedAddress) -or
    $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    [System.Net.IPAddress]::IsLoopback($parsedAddress) -or $parsedAddress.Equals([System.Net.IPAddress]::Any)) {
    throw 'Supply a valid operator IPv4 address.'
}
Write-Output 'Acceptance resource group and SSH /32 syntax verified. Confirm both values in Portal.'

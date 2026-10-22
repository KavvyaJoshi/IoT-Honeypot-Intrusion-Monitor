<#
.SYNOPSIS
  Adds, shows or removes a narrowly scoped Windows Firewall rule so an ESP8266 on the local
  network can reach the honeypot API. Never disables the firewall or opens the port to "Any".

.EXAMPLE
  # Show current rules (no admin needed)
  powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1

.EXAMPLE
  # Phone hotspot (trusted, Private profile): allow only the local subnet  (run as Administrator)
  powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1 -Action Add

.EXAMPLE
  # College Wi-Fi: allow ONLY the ESP8266's IP (run as Administrator), remove after the demo
  powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1 -Action Add -RemoteAddress 10.20.5.42 -NetworkProfile Public
  powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1 -Action Remove
#>
param(
  [ValidateSet('Show', 'Add', 'Remove')]
  [string]$Action = 'Show',

  [ValidateRange(1, 65535)]
  [int]$Port = 4000,

  # "LocalSubnet" or a single IPv4 address / IPv4 CIDR. "Any" and wildcards are refused.
  [string]$RemoteAddress = 'LocalSubnet',

  [ValidateSet('Private', 'Public', 'Domain')]
  [string]$NetworkProfile = 'Private'
)

$ErrorActionPreference = 'Stop'
$Group = 'IoT Honeypot'
$Name = "IoT Honeypot API (TCP $Port)"

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-Rules {
  Write-Host "Rules in group '$Group':"
  $rules = Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue
  if (-not $rules) { Write-Host '  (none)' }
  foreach ($rule in $rules) {
    $port = ($rule | Get-NetFirewallPortFilter).LocalPort
    $addr = ($rule | Get-NetFirewallAddressFilter).RemoteAddress -join ', '
    $app = ($rule | Get-NetFirewallApplicationFilter).Program
    Write-Host ("  {0}  enabled={1}  profile={2}  port={3}  remote={4}  program={5}" -f $rule.DisplayName, $rule.Enabled, $rule.Profile, $port, $addr, $app)
  }
  $broad = Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
    Where-Object { $_.Program -like '*node.exe' } |
    Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.Group -ne $Group -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and $_.Enabled -eq 'True' }
  if ($broad) {
    Write-Host ''
    Write-Warning 'Other inbound ALLOW rules exist for node.exe (often created by the "Allow access" prompt). They may open every Node.js port. Review them in "Windows Defender Firewall with Advanced Security":'
    foreach ($rule in $broad) { Write-Host ("  {0}  profile={1}" -f $rule.DisplayName, $rule.Profile) }
  }
  Write-Host ''
  Write-Host 'Network profiles of active connections:'
  Get-NetConnectionProfile | ForEach-Object { Write-Host ("  {0} ({1}): {2}" -f $_.InterfaceAlias, $_.Name, $_.NetworkCategory) }
}

if ($Action -eq 'Show') { Show-Rules; exit 0 }

if (-not (Test-Admin)) {
  Write-Error 'Adding or removing firewall rules requires an elevated (Run as Administrator) PowerShell.'
}

if ($Action -eq 'Remove') {
  Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host "Removed all rules in group '$Group'."
  exit 0
}

# Add
$isIpOrCidr = $RemoteAddress -match '^(\d{1,3}\.){3}\d{1,3}(/(3[0-2]|[12]?\d))?$'
if ($RemoteAddress -ne 'LocalSubnet' -and -not $isIpOrCidr) {
  Write-Error "RemoteAddress must be 'LocalSubnet', an IPv4 address or an IPv4 CIDR. Got '$RemoteAddress'."
}
if ($RemoteAddress -match '^0\.0\.0\.0(/0)?$') { Write-Error 'Refusing to open the port to every address.' }
if ($NetworkProfile -eq 'Public' -and $RemoteAddress -eq 'LocalSubnet') {
  Write-Warning 'On a Public network (e.g. college Wi-Fi) prefer -RemoteAddress <ESP8266 IP> so only the board can connect.'
}

$node = (Get-Command node -ErrorAction Stop).Source
Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $Name -Group $Group -Description 'Mini IoT Honeypot backend API for an ESP8266 on the local network. Remove after the demo.' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress $RemoteAddress `
  -Profile $NetworkProfile -Program $node | Out-Null
Write-Host "Added '$Name': TCP $Port, remote $RemoteAddress, profile $NetworkProfile, program $node"
Show-Rules

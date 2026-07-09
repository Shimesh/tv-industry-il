param(
  [int]$WatchMinutes = 30,
  [int]$ProbeIntervalSeconds = 15,
  [switch]$OpenUrbanVpn,
  [switch]$RunSync,
  [switch]$ForceSync
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogFile = Join-Path $LogDir 'calendar-route-watcher.log'

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format o), $Message
  $line | Tee-Object -FilePath $LogFile -Append
}

function Test-HerzliyaRoute {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('hsil.acc.co.il', 5443)
    if (-not $task.Wait(5000)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Open-UrbanVpnIfAvailable {
  $candidates = @(
    'C:\Program Files\UrbanVPN\bin\urban-vpn-app.exe',
    'C:\Program Files (x86)\UrbanVPN\bin\urban-vpn-app.exe'
  )
  $urbanVpn = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $urbanVpn) {
    Write-Log 'UrbanVPN executable was not found.'
    return
  }

  $running = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -eq 'urban-vpn-app' } |
    Select-Object -First 1

  if ($running) {
    Write-Log 'UrbanVPN is already running.'
    return
  }

  Write-Log "Opening UrbanVPN: $urbanVpn"
  Start-Process -FilePath $urbanVpn
}

function Get-RouteSnapshot {
  $vpnAdapters = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'Urban|VPN|TAP|Wire|Tunnel|OpenVPN|Wintun|Local Area Connection' -or $_.InterfaceDescription -match 'Urban|VPN|TAP|Wire|Tunnel|OpenVPN|Wintun' } |
    ForEach-Object { "{0}={1}" -f $_.InterfaceDescription, $_.Status }
  if ($vpnAdapters) { return ($vpnAdapters -join '; ') }
  return 'no vpn adapter detected'
}

if ($OpenUrbanVpn) {
  Open-UrbanVpnIfAvailable
}

$deadline = (Get-Date).AddMinutes($WatchMinutes)
Write-Log "Watching Herzliya route for up to $WatchMinutes minutes. VPN: $(Get-RouteSnapshot)"

while ((Get-Date) -lt $deadline) {
  if (Test-HerzliyaRoute) {
    Write-Log 'Herzliya TCP route is open.'
    if ($RunSync) {
      $syncScript = Join-Path $Root 'scripts\run-local-calendar-sync.ps1'
      $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $syncScript)
      if ($ForceSync) { $args += '-Force' }
      Write-Log "Starting local calendar sync. ForceSync=$ForceSync"
      $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
      Write-Log "Local calendar sync finished with exit code $($proc.ExitCode)."
      exit $proc.ExitCode
    }
    exit 0
  }

  Write-Log "Herzliya route is still closed. VPN: $(Get-RouteSnapshot)"
  Start-Sleep -Seconds $ProbeIntervalSeconds
}

Write-Log 'Timed out while waiting for a reachable Herzliya route.'
exit 2

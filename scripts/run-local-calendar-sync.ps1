$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogFile = Join-Path $LogDir 'calendar-sync-local.log'

function Import-DotEnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
    $idx = $line.IndexOf('=')
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1)
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      try {
        $value = ConvertFrom-Json $value
      } catch {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

Import-DotEnvFile (Join-Path $Root '.env.local')
Import-DotEnvFile (Join-Path $Root '.env')

if (-not $env:FIREBASE_PROJECT_ID -and $env:FIREBASE_ADMIN_PROJECT_ID) {
  $env:FIREBASE_PROJECT_ID = $env:FIREBASE_ADMIN_PROJECT_ID
}
if (-not $env:FIREBASE_CLIENT_EMAIL -and $env:FIREBASE_ADMIN_CLIENT_EMAIL) {
  $env:FIREBASE_CLIENT_EMAIL = $env:FIREBASE_ADMIN_CLIENT_EMAIL
}
if (-not $env:FIREBASE_PRIVATE_KEY -and $env:FIREBASE_ADMIN_PRIVATE_KEY) {
  $env:FIREBASE_PRIVATE_KEY = $env:FIREBASE_ADMIN_PRIVATE_KEY
}

$chromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
$browser = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
  $env:PUPPETEER_EXECUTABLE_PATH = $browser
}

$probe = [System.Net.Sockets.TcpClient]::new()
try {
  $connectTask = $probe.ConnectAsync('hsil.acc.co.il', 5443)
  if (-not $connectTask.Wait(5000) -or -not $probe.Connected) {
    $checkedAt = Get-Date -Format o
    "[$checkedAt] Herzliya route unavailable; skipping browser sync until the next scheduled check" |
      Tee-Object -FilePath $LogFile -Append
    exit 0
  }
} catch {
  $checkedAt = Get-Date -Format o
  "[$checkedAt] Herzliya route unavailable; skipping browser sync until the next scheduled check" |
    Tee-Object -FilePath $LogFile -Append
  exit 0
} finally {
  $probe.Dispose()
}

$env:SYNC_SAVED_CALENDARS = '1'
$started = Get-Date -Format o
"[$started] Starting local Herzliya calendar sync" | Tee-Object -FilePath $LogFile -Append

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
node functions\calendar-sync.cjs 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $LogFile -Append
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

$finished = Get-Date -Format o
"[$finished] Finished local Herzliya calendar sync with exit code $exitCode" | Tee-Object -FilePath $LogFile -Append
exit $exitCode

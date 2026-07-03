# One-time installer: registers a Windows Scheduled Task that runs
# run-local-calendar-sync.ps1 every hour (as long as this PC is on), and
# kicks off an immediate first run right away.
#
# Usage: run once from the project root, in a normal PowerShell window:
#   .\scripts\install-calendar-sync-task.ps1

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$SyncScript = Join-Path $Root 'scripts\run-local-calendar-sync.ps1'

if (-not (Test-Path $SyncScript)) {
  throw "Could not find $SyncScript"
}

$TaskName = 'TVIndustryIL-HerzliyaCalendarSync'

$Action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$SyncScript`"" `
  -WorkingDirectory $Root

$Trigger = New-ScheduledTaskTrigger `
  -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours 1) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host "Task '$TaskName' already exists - updating it."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description 'Runs the local Herzliya calendar sync every hour while this PC is on.' `
  | Out-Null

Write-Host "Scheduled task '$TaskName' installed - will run hourly from now on."
Write-Host "Kicking off an immediate first run..."

Start-ScheduledTask -TaskName $TaskName

Write-Host "Started. Check logs\calendar-sync-local.log for progress in a few seconds."
Write-Host "To remove later: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"

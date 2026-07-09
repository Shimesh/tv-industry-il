@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-calendar-sync-after-route.ps1" -OpenUrbanVpn -RunSync -ForceSync -WatchMinutes 60 -ProbeIntervalSeconds 15

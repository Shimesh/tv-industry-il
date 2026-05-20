@echo off
cd /d "%~dp0.."
node scripts\scrape-ratings-watcher.mjs >> logs\watcher.log 2>&1

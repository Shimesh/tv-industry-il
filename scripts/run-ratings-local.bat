@echo off
cd /d "%~dp0.."
node scripts\scrape-ratings-oracle.mjs >> logs\ratings.log 2>&1

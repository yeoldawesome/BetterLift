# Local test server (Windows). Run from anywhere: powershell -File pb\start-local.ps1
# Listens on all interfaces so your phone on the same Wi-Fi can reach it.
Set-Location $PSScriptRoot
if (-not (Test-Path .\pocketbase.exe)) { Write-Error 'pocketbase.exe missing - download the windows_amd64 zip from https://github.com/pocketbase/pocketbase/releases into this folder.'; exit 1 }
.\pocketbase.exe serve --http=0.0.0.0:8090

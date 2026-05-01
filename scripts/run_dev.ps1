Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendScript = Join-Path $PSScriptRoot "run_backend.ps1"
$workerScript = Join-Path $PSScriptRoot "run_worker.ps1"
$frontendDir = Join-Path $root "frontend"

function Start-DevWindow {
  param(
    [Parameter(Mandatory = $true)] [string] $Title,
    [Parameter(Mandatory = $true)] [string] $Command
  )

  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  ) -WorkingDirectory $root
}

Start-DevWindow -Title "CADRelay backend" -Command "& '$backendScript'"
Start-DevWindow -Title "CADRelay worker" -Command "& '$workerScript'"
Start-DevWindow -Title "CADRelay frontend" -Command "Set-Location '$frontendDir'; npm run dev -- --host 127.0.0.1 --port 5173"

Write-Host "CADRelay dev environment is starting in separate windows." -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Cyan

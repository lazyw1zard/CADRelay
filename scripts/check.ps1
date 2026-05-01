param(
  [switch] $InstallDeps
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host "== CADRelay checks ==" -ForegroundColor Cyan

Set-Location $backendDir
if (-not (Test-Path ".venv")) {
  Write-Host "Creating backend virtualenv..." -ForegroundColor Cyan
  py -3.12 -m venv .venv
  $InstallDeps = $true
}

$python = Join-Path $backendDir ".venv\Scripts\python.exe"
if ($InstallDeps) {
  Write-Host "Installing backend dev dependencies..." -ForegroundColor Cyan
  & $python -m pip install -e ".[dev]"
}

Write-Host "Backend compileall..." -ForegroundColor Cyan
& $python -m compileall app scripts

Write-Host "Backend ruff..." -ForegroundColor Cyan
& $python -m ruff check app scripts tests

Write-Host "Backend pytest..." -ForegroundColor Cyan
& $python -m pytest -q

Set-Location $frontendDir
Write-Host "Frontend build..." -ForegroundColor Cyan
& npm run build

Set-Location $root
Write-Host "All checks passed." -ForegroundColor Green

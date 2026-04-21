Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
Set-Location $backendDir

if (-not (Test-Path ".venv")) {
  py -3.12 -m venv .venv
}

$python = Join-Path $backendDir ".venv\Scripts\python.exe"
& $python -m pip install -e ".[dev]"
& $python (Join-Path $root "worker\app\main.py") @args

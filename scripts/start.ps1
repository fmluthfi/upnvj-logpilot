$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"
$backendRunner = Join-Path $PSScriptRoot "run-backend.ps1"
$frontendRunner = Join-Path $PSScriptRoot "run-frontend.ps1"

if (-not (Test-Path $pythonPath) -or -not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    throw "Dependencies are missing. Run .\scripts\setup.ps1 first."
}

foreach ($port in @(3000, 8000)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1) {
        throw "Port $port is already in use. Stop the other service, then try again."
    }
}

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit -File `"$backendRunner`"" -WorkingDirectory $repoRoot -WindowStyle Normal
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit -File `"$frontendRunner`"" -WorkingDirectory $repoRoot -WindowStyle Normal

Write-Host "Backend: http://127.0.0.1:8000"
Write-Host "Dashboard: http://localhost:3000"
Write-Host "Gunakan Ctrl+C pada masing-masing jendela untuk menghentikan layanan."

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"
$venvPath = Join-Path $backendPath ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $pythonPath)) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 11))"
        if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or newer is required." }
        & py -3 -m venv $venvPath
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -c "import sys; raise SystemExit(sys.version_info < (3, 11))"
        if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or newer is required." }
        & python -m venv $venvPath
    } else {
        throw "Install Python 3.11 or newer, then run setup again."
    }
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python virtual environment." }
}

& $pythonPath -c "import sys; raise SystemExit(sys.version_info < (3, 11))"
if ($LASTEXITCODE -ne 0) { throw "The backend virtual environment must use Python 3.11 or newer." }
& $pythonPath -m pip install -r (Join-Path $backendPath "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
& $pythonPath -m playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium for portal automation could not be installed." }

if (-not (Test-Path (Join-Path $backendPath ".env"))) {
    Copy-Item -LiteralPath (Join-Path $backendPath ".env.example") -Destination (Join-Path $backendPath ".env")
}
New-Item -ItemType Directory -Path (Join-Path $backendPath "data") -Force | Out-Null

Push-Location $backendPath
try {
    & $pythonPath -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "SQLite migration failed." }
} finally {
    Pop-Location
}

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Install Node.js 20.9 or newer, then run setup again."
}
& node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major < 20 || (major === 20 && minor < 9) ? 1 : 0)"
if ($LASTEXITCODE -ne 0) { throw "Node.js 20.9 or newer is required." }

Push-Location $frontendPath
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
} finally {
    Pop-Location
}

Write-Host "Setup selesai. Jalankan .\scripts\start.ps1 untuk membuka dashboard dan API."

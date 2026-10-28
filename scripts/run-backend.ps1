$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPath = Join-Path $repoRoot "backend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"

Set-Location $backendPath
& $pythonPath -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw "Database migration failed. The backend was not started." }
& $pythonPath -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

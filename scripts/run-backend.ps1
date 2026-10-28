$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPath = Join-Path $repoRoot "backend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"

Set-Location $backendPath
& $pythonPath -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

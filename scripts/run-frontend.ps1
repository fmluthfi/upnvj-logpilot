$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendPath = Join-Path $repoRoot "frontend"

Set-Location $frontendPath
& npm run dev -- --hostname 127.0.0.1 --port 3000

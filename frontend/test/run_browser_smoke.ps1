$ErrorActionPreference = "Stop"

Write-Host "Starting PayPilot AI backend and frontend servers for browser smoke test..."

# Path to python in .venv
$pythonExe = Join-Path $PSScriptRoot "..\..\.venv\Scripts\python.exe"
$backendDir = Join-Path $PSScriptRoot "..\..\backend"
$frontendDir = Join-Path $PSScriptRoot ".."

# Start Backend
$backendProc = Start-Process -FilePath $pythonExe -ArgumentList "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "8000" -WorkingDirectory $backendDir -PassThru -NoNewWindow

# Start Frontend
$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev -- --host 127.0.0.1 --port 5173" -WorkingDirectory $frontendDir -PassThru -NoNewWindow

try {
    Write-Host "Waiting for backend on http://127.0.0.1:8000/api/v1/health..."
    $backendReady = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/v1/health" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) {
                $backendReady = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $backendReady) {
        throw "Backend failed to become ready on http://127.0.0.1:8000"
    }
    Write-Host "Backend is ready!"

    Write-Host "Waiting for frontend on http://127.0.0.1:5173..."
    $frontendReady = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) {
                $frontendReady = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $frontendReady) {
        throw "Frontend failed to become ready on http://127.0.0.1:5173"
    }
    Write-Host "Frontend is ready!"

    Write-Host "Launching Browser Smoke Test (Node.js + Chrome CDP)..."
    node "$PSScriptRoot\browser_smoke.mjs"
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        throw "Browser smoke test failed with exit code $testExitCode"
    }
}
finally {
    Write-Host "Cleaning up test processes..."
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProc -and -not $frontendProc.HasExited) {
        Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*uvicorn*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}

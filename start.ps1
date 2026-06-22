$ErrorActionPreference = "Stop"

# APP_PORT is injected by the sandbox (3000-3099 range)
# Vite dev server listens on APP_PORT so the sandbox proxy can reach it
if (-not $env:APP_PORT) { $env:APP_PORT = "5173" }
$VitePort = [int]$env:APP_PORT

# Startup timing
$T0 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
function elapsed { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $script:T0 }

# Install JS deps (with lockfile hash guard)
$bunHash = (Get-FileHash -Algorithm MD5 bun.lock -ErrorAction SilentlyContinue).Hash
$bunHashFile = "node_modules/.bun-hash-$bunHash"
if ($bunHash -and -not (Test-Path $bunHashFile)) {
    Write-Host "[+$(elapsed)ms] bun install starting..."
    bun install --frozen-lockfile
    Remove-Item node_modules/.bun-hash-* -ErrorAction SilentlyContinue
    New-Item -ItemType File -Path $bunHashFile -Force | Out-Null
    Write-Host "[+$(elapsed)ms] bun install done"
} else {
    Write-Host "[+$(elapsed)ms] bun install skipped (lockfile unchanged)"
}

Write-Host "[+$(elapsed)ms] Starting Vite on port $VitePort"
bunx vite --host 0.0.0.0 --port $VitePort --strictPort

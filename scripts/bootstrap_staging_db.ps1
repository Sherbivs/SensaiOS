<#
Bootstrap helper for staging DB alignment.

This script is interactive by design. It tries `npx prisma migrate deploy` first. If that fails because the DB is missing baseline tables, it prints guidance and exits with a non-zero code.

Usage (PowerShell):
  pwsh.exe -File .\scripts\bootstrap_staging_db.ps1

Be sure you run this from the repo root and that `.env` contains a valid DATABASE_URL for staging.
#>

param(
    [switch]$WhatIf
)

function Import-EnvFile {
    $envPath = Join-Path (Get-Location) '.env'
    if (-not (Test-Path $envPath)) { return }
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^[#;]') { return }
        if ($_ -match '^\s*$') { return }
        $parts = $_ -split '='; if ($parts.Count -lt 2) { return }
        $key = $parts[0].Trim(); $value = ($parts[1..($parts.Count -1)] -join '=').Trim()
        if ($value -match '^".*"$') { $value = $value.Trim('"') }
        Set-Item -Path "Env:\$key" -Value $value -Force
    }
}

Write-Host "[bootstrap] Loading .env (if present)" -ForegroundColor Cyan
Import-EnvFile

$db = $env:DATABASE_URL
if (-not $db) {
    Write-Error "DATABASE_URL is not set in the environment or .env. Aborting."
    exit 2
}

$directUrl = $env:RENDER_DB_INTERNAL_URL
if (-not $directUrl) {
    $directUrl = $env:RENDER_DB_EXTERNAL_URL
}
if (-not $directUrl) {
    Write-Warning "RENDER_DB_INTERNAL_URL and RENDER_DB_EXTERNAL_URL are not set. Prisma migrations will fall back to DATABASE_URL; add a direct connection string for best results."
} elseif ($directUrl -eq $db) {
    Write-Warning "Direct URL matches DATABASE_URL. Confirm the direct connection string so migrations bypass Accelerate."
}

# Mask creds for display
function ConvertTo-MaskedDbUrl($u) {
    try {
        if ($u -match '^(.*://)(.*?@)(.*)$') { return $u -replace '\\S+@','***@' }
    } catch { }
    return 'DATABASE_URL (hidden)'
}

Write-Host "[bootstrap] Detected DATABASE_URL: $(ConvertTo-MaskedDbUrl $db)" -ForegroundColor Yellow
if ($directUrl) {
    Write-Host "[bootstrap] Detected Direct URL: $(ConvertTo-MaskedDbUrl $directUrl)" -ForegroundColor Yellow
}

if ($WhatIf) {
    Write-Host "WhatIf: would run 'npx prisma migrate deploy' against the target DB." -ForegroundColor Green
    exit 0
}

$confirm = Read-Host "Proceed to run 'npx prisma migrate deploy' against the above DATABASE_URL? Type 'yes' to continue"
if ($confirm -ne 'yes') { Write-Host 'Aborted by user.'; exit 1 }

Write-Host "Running: npx prisma migrate deploy" -ForegroundColor Cyan
try {
    $proc = Start-Process -FilePath 'npx' -ArgumentList 'prisma','migrate','deploy' -NoNewWindow -Wait -PassThru -RedirectStandardOutput pipes -RedirectStandardError pipes
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    if ($out) { Write-Host $out }
    if ($err) { Write-Error $err }
    if ($proc.ExitCode -eq 0) { Write-Host "migrate deploy finished successfully." -ForegroundColor Green; exit 0 }
    else {
        Write-Host "migrate deploy exited with code $($proc.ExitCode)." -ForegroundColor Yellow
        Write-Host "If errors mention missing relations (e.g. relation \"PokemonInstance\" does not exist), follow ops/DB_BOOTSTRAP.md and bring the baseline schema to the DB (prisma migrate deploy or prisma db push)." -ForegroundColor Red
        exit $proc.ExitCode
    }
} catch {
    Write-Error "Execution failed: $_"
    exit 10
}

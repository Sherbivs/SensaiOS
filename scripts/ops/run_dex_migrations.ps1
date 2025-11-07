param(
    [string]$EnvFilePath = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env",
    [string]$RenderUrl = $Env:RENDER_DB_EXTERNAL_URL,
    [switch]$DryRun
)

function Read-EnvFile([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Environment file not found: $path"
    }

    $values = @{}
    Get-Content -LiteralPath $path | ForEach-Object {
        $line = $_.Trim()
        if ($line.StartsWith('#') -or [string]::IsNullOrWhiteSpace($line)) {
            return
        }
        $pair = $line.Split('=', 2)
        if ($pair.Length -ne 2) {
            return
        }
        $key = $pair[0].Trim()
        $value = $pair[1].Trim()
        if ($key.Length -gt 0) {
            $values[$key] = $value
        }
    }

    return $values
}

function Set-EnvVars($vars) {
    $snapshot = @{}
    foreach ($key in $vars.Keys) {
        $snapshot[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
        [System.Environment]::SetEnvironmentVariable($key, $vars[$key], 'Process')
    }
    return $snapshot
}

function Assert-DirectUrl([string]$url, [string]$name) {
    if ([string]::IsNullOrWhiteSpace($url)) {
        throw "$name must be provided."
    }

    if ($url.Trim().StartsWith('prisma+')) {
        throw "$name must be a direct PostgreSQL connection string (postgresql://), not a prisma+ proxy URL."
    }
}

function Restore-EnvVars($snapshot) {
    foreach ($key in $snapshot.Keys) {
        [System.Environment]::SetEnvironmentVariable($key, $snapshot[$key], 'Process')
    }
}

function Invoke-PrismaCommand([string[]]$arguments) {
    Write-Host "Running: npx prisma $($arguments -join ' ')" -ForegroundColor Cyan
    & npx prisma @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: npx prisma $($arguments -join ' ')"
    }
}

function Invoke-SpeciesSheetRefresh() {
    Invoke-PrismaCommand @('db', 'execute', '--command', 'REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet";')
}

$envVars = Read-EnvFile -path $EnvFilePath
$databaseUrl = $envVars['DATABASE_URL']
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw "DATABASE_URL missing from $EnvFilePath"
}

$internalUrl = $envVars['RENDER_DB_INTERNAL_URL']
Assert-DirectUrl -url $internalUrl -name 'RENDER_DB_INTERNAL_URL (DEV master)'

if (-not $RenderUrl -or [string]::IsNullOrWhiteSpace($RenderUrl)) {
    throw 'RENDER_DB_EXTERNAL_URL must be set in the environment or passed to -RenderUrl.'
}

Assert-DirectUrl -url $RenderUrl -name 'RENDER_DB_EXTERNAL_URL (Render)'

Write-Host '*** Running migrations against direct PostgreSQL connection' -ForegroundColor Yellow
$snapshot = Set-EnvVars -vars @{ DATABASE_URL = $internalUrl; RENDER_DB_INTERNAL_URL = $internalUrl; PRISMA_CLIENT_ENGINE_TYPE = $null }
try {
    if (-not $DryRun) {
    Invoke-PrismaCommand @('migrate', 'deploy')
    Invoke-SpeciesSheetRefresh
    } else {
        Write-Host 'Dry run: skipping migrate deploy on Prisma Postgres direct connection.' -ForegroundColor DarkYellow
    }
} finally {
    Restore-EnvVars -snapshot $snapshot
}

Write-Host '*** Running migrations against Render standby direct connection' -ForegroundColor Yellow
$renderSnapshot = Set-EnvVars -vars @{ DATABASE_URL = $RenderUrl; RENDER_DB_EXTERNAL_URL = $RenderUrl; PRISMA_CLIENT_ENGINE_TYPE = $null }
try {
    if (-not $DryRun) {
        Invoke-PrismaCommand @('migrate', 'deploy')
        Invoke-SpeciesSheetRefresh
    } else {
        Write-Host 'Dry run: skipping migrate deploy on Render direct connection.' -ForegroundColor DarkYellow
    }
} finally {
    Restore-EnvVars -snapshot $renderSnapshot
}

Write-Host '✅ Dex migrations deployed and SpeciesSheet refreshed on both databases.' -ForegroundColor Green

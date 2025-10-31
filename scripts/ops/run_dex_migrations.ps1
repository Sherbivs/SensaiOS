param(
    [string]$AccelerateEnvPath = "C:/Users/sherb/OneDrive/Documents/Key/Prod/.env",
    [string]$RenderUrl = $Env:DATABASE_DIRECT_URL,
    [switch]$DryRun
)

function Read-EnvFile([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Accelerate env file not found: $path"
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

$accelerateVars = Read-EnvFile -path $AccelerateEnvPath
$accelerateUrl = $accelerateVars['DATABASE_URL']
if ([string]::IsNullOrWhiteSpace($accelerateUrl)) {
    throw "DATABASE_URL missing from $AccelerateEnvPath"
}

$accelerateDirect = $accelerateVars['DATABASE_DIRECT_URL']
if ([string]::IsNullOrWhiteSpace($accelerateDirect)) {
    $accelerateDirect = $accelerateUrl
}

if (-not $RenderUrl -or [string]::IsNullOrWhiteSpace($RenderUrl)) {
    throw 'DATABASE_DIRECT_URL must be set in the environment or passed to -RenderUrl.'
}

Write-Host '*** Running migrations against Prisma Accelerate (primary)' -ForegroundColor Yellow
$accelerateSnapshot = Set-EnvVars -vars @{ DATABASE_URL = $accelerateUrl; DATABASE_DIRECT_URL = $accelerateDirect; PRISMA_CLIENT_ENGINE_TYPE = 'accelerate' }
try {
    if (-not $DryRun) {
    Invoke-PrismaCommand @('migrate', 'deploy')
    Invoke-SpeciesSheetRefresh
    } else {
        Write-Host 'Dry run: skipping migrate deploy on Accelerate.' -ForegroundColor DarkYellow
    }
} finally {
    Restore-EnvVars -snapshot $accelerateSnapshot
}

Write-Host '*** Running migrations against Render standby' -ForegroundColor Yellow
$renderSnapshot = Set-EnvVars -vars @{ DATABASE_URL = $RenderUrl; DATABASE_DIRECT_URL = $RenderUrl; PRISMA_CLIENT_ENGINE_TYPE = $null }
try {
    if (-not $DryRun) {
    Invoke-PrismaCommand @('migrate', 'deploy')
    Invoke-SpeciesSheetRefresh
    } else {
        Write-Host 'Dry run: skipping migrate deploy on Render.' -ForegroundColor DarkYellow
    }
} finally {
    Restore-EnvVars -snapshot $renderSnapshot
}

Write-Host '✅ Dex migrations deployed and SpeciesSheet refreshed on both databases.' -ForegroundColor Green

[CmdletBinding()]
param(
    [Parameter()]
    [string]$BackupPath = "db_dump.bak",

    [Parameter()]
    [string]$TunnelHost = "127.0.0.1",

    [Parameter()]
    [int]$Port = 5433,

    [Parameter()]
    [string]$Database = "postgres",

    [Parameter()]
    [string]$PgRestorePath = "tools/pgsql17/pgsql/bin/pg_restore.exe"
)

$ErrorActionPreference = "Stop"

function Resolve-PgRestore {
    param([string]$Path)

    if (!(Test-Path -LiteralPath $Path)) {
        throw "pg_restore not found at '$Path'. Install PostgreSQL client binaries (17.x) under tools/ and update PgRestorePath."
    }

    return (Resolve-Path -LiteralPath $Path).Path
}

if (!(Test-Path -LiteralPath $BackupPath)) {
    throw "Backup file '$BackupPath' not found. Export source data with pg_dump first."
}

$pgRestore = Resolve-PgRestore -Path $PgRestorePath

if (-not $Env:DATABASE_URL) {
    Write-Warning "DATABASE_URL is not set. Prisma Postgres tunnel requires the accelerate connection string."
}

if ($Env:DATABASE_URL -and $Env:DATABASE_URL -notmatch '^prisma\+postgres://') {
    Write-Warning "DATABASE_URL does not look like a Prisma Postgres connection (prisma+postgres://...)."
}

Write-Host ("Starting Prisma Postgres tunnel on {0}:{1}" -f $TunnelHost, $Port) -ForegroundColor Cyan

$job = Start-Job -ScriptBlock {
    param($HostParam, $PortParam)
    & npx --yes @prisma/ppg-tunnel --host $HostParam --port $PortParam
} -ArgumentList $TunnelHost, $Port

try {
    $timeout = [DateTime]::UtcNow.AddSeconds(45)
    $tunnelReady = $false

    # Poll until the tunnel listens before attempting restore.
    do {
        $probe = Test-NetConnection -ComputerName $TunnelHost -Port $Port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($probe.TcpTestSucceeded) {
            $tunnelReady = $true
            break
        }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $timeout)

    if (-not $tunnelReady) {
        throw ("Prisma Postgres tunnel did not start listening on {0}:{1} within timeout." -f $TunnelHost, $Port)
    }

    Write-Host "Tunnel ready. Running pg_restore for $BackupPath" -ForegroundColor Cyan

    $previousPgSslMode = $Env:PGSSLMODE
    $Env:PGSSLMODE = "disable"

    try {
    & $pgRestore --clean --if-exists --no-owner --no-privileges --no-acl -h $TunnelHost -p $Port -v -d $Database $BackupPath
    }
    finally {
        if ($null -ne $previousPgSslMode) {
            $Env:PGSSLMODE = $previousPgSslMode
        } else {
            Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
        }
    }
}
finally {
    if ($job.State -eq 'Running') {
        Write-Host "Stopping Prisma Postgres tunnel" -ForegroundColor Yellow
        Stop-Job -Job $job -ErrorAction SilentlyContinue
    }

    $output = Receive-Job -Job $job -Wait -ErrorAction SilentlyContinue
    if ($output) {
        Write-Host $output
    }

    Remove-Job -Job $job -ErrorAction SilentlyContinue
}

Write-Host "Restore complete." -ForegroundColor Green

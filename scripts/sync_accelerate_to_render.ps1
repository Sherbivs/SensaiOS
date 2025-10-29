[CmdletBinding()]
param(
    [Parameter()]
    [string]$BackupPath = "accelerate_to_render.bak",

    [Parameter()]
    [string]$TunnelHost = "127.0.0.1",

    [Parameter()]
    [int]$TunnelPort = 5433,

    [Parameter()]
    [string]$Database = "postgres",

    [Parameter()]
    [string]$PgDumpPath = "tools/pgsql17/pgsql/bin/pg_dump.exe",

    [Parameter()]
    [string]$PgRestorePath = "tools/pgsql17/pgsql/bin/pg_restore.exe",

    [Parameter()]
    [string]$RenderDatabaseUrl,

    [Parameter()]
    [string]$LogPath = "ops/standby_refresh.log"
)

$ErrorActionPreference = "Stop"

function Resolve-PgBinary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (!(Test-Path -LiteralPath $Path)) {
        throw "${Name} not found at '$Path'. Install PostgreSQL client binaries (17.x) under tools/."
    }

    return (Resolve-Path -LiteralPath $Path).Path
}

function Write-LogLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [string]$Color = "Gray"
    )

    $timestamp = (Get-Date).ToString("u")
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
    return "[$timestamp] $Message"
}

if (-not $Env:DATABASE_URL) {
    throw "DATABASE_URL is not set. Point it at the Prisma Accelerate connection string (prisma+postgres://...)."
}

if ($Env:DATABASE_URL -notmatch '^prisma\+postgres://') {
    throw "DATABASE_URL must be the Prisma Accelerate URL (prisma+postgres://...)."
}

if (-not $RenderDatabaseUrl) {
    $RenderDatabaseUrl = $Env:RENDER_DATABASE_URL
}

if (-not $RenderDatabaseUrl) {
    throw "RenderDatabaseUrl not provided. Pass -RenderDatabaseUrl or set RENDER_DATABASE_URL in the environment."
}

if ($RenderDatabaseUrl -notmatch '^postgres(ql)?://') {
    throw "Render standby connection must be a PostgreSQL URL (postgresql://...)."
}

$pgDump = Resolve-PgBinary -Path $PgDumpPath -Name "pg_dump"
$pgRestore = Resolve-PgBinary -Path $PgRestorePath -Name "pg_restore"

if (Test-Path -LiteralPath $BackupPath) {
    Write-LogLine -Message "Existing backup '$BackupPath' will be overwritten." -Color Yellow | Out-Null
    Remove-Item -LiteralPath $BackupPath -Force
}

Write-LogLine -Message ("Starting Prisma tunnel on {0}:{1}" -f $TunnelHost, $TunnelPort) -Color Cyan | Out-Null

$job = Start-Job -ScriptBlock {
    param($HostParam, $PortParam)
    & npx --yes @prisma/ppg-tunnel --host $HostParam --port $PortParam
} -ArgumentList $TunnelHost, $TunnelPort

$success = $false
$failureMessage = $null
$startTime = Get-Date

try {
    $timeout = [DateTime]::UtcNow.AddSeconds(45)
    $tunnelReady = $false

    do {
        $probe = Test-NetConnection -ComputerName $TunnelHost -Port $TunnelPort -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($probe.TcpTestSucceeded) {
            $tunnelReady = $true
            break
        }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $timeout)

    if (-not $tunnelReady) {
        throw ("Prisma tunnel did not start listening on {0}:{1} within timeout." -f $TunnelHost, $TunnelPort)
    }

    Write-LogLine -Message "Tunnel ready. Running pg_dump from Accelerate primary." -Color Cyan | Out-Null

    $previousPgSslMode = $Env:PGSSLMODE
    $Env:PGSSLMODE = "disable"

    try {
        & $pgDump -Fc -v -h $TunnelHost -p $TunnelPort -d $Database -n public -f $BackupPath
    }
    finally {
        if ($null -ne $previousPgSslMode) {
            $Env:PGSSLMODE = $previousPgSslMode
        } else {
            Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
        }
    }

    if (!(Test-Path -LiteralPath $BackupPath)) {
        throw "pg_dump did not create '$BackupPath'."
    }

    Write-LogLine -Message "Dump complete. Restoring into Render standby." -Color Cyan | Out-Null

    & $pgRestore --clean --if-exists --no-owner --no-privileges --no-acl --dbname "$RenderDatabaseUrl" -v $BackupPath

    Write-LogLine -Message "Render standby refresh complete." -Color Green | Out-Null
    $success = $true
}
catch {
    $failureMessage = $_.Exception.Message
    Write-LogLine -Message ("Refresh failed: {0}" -f $failureMessage) -Color Red | Out-Null
    throw
}
finally {
    if ($job.State -eq 'Running') {
        Write-LogLine -Message "Stopping Prisma tunnel." -Color Yellow | Out-Null
        Stop-Job -Job $job -ErrorAction SilentlyContinue
    }

    $output = Receive-Job -Job $job -Wait -ErrorAction SilentlyContinue
    if ($output) {
        $output | ForEach-Object { Write-Host $_ }
    }

    Remove-Job -Job $job -ErrorAction SilentlyContinue

    if ($LogPath) {
        $logDir = Split-Path -Path $LogPath -Parent
        if ($logDir -and !(Test-Path -LiteralPath $logDir)) {
            New-Item -ItemType Directory -Path $logDir | Out-Null
        }

        $status = if ($success) { "SUCCESS" } else { "FAILED: $failureMessage" }
        $duration = (Get-Date) - $startTime
        $summaryLine = "[$((Get-Date).ToString('u'))] $status (backup: $BackupPath, duration: {0:c})" -f $duration
        Add-Content -LiteralPath $LogPath -Value $summaryLine
    }
}

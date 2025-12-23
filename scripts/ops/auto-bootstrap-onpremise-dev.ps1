[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$BootstrapArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

. (Join-Path $scriptDir "ensure_postgres_bundle.ps1")

$pgBinPath = Get-PostgresBundle -Version "17"
$env:PG_BIN_DIR = $pgBinPath
Write-Host "[auto-bootstrap] PG_BIN_DIR set to $pgBinPath"

Push-Location $repoRoot
 $exitCode = 0
try {
    $npxCommand = (Get-Command npx -ErrorAction Stop).Source
    $runnerArgs = @("tsx", "scripts/ops/bootstrap_onpremise_dev.ts")
    if ($BootstrapArgs) {
        $runnerArgs += $BootstrapArgs
    }

    & $npxCommand @runnerArgs
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    exit $exitCode
}
*** End of File
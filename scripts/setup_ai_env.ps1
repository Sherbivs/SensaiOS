[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Path to the environment file that should be loaded by the agent runtime")]
    [string]$EnvFile = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env",

    [Parameter(HelpMessage = "Persist IG_ENV_FILE for future shells using setx")]
    [switch]$Persist,

    [Parameter(HelpMessage = "Suppress informational output")]
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

try {
    $resolvedPath = (Resolve-Path -LiteralPath $EnvFile -ErrorAction Stop).ProviderPath
} catch {
    throw "Environment file '$EnvFile' was not found. Pass -EnvFile with a valid path."
}

if (-not (Test-Path -LiteralPath $resolvedPath)) {
    throw "Resolved environment file '$resolvedPath' does not exist or is inaccessible."
}

if ($Persist) {
    $setxResult = & setx IG_ENV_FILE $resolvedPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to persist IG_ENV_FILE via setx. Output: $setxResult"
    }
    if (-not $Quiet) {
        Write-Host "Persisted IG_ENV_FILE for future shells." -ForegroundColor Green
        Write-Host "Value: $resolvedPath" -ForegroundColor Cyan
        Write-Host "Restart any open terminals or VS Code windows so the change takes effect." -ForegroundColor Yellow
        Write-Host "Production runs skip repo .env fallback; override only by setting IG_ALLOW_REPO_ENV=1 (not recommended)." -ForegroundColor DarkYellow
    }
} else {
    $Env:IG_ENV_FILE = $resolvedPath
    if (-not $Quiet) {
        Write-Host "Set IG_ENV_FILE for current session." -ForegroundColor Green
        Write-Host "Value: $resolvedPath" -ForegroundColor Cyan
        Write-Host "Remember to re-run this script (or use -Persist) before each automated agent session." -ForegroundColor Yellow
        Write-Host "Production runs skip repo .env fallback; override only by setting IG_ALLOW_REPO_ENV=1 (not recommended)." -ForegroundColor DarkYellow
    }
}

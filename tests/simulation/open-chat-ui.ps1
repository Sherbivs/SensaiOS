# Open Chat UI in Browser
# Quick script to launch the minimal test interface

param(
    [string]$Browser = "default"
)

$chatUIPath = Join-Path $PSScriptRoot "chat-ui.html"

if (-not (Test-Path $chatUIPath)) {
    Write-Host "❌ Error: chat-ui.html not found at $chatUIPath" -ForegroundColor Red
    exit 1
}

Write-Host "🎮 Opening Chat UI..." -ForegroundColor Cyan

switch ($Browser.ToLower()) {
    "chrome" {
        Start-Process "chrome.exe" $chatUIPath
    }
    "firefox" {
        Start-Process "firefox.exe" $chatUIPath
    }
    "edge" {
        Start-Process "msedge.exe" $chatUIPath
    }
    default {
        Start-Process $chatUIPath
    }
}

Write-Host "✅ Chat UI opened in browser!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Try these commands:" -ForegroundColor Yellow
Write-Host "  /starter  - Choose your starter Pokémon" -ForegroundColor Gray
Write-Host "  /home     - View your party" -ForegroundColor Gray
Write-Host "  /walk     - Encounter wild Pokémon" -ForegroundColor Gray
Write-Host "  /heal     - Heal all Pokémon" -ForegroundColor Gray
Write-Host "  /battle   - Challenge trainer" -ForegroundColor Gray
Write-Host ""

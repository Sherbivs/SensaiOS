# verify-agp-version.ps1
# Verifies Android Gradle Plugin version after upgrade

Write-Host @"

╔════════════════════════════════════════════════════════════════════════════╗
║  🔍 VERIFYING ANDROID GRADLE PLUGIN VERSION                                ║
╚════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$expectedVersion = "8.13.1"
$foundVersions = @{}
$allCorrect = $true

$filesToCheck = @(
    "build.gradle.kts",
    "app/build.gradle.kts",
    "gradle/libs.versions.toml",
    "settings.gradle.kts"
)

Write-Host "📋 CHECKING GRADLE FILES...`n" -ForegroundColor Cyan

foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Check for version patterns
        $versions = @()
        
        if ($content -match 'com\.android\.tools\.build:gradle:(\d+\.\d+\.\d+)') {
            $versions += $matches[1]
        }
        if ($content -match 'agp\s*=\s*"(\d+\.\d+\.\d+)"') {
            $versions += $matches[1]
        }
        if ($content -match 'id\("com\.android\.(application|library)"\)\s+version\s+"(\d+\.\d+\.\d+)"') {
            $versions += $matches[2]
        }
        
        if ($versions.Count -gt 0) {
            $foundVersions[$file] = $versions
            
            $isCorrect = $versions | ForEach-Object { $_ -eq $expectedVersion } | Where-Object { $_ -eq $true }
            
            if ($isCorrect) {
                Write-Host "  ✅ $file" -ForegroundColor Green
                foreach ($ver in $versions) {
                    Write-Host "     Version: $ver" -ForegroundColor White
                }
            } else {
                Write-Host "  ❌ $file" -ForegroundColor Red
                foreach ($ver in $versions) {
                    $color = if($ver -eq $expectedVersion){"Green"}else{"Red"}
                    Write-Host "     Version: $ver" -ForegroundColor $color
                }
                $allCorrect = $false
            }
        } else {
            Write-Host "  ℹ️  $file - No AGP version found" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ⚠️  $file - Not found" -ForegroundColor Yellow
    }
}

Write-Host "`n📊 SUMMARY`n" -ForegroundColor Cyan

if ($allCorrect -and $foundVersions.Count -gt 0) {
    Write-Host "  ✅ ALL FILES UPDATED TO $expectedVersion" -ForegroundColor Green
    Write-Host "  Files checked: $($foundVersions.Count)" -ForegroundColor White
} elseif ($foundVersions.Count -eq 0) {
    Write-Host "  ⚠️  No AGP versions found in any files" -ForegroundColor Yellow
    Write-Host "  This might be normal if using version catalogs" -ForegroundColor Gray
} else {
    Write-Host "  ❌ SOME FILES NOT UPDATED" -ForegroundColor Red
    Write-Host "  Run: .\upgrade-agp.ps1 to fix" -ForegroundColor Yellow
}

Write-Host "`n🔄 NEXT: Sync Gradle in Android Studio or run .\gradlew --refresh-dependencies`n" -ForegroundColor Cyan

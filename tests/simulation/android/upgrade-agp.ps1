# upgrade-agp.ps1
# Upgrades Android Gradle Plugin from 8.7.3 to 8.13.1

param(
    [switch]$DryRun = $false
)

Write-Host @"

╔════════════════════════════════════════════════════════════════════════════╗
║  📦 ANDROID GRADLE PLUGIN UPGRADE                                          ║
║  From: 8.7.3 → To: 8.13.1                                                  ║
╚════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$changes = @()

# Function to update version in file
function Update-AGPVersion {
    param(
        [string]$FilePath,
        [string]$OldVersion = "8.7.3",
        [string]$NewVersion = "8.13.1"
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "  ⚠️  File not found: $FilePath" -ForegroundColor Yellow
        return $false
    }
    
    $content = Get-Content $FilePath -Raw
    $originalContent = $content
    
    # Pattern 1: com.android.tools.build:gradle:8.7.3
    $content = $content -replace "com\.android\.tools\.build:gradle:$OldVersion", "com.android.tools.build:gradle:$NewVersion"
    
    # Pattern 2: agp = "8.7.3"
    $content = $content -replace "agp\s*=\s*`"$OldVersion`"", "agp = `"$NewVersion`""
    
    # Pattern 3: id("com.android.application") version "8.7.3"
    $content = $content -replace "id\(`"com\.android\.application`"\)\s+version\s+`"$OldVersion`"", "id(`"com.android.application`") version `"$NewVersion`""
    
    # Pattern 4: id("com.android.library") version "8.7.3"
    $content = $content -replace "id\(`"com\.android\.library`"\)\s+version\s+`"$OldVersion`"", "id(`"com.android.library`") version `"$NewVersion`""
    
    if ($content -ne $originalContent) {
        if ($DryRun) {
            Write-Host "  📝 Would update: $FilePath" -ForegroundColor Yellow
        } else {
            Set-Content -Path $FilePath -Value $content -Encoding UTF8 -NoNewline
            Write-Host "  ✅ Updated: $FilePath" -ForegroundColor Green
        }
        return $true
    } else {
        Write-Host "  ℹ️  No changes needed: $FilePath" -ForegroundColor Gray
        return $false
    }
}

Write-Host "🔍 SCANNING FOR AGP VERSION...`n" -ForegroundColor Cyan

$filesToCheck = @(
    "build.gradle.kts",
    "app/build.gradle.kts",
    "gradle/libs.versions.toml",
    "settings.gradle.kts"
)

$updatedCount = 0

foreach ($file in $filesToCheck) {
    if (Update-AGPVersion -FilePath $file) {
        $updatedCount++
        $changes += $file
    }
}

Write-Host "`n📊 SUMMARY`n" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "  DRY RUN MODE - No files were modified" -ForegroundColor Yellow
    Write-Host "  Files that would be updated: $updatedCount" -ForegroundColor White
} else {
    Write-Host "  Files updated: $updatedCount" -ForegroundColor Green
}

if ($changes.Count -gt 0) {
    Write-Host "`n  Changed files:" -ForegroundColor Cyan
    foreach ($change in $changes) {
        Write-Host "    • $change" -ForegroundColor White
    }
}

Write-Host "`n🔄 NEXT STEPS`n" -ForegroundColor Cyan

Write-Host @"
  1. Sync Gradle:
     • Open Android Studio
     • File → Sync Project with Gradle Files
     • Or click "Sync Now" banner
  
  2. Clean and Rebuild:
     .\gradlew clean build
  
  3. Test the build:
     .\build-android.ps1
  
  4. If errors occur:
     • Check for deprecated APIs
     • Update dependency versions if needed
     • Review AGP 8.13 release notes

"@ -ForegroundColor White

if ($DryRun) {
    Write-Host "�� Run without -DryRun to apply changes`n" -ForegroundColor Yellow
} else {
    Write-Host "✅ Upgrade complete!`n" -ForegroundColor Green
}

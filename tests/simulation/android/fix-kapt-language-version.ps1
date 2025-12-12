# Fix KAPT Language Version Issue
# Adds Kotlin 1.9 language version to fix KAPT compatibility

$ErrorActionPreference = "Stop"
$buildGradleFile = "C:\Users\sherb\StudioProjects\Infinity-Gauntlet\tests\simulation\android\app\build.gradle.kts"

Write-Host "`n🔧 Fixing KAPT Kotlin Language Version Issue..." -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Read the file
$content = Get-Content $buildGradleFile -Raw

# Find and replace the kotlinOptions block
$oldBlock = @"
    kotlinOptions {
        jvmTarget = "17"

        // Enable Compose compiler metrics (optional, for debugging)
        freeCompilerArgs += listOf(
"@

$newBlock = @"
    kotlinOptions {
        jvmTarget = "17"
        languageVersion = "1.9"  // KAPT requires Kotlin 1.9
        apiVersion = "1.9"        // Match language version

        // Enable Compose compiler metrics (optional, for debugging)
        freeCompilerArgs += listOf(
"@

if ($content -match [regex]::Escape($oldBlock)) {
    $content = $content -replace [regex]::Escape($oldBlock), $newBlock
    Set-Content -Path $buildGradleFile -Value $content -NoNewline
    Write-Host "✅ Fixed kotlinOptions block in build.gradle.kts" -ForegroundColor Green
    Write-Host "   • Added: languageVersion = `"1.9`"" -ForegroundColor White
    Write-Host "   • Added: apiVersion = `"1.9`"" -ForegroundColor White
} else {
    Write-Host "⚠️  Could not find expected kotlinOptions block" -ForegroundColor Yellow
    Write-Host "   Manual fix required!" -ForegroundColor Red
    exit 1
}

Write-Host "`n📝 Updated kotlinOptions:" -ForegroundColor Cyan
Write-Host @"
kotlinOptions {
    jvmTarget = "17"
    languageVersion = "1.9"  // KAPT requires Kotlin 1.9
    apiVersion = "1.9"        // Match language version
    ...
}
"@ -ForegroundColor White

Write-Host "`n🎯 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. In Android Studio: File > Sync Project with Gradle Files" -ForegroundColor White
Write-Host "  2. Build > Rebuild Project" -ForegroundColor White
Write-Host "  3. KAPT should now work with Kotlin 1.9 compatibility" -ForegroundColor White

Write-Host "`n✨ Fix applied! KAPT will use Kotlin 1.9 compatibility mode.`n" -ForegroundColor Green

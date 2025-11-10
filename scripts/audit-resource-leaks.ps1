#!/usr/bin/env pwsh
# Resource Leak Audit - Automated Detection Script
# Run: pwsh -File scripts/audit-resource-leaks.ps1

param(
    [switch]$Detailed,
    [switch]$Export
)

Write-Host "`n🔍 Resource Leak Audit - Automated Search" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Scanning codebase for unbounded resource patterns...`n" -ForegroundColor Gray

$results = @{
    EventEmitters = @{}
    Collections = @{}
    Timers = @{}
    Database = @{}
    Files = @{}
    Processes = @{}
    HTTP = @{}
    Caches = @{}
}

# 1. EventEmitter Patterns
Write-Host "1️⃣  EventEmitter Patterns..." -ForegroundColor Yellow
$emitterCreations = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "new EventEmitter\(\)" | 
    Select-Object -ExpandProperty Path -Unique
$listenersNoCleanup = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "\.on\(" | 
    Where-Object { $_.Line -notmatch "\.off\(" } | 
    Select-Object -ExpandProperty Path -Unique
$maxListenersSet = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "setMaxListeners" | 
    Select-Object -ExpandProperty Path -Unique

$results.EventEmitters = @{
    Created = $emitterCreations.Count
    ListenersWithoutCleanup = $listenersNoCleanup.Count
    MaxListenersSet = $maxListenersSet.Count
    Files = $emitterCreations
    Risk = if ($listenersNoCleanup.Count -gt 0) { "🔴 CRITICAL" } else { "✅ OK" }
}

Write-Host "   EventEmitters created: $($emitterCreations.Count)" -ForegroundColor White
Write-Host "   Listeners without .off(): $($listenersNoCleanup.Count)" -ForegroundColor $(if ($listenersNoCleanup.Count -gt 0) { "Red" } else { "Green" })
Write-Host "   setMaxListeners() calls: $($maxListenersSet.Count)" -ForegroundColor White
Write-Host "   Risk: $($results.EventEmitters.Risk)`n" -ForegroundColor $(if ($listenersNoCleanup.Count -gt 0) { "Red" } else { "Green" })

# 2. Map/Set Collections
Write-Host "2️⃣  Map/Set Collections..." -ForegroundColor Yellow
$mapSetCreations = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "new Map\(|new Set\(" | 
    Select-Object -ExpandProperty Path -Unique
$privateMaps = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "private.*Map<|private.*Set<" | 
    Select-Object -ExpandProperty Path -Unique
$sizeLimits = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "MAX_SIZE|maxSize|size.*>=|\.size.*>" | 
    Select-Object -ExpandProperty Path -Unique

$results.Collections = @{
    Created = $mapSetCreations.Count
    Private = $privateMaps.Count
    WithSizeLimits = $sizeLimits.Count
    Files = $mapSetCreations
    Risk = if ($privateMaps.Count -gt $sizeLimits.Count) { "🟡 HIGH" } else { "✅ OK" }
}

Write-Host "   Maps/Sets created: $($mapSetCreations.Count)" -ForegroundColor White
Write-Host "   Private Maps/Sets: $($privateMaps.Count)" -ForegroundColor White
Write-Host "   With size limits: $($sizeLimits.Count)" -ForegroundColor $(if ($privateMaps.Count -gt $sizeLimits.Count) { "Yellow" } else { "Green" })
Write-Host "   Risk: $($results.Collections.Risk)`n" -ForegroundColor $(if ($privateMaps.Count -gt $sizeLimits.Count) { "Yellow" } else { "Green" })

# 3. Timers
Write-Host "3️⃣  Timers (setInterval/setTimeout)..." -ForegroundColor Yellow
$timersCreated = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "setInterval\(|setTimeout\(" | 
    Select-Object -ExpandProperty Path -Unique
$timersCleared = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "clearInterval\(|clearTimeout\(" | 
    Select-Object -ExpandProperty Path -Unique

$results.Timers = @{
    Created = $timersCreated.Count
    Cleared = $timersCleared.Count
    Files = $timersCreated
    Risk = if ($timersCreated.Count -gt $timersCleared.Count) { "🔴 CRITICAL" } else { "✅ OK" }
}

Write-Host "   Timers created: $($timersCreated.Count)" -ForegroundColor White
Write-Host "   Timers cleared: $($timersCleared.Count)" -ForegroundColor $(if ($timersCreated.Count -gt $timersCleared.Count) { "Red" } else { "Green" })
Write-Host "   Risk: $($results.Timers.Risk)`n" -ForegroundColor $(if ($timersCreated.Count -gt $timersCleared.Count) { "Red" } else { "Green" })

# 4. Database Connections
Write-Host "4️⃣  Database Connections..." -ForegroundColor Yellow
$clientsCreated = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "new PrismaClient" | 
    Select-Object -ExpandProperty Path -Unique
$disconnects = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "\`$disconnect" | 
    Select-Object -ExpandProperty Path -Unique

$results.Database = @{
    ClientsCreated = $clientsCreated.Count
    DisconnectCalls = $disconnects.Count
    Files = $clientsCreated
    Risk = if ($clientsCreated.Count -gt $disconnects.Count) { "🔴 CRITICAL" } else { "✅ OK" }
}

Write-Host "   Prisma clients created: $($clientsCreated.Count)" -ForegroundColor White
Write-Host "   `$disconnect() calls: $($disconnects.Count)" -ForegroundColor $(if ($clientsCreated.Count -gt $disconnects.Count) { "Red" } else { "Green" })
Write-Host "   Risk: $($results.Database.Risk)`n" -ForegroundColor $(if ($clientsCreated.Count -gt $disconnects.Count) { "Red" } else { "Green" })

# 5. File Operations
Write-Host "5️⃣  File Operations..." -ForegroundColor Yellow
$streamsCreated = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "createReadStream|createWriteStream|fs\.open" | 
    Select-Object -ExpandProperty Path -Unique
$streamsClosed = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "\.close\(|\.end\(" | 
    Select-Object -ExpandProperty Path -Unique

$results.Files = @{
    StreamsCreated = $streamsCreated.Count
    StreamsClosed = $streamsClosed.Count
    Files = $streamsCreated
    Risk = if ($streamsCreated.Count -gt $streamsClosed.Count) { "🟡 HIGH" } else { "✅ OK" }
}

Write-Host "   Streams created: $($streamsCreated.Count)" -ForegroundColor White
Write-Host "   Streams closed: $($streamsClosed.Count)" -ForegroundColor $(if ($streamsCreated.Count -gt $streamsClosed.Count) { "Yellow" } else { "Green" })
Write-Host "   Risk: $($results.Files.Risk)`n" -ForegroundColor $(if ($streamsCreated.Count -gt $streamsClosed.Count) { "Yellow" } else { "Green" })

# 6. Child Processes
Write-Host "6️⃣  Child Processes..." -ForegroundColor Yellow
$processesSpawned = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js,*.ps1 -ErrorAction SilentlyContinue | 
    Select-String "spawn\(|exec\(|fork\(" | 
    Select-Object -ExpandProperty Path -Unique
$processesKilled = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js,*.ps1 -ErrorAction SilentlyContinue | 
    Select-String "\.kill\(|process\.exit" | 
    Select-Object -ExpandProperty Path -Unique

$results.Processes = @{
    Spawned = $processesSpawned.Count
    Killed = $processesKilled.Count
    Files = $processesSpawned
    Risk = if ($processesSpawned.Count -gt 0 -and $processesKilled.Count -eq 0) { "🟡 HIGH" } else { "✅ OK" }
}

Write-Host "   Processes spawned: $($processesSpawned.Count)" -ForegroundColor White
Write-Host "   Kill handlers: $($processesKilled.Count)" -ForegroundColor $(if ($processesSpawned.Count -gt $processesKilled.Count) { "Yellow" } else { "Green" })
Write-Host "   Risk: $($results.Processes.Risk)`n" -ForegroundColor $(if ($processesSpawned.Count -gt $processesKilled.Count) { "Yellow" } else { "Green" })

# 7. HTTP/WebSocket Connections
Write-Host "7️⃣  HTTP/WebSocket Connections..." -ForegroundColor Yellow
$httpClients = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "axios|fetch\(|http\.request|WebSocket" | 
    Select-Object -ExpandProperty Path -Unique
$timeouts = Get-ChildItem -Path src,scripts -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "timeout:|AbortController" | 
    Select-Object -ExpandProperty Path -Unique

$results.HTTP = @{
    Clients = $httpClients.Count
    WithTimeouts = $timeouts.Count
    Files = $httpClients
    Risk = if ($httpClients.Count -gt $timeouts.Count) { "🟡 HIGH" } else { "✅ OK" }
}

Write-Host "   HTTP/WS clients: $($httpClients.Count)" -ForegroundColor White
Write-Host "   With timeouts: $($timeouts.Count)" -ForegroundColor $(if ($httpClients.Count -gt $timeouts.Count) { "Yellow" } else { "Green" })
Write-Host "   Risk: $($results.HTTP.Risk)`n" -ForegroundColor $(if ($httpClients.Count -gt $timeouts.Count) { "Yellow" } else { "Green" })

# 8. Cache Implementations
Write-Host "8️⃣  Cache Implementations..." -ForegroundColor Yellow
$caches = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "cache\.set|Cache\(|new.*Cache" | 
    Select-Object -ExpandProperty Path -Unique
$withTTL = Get-ChildItem -Path src -Recurse -Include *.ts,*.js -ErrorAction SilentlyContinue | 
    Select-String "ttl:|TTL|expir" | 
    Select-Object -ExpandProperty Path -Unique

$results.Caches = @{
    Implementations = $caches.Count
    WithTTL = $withTTL.Count
    Files = $caches
    Risk = if ($caches.Count -gt $withTTL.Count) { "🟡 HIGH" } else { "✅ OK" }
}

Write-Host "   Cache implementations: $($caches.Count)" -ForegroundColor White
Write-Host "   With TTL: $($withTTL.Count)" -ForegroundColor $(if ($caches.Count -gt $withTTL.Count) { "Yellow" } else { "Green" })
Write-Host "   Risk: $($results.Caches.Risk)`n" -ForegroundColor $(if ($caches.Count -gt $withTTL.Count) { "Yellow" } else { "Green" })

# Summary
Write-Host "`n📊 Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$criticalIssues = @($results.GetEnumerator() | Where-Object { $_.Value.Risk -eq "🔴 CRITICAL" })
$highIssues = @($results.GetEnumerator() | Where-Object { $_.Value.Risk -eq "🟡 HIGH" })
$okCategories = @($results.GetEnumerator() | Where-Object { $_.Value.Risk -eq "✅ OK" })

Write-Host "🔴 CRITICAL Issues: $($criticalIssues.Count)" -ForegroundColor $(if ($criticalIssues.Count -gt 0) { "Red" } else { "Green" })
Write-Host "🟡 HIGH Issues: $($highIssues.Count)" -ForegroundColor $(if ($highIssues.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "✅ OK Categories: $($okCategories.Count)" -ForegroundColor Green

if ($criticalIssues.Count -gt 0) {
    Write-Host "`n⚠️  CRITICAL issues found:" -ForegroundColor Red
    foreach ($issue in $criticalIssues) {
        Write-Host "   - $($issue.Name)" -ForegroundColor Red
    }
}

if ($highIssues.Count -gt 0) {
    Write-Host "`n⚠️  HIGH priority issues found:" -ForegroundColor Yellow
    foreach ($issue in $highIssues) {
        Write-Host "   - $($issue.Name)" -ForegroundColor Yellow
    }
}

# Detailed output
if ($Detailed) {
    Write-Host "`n📋 Detailed File Listings" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    foreach ($category in $results.GetEnumerator()) {
        if ($category.Value.Files -and $category.Value.Files.Count -gt 0) {
            Write-Host "`n$($category.Name):" -ForegroundColor Yellow
            $category.Value.Files | ForEach-Object {
                Write-Host "   $($_ -replace [regex]::Escape($PWD), '.')" -ForegroundColor Gray
            }
        }
    }
}

# Export results
if ($Export) {
    $exportPath = "docs/RESOURCE-LEAK-AUDIT-RESULTS.json"
    $results | ConvertTo-Json -Depth 10 | Out-File $exportPath
    Write-Host "`n💾 Results exported to: $exportPath" -ForegroundColor Green
}

Write-Host "`n✅ Audit complete. See docs/RESOURCE-LEAK-AUDIT.md for fix guidance." -ForegroundColor Green
Write-Host "   Run with -Detailed for file listings" -ForegroundColor Gray
Write-Host "   Run with -Export to save JSON results`n" -ForegroundColor Gray

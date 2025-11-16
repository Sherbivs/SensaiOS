$envFile = 'secrets/Infinity-Gauntlet.env'
if (!(Test-Path $envFile)) {
  throw 'Env file not found'
}
$apiKey = (Get-Content $envFile | Select-String -Pattern '^RENDER_API_KEY=' | ForEach-Object { ($_ -split '=',2)[1].Trim() })[0]
if (-not $apiKey) {
  throw 'RENDER_API_KEY missing'
}
$serviceId = 'srv-d3snk2ndiees73cn709g'
$jobId = 'job-d48pmf3ipnbc73dkrr6g'
$headers = @{
  Authorization = "Bearer $apiKey"
  'Content-Type' = 'application/json'
}
$uri = "https://api.render.com/v1/services/$serviceId/jobs/$jobId/cancel"
Write-Host "Requesting cancel: $uri"
$response = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -ErrorAction Stop
$response | ConvertTo-Json -Depth 5

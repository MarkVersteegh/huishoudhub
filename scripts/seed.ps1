<#
.SYNOPSIS
    Importeert taken uit data/taken-seed.json naar PocketBase.
.DESCRIPTION
    Veilig: slaat de import over als er al taken in de database staan.
    Gebruik -Force om toch te importeren (voegt toe, verwijdert niets).
.PARAMETER BaseUrl
    URL van PocketBase. Standaard: http://localhost:8090
.PARAMETER SeedFile
    Pad naar het JSON-bestand met taken. Standaard: ../data/taken-seed.json
.PARAMETER Force
    Importeer ook als de database al taken bevat.
.PARAMETER Clear
    Verwijder eerst alle bestaande taken vóór de import.
.EXAMPLE
    .\seed.ps1
    .\seed.ps1 -Force
    .\seed.ps1 -Clear
    .\seed.ps1 -BaseUrl http://192.168.1.50:8090
#>
param(
    [string]$BaseUrl = "http://localhost:8090",
    [string]$SeedFile = "",
    [switch]$Force,
    [switch]$Clear
)

$ErrorActionPreference = "Stop"

if (-not $SeedFile) {
    $SeedFile = Join-Path $PSScriptRoot "..\data\taken-seed.json"
}
$SeedFile = Resolve-Path $SeedFile

if (-not (Test-Path $SeedFile)) {
    Write-Error "Seed-bestand niet gevonden: $SeedFile"
    exit 1
}

# Verwijder bestaande taken indien -Clear opgegeven
if ($Clear) {
    $existing = Invoke-RestMethod "$BaseUrl/api/collections/tasks/records?perPage=500"
    $count = $existing.totalItems
    if ($count -gt 0) {
        Write-Host "Verwijderen van $count bestaande taken..."
        $existing.items | ForEach-Object {
            Invoke-RestMethod "$BaseUrl/api/collections/tasks/records/$($_.id)" -Method DELETE | Out-Null
        }
        Write-Host "Klaar."
    }
}

# Controleer of database al taken heeft
$check = Invoke-RestMethod "$BaseUrl/api/collections/tasks/records?perPage=1"
if ($check.totalItems -gt 0 -and -not $Force -and -not $Clear) {
    Write-Host "Database heeft al $($check.totalItems) taken — seed overgeslagen."
    Write-Host "Gebruik -Force om toch toe te voegen, of -Clear om eerst op te schonen."
    exit 0
}

$tasks = Get-Content $SeedFile -Raw -Encoding UTF8 | ConvertFrom-Json
$ok = 0
$err = 0

Write-Host "Importeren van $($tasks.Count) taken uit $SeedFile..."

foreach ($task in $tasks) {
    try {
        $body = $task | ConvertTo-Json -Depth 5 -Compress
        Invoke-RestMethod "$BaseUrl/api/collections/tasks/records" `
            -Method POST -ContentType "application/json" -Body $body | Out-Null
        Write-Host "  + $($task.title) ($($task.person))"
        $ok++
    } catch {
        Write-Host "  ! $($task.title): $_" -ForegroundColor Red
        $err++
    }
}

Write-Host ""
Write-Host "$ok taken toegevoegd, $err fouten."

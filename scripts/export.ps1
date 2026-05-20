<#
.SYNOPSIS
    Exporteert alle taken uit PocketBase naar een JSON-bestand.
.DESCRIPTION
    Exporteert taakinstanties in het actuele tasks-schema.
    Interne PocketBase-velden (collectionId, collectionName, created, updated) worden weggelaten.
.PARAMETER BaseUrl
    URL van PocketBase. Standaard: http://localhost:8090
.PARAMETER Output
    Pad voor het uitvoerbestand. Standaard: ../exports/taken-YYYY-MM-DD-HHMMSS.json
.EXAMPLE
    .\export.ps1
    .\export.ps1 -Output "D:\backup\taken.json"
    .\export.ps1 -BaseUrl http://192.168.1.50:8090 -Output "\\nas\backup\taken.json"
#>
param(
    [string]$BaseUrl = "http://localhost:8090",
    [string]$Output = ""
)

$ErrorActionPreference = "Stop"

# Haal alle taken op via paginering
$allTasks = @()
$page = 1
do {
    $res = Invoke-RestMethod "$BaseUrl/api/collections/tasks/records?perPage=500&page=$page&sort=date"
    $allTasks += $res.items
    $page++
} while ($allTasks.Count -lt $res.totalItems)

if ($allTasks.Count -eq 0) {
    Write-Host "Geen taken gevonden."
    exit 0
}

# Strip interne PocketBase-velden
$export = $allTasks | ForEach-Object {
    [ordered]@{
        id        = $_.id
        series_id = $_.series_id
        persons   = if ($_.persons) { $_.persons } else { @() }
        title     = $_.title
        date      = $_.date
        time      = $_.time
        clock     = $_.clock
        note      = $_.note
        subtasks  = if ($_.subtasks) { $_.subtasks } else { @() }
        done_at   = $_.done_at
        done_by   = $_.done_by
    }
}

# Bepaal uitvoerpad
if (-not $Output) {
    $exportsDir = Join-Path $PSScriptRoot "..\exports"
    New-Item -ItemType Directory -Path $exportsDir -Force | Out-Null
    $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $Output = Join-Path $exportsDir "taken-$timestamp.json"
}

$outputDir = Split-Path $Output -Parent
if ($outputDir) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

$export | ConvertTo-Json -Depth 5 | Set-Content $Output -Encoding UTF8

Write-Host "Geëxporteerd: $Output ($($allTasks.Count) taken)"

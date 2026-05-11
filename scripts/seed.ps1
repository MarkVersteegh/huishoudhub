<#
.SYNOPSIS
    Importeert series en taken uit data/series-seed.json naar PocketBase.
.DESCRIPTION
    Maakt series-records aan en genereert taakinstanties op basis van de repeat_rule.
    Veilig: slaat over als er al taken zijn, tenzij -Force of -Clear opgegeven.
.PARAMETER BaseUrl
    URL van PocketBase. Standaard: http://localhost:8090
.PARAMETER SeedFile
    Pad naar het JSON-bestand met series. Standaard: ../data/series-seed.json
.PARAMETER Force
    Importeer ook als de database al taken bevat (voegt toe).
.PARAMETER Clear
    Verwijder eerst alle bestaande taken en series, daarna importeren.
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
    $SeedFile = Join-Path $PSScriptRoot "..\data\series-seed.json"
}
$SeedFile = Resolve-Path $SeedFile

if (-not (Test-Path $SeedFile)) {
    Write-Error "Seed-bestand niet gevonden: $SeedFile"
    exit 1
}

# --- Datumgeneratie ---

function Get-SeriesDates {
    param(
        [string]$StartDate,
        [string]$EndDate,
        [hashtable]$Rule
    )
    $dates = @()
    $start = [DateTime]::ParseExact($StartDate, "yyyy-MM-dd", $null)
    $end   = [DateTime]::ParseExact($EndDate,   "yyyy-MM-dd", $null)
    $cur   = $start

    switch ($Rule.type) {
        "once" {
            $dates += $StartDate
        }
        "daily" {
            $interval = if ($Rule.ContainsKey("interval")) { [int]$Rule.interval } else { 1 }
            while ($cur -le $end) {
                $dates += $cur.ToString("yyyy-MM-dd")
                $cur = $cur.AddDays($interval)
            }
        }
        "weekly" {
            if ($Rule.ContainsKey("days")) {
                # Specifieke weekdagen: itereer dag voor dag
                $targetDays = $Rule.days | ForEach-Object { [int]$_ }
                while ($cur -le $end) {
                    if ($targetDays -contains [int]$cur.DayOfWeek) {
                        $dates += $cur.ToString("yyyy-MM-dd")
                    }
                    $cur = $cur.AddDays(1)
                }
            } else {
                $interval = if ($Rule.ContainsKey("interval")) { [int]$Rule.interval } else { 1 }
                while ($cur -le $end) {
                    $dates += $cur.ToString("yyyy-MM-dd")
                    $cur = $cur.AddDays(7 * $interval)
                }
            }
        }
        "weekdays" {
            while ($cur -le $end) {
                if ($cur.DayOfWeek -ne [DayOfWeek]::Saturday -and $cur.DayOfWeek -ne [DayOfWeek]::Sunday) {
                    $dates += $cur.ToString("yyyy-MM-dd")
                }
                $cur = $cur.AddDays(1)
            }
        }
        "monthly" {
            $interval = if ($Rule.ContainsKey("interval")) { [int]$Rule.interval } else { 1 }
            while ($cur -le $end) {
                $dates += $cur.ToString("yyyy-MM-dd")
                $cur = $cur.AddMonths($interval)
            }
        }
        default {
            Write-Warning "Onbekend repeat-type: $($Rule.type)"
        }
    }
    return $dates
}

# --- Verwijder bestaande data indien -Clear ---

if ($Clear) {
    Write-Host "Verwijderen van bestaande taken..."
    do {
        $res = Invoke-RestMethod "$BaseUrl/api/collections/tasks/records?perPage=200&page=1"
        if ($res.items.Count -eq 0) { break }
        $res.items | ForEach-Object {
            Invoke-RestMethod "$BaseUrl/api/collections/tasks/records/$($_.id)" -Method DELETE | Out-Null
        }
    } while ($res.totalItems -gt 0)

    Write-Host "Verwijderen van bestaande series..."
    do {
        $res = Invoke-RestMethod "$BaseUrl/api/collections/series/records?perPage=200&page=1"
        if ($res.items.Count -eq 0) { break }
        $res.items | ForEach-Object {
            Invoke-RestMethod "$BaseUrl/api/collections/series/records/$($_.id)" -Method DELETE | Out-Null
        }
    } while ($res.totalItems -gt 0)

    Write-Host "Klaar met opschonen."
}

# --- Controleer of database al taken heeft ---

$check = Invoke-RestMethod "$BaseUrl/api/collections/tasks/records?perPage=1"
if ($check.totalItems -gt 0 -and -not $Force -and -not $Clear) {
    Write-Host "Database heeft al $($check.totalItems) taken - seed overgeslagen."
    Write-Host "Gebruik -Force om toe te voegen, of -Clear om eerst op te schonen."
    exit 0
}

# --- Importeer series en genereer taken ---

$seriesDefs = Get-Content $SeedFile -Raw -Encoding UTF8 | ConvertFrom-Json
$totalSeries = 0
$totalTasks  = 0
$errors      = 0

Write-Host "Importeren van $($seriesDefs.Count) series uit $SeedFile..."

foreach ($def in $seriesDefs) {
    # Maak series-record aan
    $personsArr = [string[]]($def.persons | ForEach-Object { [string]$_ })
    $seriesBody = @{
        title             = $def.title
        persons           = $personsArr
        time              = $def.time
        clock             = $def.clock
        note              = $def.note
        repeat_rule       = $def.repeat_rule
        start_date        = $def.start_date
        end_date          = $def.end_date
        subtasks_template = if ($def.subtasks_template) { $def.subtasks_template } else { @() }
    } | ConvertTo-Json -Depth 5

    try {
        $series = Invoke-RestMethod "$BaseUrl/api/collections/series/records" `
            -Method POST -ContentType "application/json" -Body $seriesBody
        $totalSeries++
    } catch {
        Write-Host "  ! Serie aanmaken mislukt voor '$($def.title)': $_" -ForegroundColor Red
        $errors++
        continue
    }

    # Genereer datums op basis van repeat_rule
    $rule = @{}
    $def.repeat_rule.PSObject.Properties | ForEach-Object { $rule[$_.Name] = $_.Value }

    $dates = Get-SeriesDates -StartDate $def.start_date -EndDate $def.end_date -Rule $rule

    foreach ($date in $dates) {
        $subtasks = @()
        if ($def.subtasks_template) {
            $subtasks = $def.subtasks_template | ForEach-Object {
                @{ title = $_.title; done_at = $null }
            }
        }

        $taskBody = @{
            series_id = $series.id
            title     = $def.title
            persons   = $personsArr
            date      = $date
            time      = $def.time
            clock     = $def.clock
            note      = $def.note
            subtasks  = $subtasks
            done_at   = $null
            done_by   = $null
        } | ConvertTo-Json -Depth 5

        try {
            Invoke-RestMethod "$BaseUrl/api/collections/tasks/records" `
                -Method POST -ContentType "application/json" -Body $taskBody | Out-Null
            $totalTasks++
        } catch {
            Write-Host "  ! Taak aanmaken mislukt: $($def.title) $date - $_" -ForegroundColor Red
            $errors++
        }
    }

    $persons = if ($def.persons -and $def.persons.Count -gt 0) { $def.persons -join "/" } else { "(geen eigenaar)" }
    Write-Host "  + $($def.title) [$persons] - $($dates.Count) instanties"
}

Write-Host ""
Write-Host "$totalSeries series, $totalTasks taken aangemaakt, $errors fouten."

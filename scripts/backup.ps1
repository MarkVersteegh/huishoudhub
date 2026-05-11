<#
.SYNOPSIS
    Maakt een PocketBase DB-backup en kopieert die optioneel naar een andere locatie.
.DESCRIPTION
    Gebruikt de PocketBase backup-API. De backup (zip) wordt opgeslagen in
    ./pb_data/backups/ en is via de gemounte Docker-volume direct toegankelijk op de host.
.PARAMETER BaseUrl
    URL van PocketBase. Standaard: http://localhost:8090
.PARAMETER AdminEmail
    E-mailadres van de PocketBase admin. Standaard: admin@huishoudhub.local
.PARAMETER AdminPassword
    Wachtwoord van de admin. Standaard: Huishoud2026!
.PARAMETER CopyTo
    Optioneel pad waarnaar de backup gekopieerd wordt (bijv. NAS-share).
.EXAMPLE
    .\backup.ps1
    .\backup.ps1 -CopyTo "\\nas\backup\huishoudhub"
    .\backup.ps1 -BaseUrl http://192.168.1.50:8090 -CopyTo "/volume1/backup/huishoudhub"
#>
param(
    [string]$BaseUrl = "http://localhost:8090",
    [string]$AdminEmail = "admin@huishoudhub.local",
    [string]$AdminPassword = "Huishoud2026!",
    [string]$CopyTo = ""
)

$ErrorActionPreference = "Stop"

# Authenticeer als admin (PocketBase v0.22+: _superusers collectie)
$authBody = @{ identity = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
try {
    $auth = Invoke-RestMethod "$BaseUrl/api/collections/_superusers/auth-with-password" `
        -Method POST -ContentType "application/json" -Body $authBody
} catch {
    # Fallback voor oudere PocketBase-versies
    $auth = Invoke-RestMethod "$BaseUrl/api/admins/auth-with-password" `
        -Method POST -ContentType "application/json" -Body $authBody
}
$headers = @{ Authorization = "Bearer $($auth.token)" }

# Trigger backup
$timestamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"
$backupName = "huishoudhub-$timestamp.zip"
Invoke-RestMethod "$BaseUrl/api/backups" -Method POST -Headers $headers `
    -ContentType "application/json" `
    -Body (@{ name = $backupName } | ConvertTo-Json) | Out-Null

Write-Host "Backup aangemaakt: $backupName"

# Wacht even zodat PocketBase de backup kan afronden
Start-Sleep 2

# Optioneel kopiëren naar een andere locatie
if ($CopyTo) {
    $backupsDir = Join-Path $PSScriptRoot "..\pb_data\backups"
    $backupPath = Join-Path $backupsDir $backupName
    New-Item -ItemType Directory -Path $CopyTo -Force | Out-Null
    $dest = Join-Path $CopyTo $backupName

    if (Test-Path $backupPath) {
        Copy-Item $backupPath $dest
        Write-Host "Gekopieerd naar: $dest"
    } else {
        # Fallback: Docker volume zit in WSL op Windows — gebruik docker cp
        $container = "huishoudhub-pocketbase-1"
        docker cp "${container}:/pb_data/backups/$backupName" $dest 2>&1 | Out-Null
        if (Test-Path $dest) {
            Write-Host "Gekopieerd via docker cp naar: $dest"
        } else {
            Write-Warning "Kopiëren mislukt. Backup staat in container: /pb_data/backups/$backupName"
        }
    }
}

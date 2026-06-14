# Restore ABC_ERP from mongodump archive
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,
    [string]$TargetUri = "",
    [string]$EnvFile = "$PSScriptRoot\..\.env"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command mongorestore -ErrorAction SilentlyContinue)) {
    Write-Error "mongorestore not found. Install MongoDB Database Tools."
}

if (-not (Test-Path $ArchivePath)) {
    Write-Error "Archive not found: $ArchivePath"
}

if (-not $TargetUri) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*MONGODB_URI=(.+)$') {
            $TargetUri = $matches[1].Trim()
        }
    }
}

if (-not $TargetUri) {
    Write-Error "Provide -TargetUri or set MONGODB_URI in .env"
}

Write-Warning "This will DROP and replace data in the target database. Press Ctrl+C to cancel."
Start-Sleep -Seconds 5

Write-Host "Restoring from $ArchivePath ..."
mongorestore --uri="$TargetUri" --gzip --archive="$ArchivePath" --drop

if ($LASTEXITCODE -ne 0) {
    Write-Error "mongorestore failed with exit code $LASTEXITCODE"
}

Write-Host "Restore completed."

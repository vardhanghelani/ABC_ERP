# Backup ABC_ERP MongoDB database using MONGODB_URI from backend/.env
param(
    [string]$EnvFile = "$PSScriptRoot\..\.env",
    [string]$BackupDir = "$PSScriptRoot\..\..\backups"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command mongodump -ErrorAction SilentlyContinue)) {
    Write-Error "mongodump not found. Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools"
}

if (-not (Test-Path $EnvFile)) {
    Write-Error ".env not found at $EnvFile"
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*MONGODB_URI=(.+)$') {
        $env:MONGODB_URI = $matches[1].Trim()
    }
}

if (-not $env:MONGODB_URI) {
    Write-Error "MONGODB_URI not set in $EnvFile"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $BackupDir "ABC_ERP-$timestamp.gz"

Write-Host "Backing up to $archive ..."
mongodump --uri="$env:MONGODB_URI" --gzip --archive="$archive"

if ($LASTEXITCODE -ne 0) {
    Write-Error "mongodump failed with exit code $LASTEXITCODE"
}

Write-Host "Backup completed: $archive"
Write-Host "Size: $((Get-Item $archive).Length / 1MB) MB"

param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = "backups"
)

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Error "DATABASE_URL is required. Set it in your environment or pass -DatabaseUrl."
  exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump was not found. Install PostgreSQL client tools and make sure pg_dump is on PATH."
  exit 1
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$target = Join-Path $OutputDir "cyberslash_$timestamp.dump"

pg_dump $DatabaseUrl -Fc -f $target
if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup failed."
  exit $LASTEXITCODE
}

Write-Output "[OK] Backup written to $target"

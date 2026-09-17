param(
  [string]$EnvFile = ".env.migration.local",
  [string]$OutputRoot = ".backups/supabase-cloud"
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing $Path. Add SUPABASE_DB_PASSWORD to this ignored file before running the dump."
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) {
      continue
    }

    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }

  return $values
}

function Invoke-SupabaseDump {
  param(
    [string[]]$Arguments,
    [string]$Description
  )

  Write-Host "Creating $Description..."
  & supabase db dump @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create $Description."
  }
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string[]]$Content
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllLines($Path, $Content, $encoding)
}

$envValues = Read-EnvFile -Path $EnvFile
$projectRef = if ($envValues.SUPABASE_PROJECT_REF) {
  $envValues.SUPABASE_PROJECT_REF
} else {
  "lcxwssdynhfdkcrieuvm"
}
$poolerHost = if ($envValues.SUPABASE_POOLER_HOST) {
  $envValues.SUPABASE_POOLER_HOST
} else {
  "aws-1-ap-southeast-1.pooler.supabase.com"
}
$poolerPort = if ($envValues.SUPABASE_POOLER_PORT) {
  $envValues.SUPABASE_POOLER_PORT
} else {
  "5432"
}
$databasePassword = $envValues.SUPABASE_DB_PASSWORD

if (-not $databasePassword) {
  throw "SUPABASE_DB_PASSWORD is missing from $EnvFile."
}

$encodedUser = [Uri]::EscapeDataString("postgres.$projectRef")
$encodedPassword = [Uri]::EscapeDataString($databasePassword)
$databaseUrl = "postgresql://${encodedUser}:${encodedPassword}@${poolerHost}:${poolerPort}/postgres"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDirectory = Join-Path $OutputRoot $timestamp

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$resolvedOutputDirectory = (Resolve-Path -LiteralPath $outputDirectory).Path

$rolesFile = Join-Path $resolvedOutputDirectory "roles.sql"
$schemaFile = Join-Path $resolvedOutputDirectory "schema.sql"
$dataFile = Join-Path $resolvedOutputDirectory "data.sql"
$historySchemaFile = Join-Path $resolvedOutputDirectory "migration-history-schema.sql"
$historyDataFile = Join-Path $resolvedOutputDirectory "migration-history-data.sql"
$restoreFile = Join-Path $resolvedOutputDirectory "restore.sql"
$manifestFile = Join-Path $resolvedOutputDirectory "manifest.sha256"

Invoke-SupabaseDump `
  -Description "database roles" `
  -Arguments @("--db-url", $databaseUrl, "--file", $rolesFile, "--role-only")

Invoke-SupabaseDump `
  -Description "database schema, indexes, views, functions, triggers, grants, and RLS policies" `
  -Arguments @("--db-url", $databaseUrl, "--file", $schemaFile)

Invoke-SupabaseDump `
  -Description "all database rows" `
  -Arguments @("--db-url", $databaseUrl, "--file", $dataFile, "--data-only", "--use-copy")

Invoke-SupabaseDump `
  -Description "migration history schema" `
  -Arguments @(
    "--db-url", $databaseUrl,
    "--file", $historySchemaFile,
    "--schema", "supabase_migrations"
  )

Invoke-SupabaseDump `
  -Description "migration history data" `
  -Arguments @(
    "--db-url", $databaseUrl,
    "--file", $historyDataFile,
    "--schema", "supabase_migrations",
    "--data-only",
    "--use-copy"
  )

$restoreSql = @'
\set ON_ERROR_STOP on
\ir roles.sql
\ir schema.sql
SET session_replication_role = replica;
\ir data.sql
SET session_replication_role = origin;
\ir migration-history-schema.sql
\ir migration-history-data.sql
'@
Write-Utf8NoBom -Path $restoreFile -Content @($restoreSql)

$dumpFiles = @(
  $rolesFile,
  $schemaFile,
  $dataFile,
  $historySchemaFile,
  $historyDataFile,
  $restoreFile
)

$manifestLines = foreach ($file in $dumpFiles) {
  $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($file))"
}
Write-Utf8NoBom -Path $manifestFile -Content $manifestLines

Write-Host ""
Write-Host "Supabase Cloud dump completed:"
Write-Host $resolvedOutputDirectory
Get-ChildItem -LiteralPath $resolvedOutputDirectory |
  Select-Object Name, Length, LastWriteTime |
  Format-Table -AutoSize

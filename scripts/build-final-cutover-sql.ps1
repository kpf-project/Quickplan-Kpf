param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param([string]$Path, [string[]]$Lines)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, (($Lines -join "`n") + "`n"), $encoding)
}

$resolvedDump = (Resolve-Path -LiteralPath $DumpFile).Path
$outputDirectory = Split-Path -Parent $resolvedDump
$dumpName = Split-Path -Leaf $resolvedDump

$tables = [ordered]@{}
$currentKey = $null

foreach ($line in [IO.File]::ReadLines($resolvedDump)) {
  if ($line -match '^COPY "([^"]+)"\."([^"]+)" \((.*)\) FROM stdin;$') {
    $schemaName = $matches[1]
    $tableName = $matches[2]
    $columns = [regex]::Matches($matches[3], '"([^"]+)"') |
      ForEach-Object { $_.Groups[1].Value }
    $currentKey = "$schemaName.$tableName"
    $tables[$currentKey] = [ordered]@{
      Schema = $schemaName
      Table = $tableName
      Columns = @($columns)
      Rows = [int64]0
    }
    continue
  }

  if ($currentKey -and $line -eq '\.') {
    $currentKey = $null
    continue
  }

  if ($currentKey) {
    $tables[$currentKey].Rows += 1
  }
}

if ($tables.Count -eq 0) {
  throw "No COPY blocks found in $resolvedDump"
}

$preflight = @(
  '\set ON_ERROR_STOP on',
  'CREATE TEMP TABLE _cutover_expected_columns (',
  '  schema_name text NOT NULL,',
  '  table_name text NOT NULL,',
  '  column_names text[] NOT NULL',
  ');'
)

foreach ($entry in $tables.Values) {
  $columnsSql = ($entry.Columns | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ', '
  $preflight += "INSERT INTO _cutover_expected_columns VALUES ('$($entry.Schema)', '$($entry.Table)', ARRAY[$columnsSql]);"
}

$preflight += @(
  '',
  'CREATE TEMP VIEW _cutover_schema_mismatches AS',
  'SELECT',
  '  expected.schema_name,',
  '  expected.table_name,',
  '  expected.column_names AS expected_columns,',
  '  actual.column_names AS actual_columns',
  'FROM _cutover_expected_columns expected',
  'LEFT JOIN LATERAL (',
  '  SELECT array_agg(columns.column_name::text ORDER BY columns.ordinal_position) AS column_names',
  '  FROM information_schema.columns columns',
  '  WHERE columns.table_schema = expected.schema_name',
  '    AND columns.table_name = expected.table_name',
  "    AND columns.is_generated = 'NEVER'",
  ') actual ON true',
  'WHERE actual.column_names IS DISTINCT FROM expected.column_names;',
  '',
  'TABLE _cutover_schema_mismatches;',
  '',
  'DO $$',
  'BEGIN',
  '  IF EXISTS (SELECT 1 FROM _cutover_schema_mismatches) THEN',
  "    RAISE EXCEPTION 'CUTOVER PREFLIGHT FAILED: target schema does not match the Cloud dump';",
  '  END IF;',
  'END',
  '$$;',
  '',
  "SELECT 'CUTOVER_PREFLIGHT_OK' AS result, count(*) AS checked_tables",
  'FROM _cutover_expected_columns;'
)

$restore = @(
  '\set ON_ERROR_STOP on',
  '\echo Starting final Cloud data replacement...',
  'BEGIN;',
  "SET LOCAL lock_timeout = '15s';",
  'SET LOCAL statement_timeout = 0;',
  'SET LOCAL session_replication_role = replica;',
  ''
)

# Delete Auth children first for readability. FK enforcement is temporarily disabled
# inside this transaction, so public tables can then be deleted in any stable order.
$deleteOrder = @(
  'auth.mfa_amr_claims',
  'auth.refresh_tokens',
  'auth.sessions',
  'auth.identities',
  'auth.users'
) + @($tables.Keys | Where-Object { $_ -like 'public.*' } | Sort-Object -Descending)

foreach ($key in $deleteOrder) {
  if (-not $tables.Contains($key)) {
    continue
  }
  $entry = $tables[$key]
  $restore += "DELETE FROM `"$($entry.Schema)`".`"$($entry.Table)`";"
}

$restore += @(
  '',
  "\ir $dumpName",
  '',
  'COMMIT;',
  '\echo Final Cloud data replacement committed.',
  'SHOW session_replication_role;'
)

$verify = @(
  '\set ON_ERROR_STOP on',
  'CREATE TEMP TABLE _cutover_expected_rows (',
  '  schema_name text NOT NULL,',
  '  table_name text NOT NULL,',
  '  expected_rows bigint NOT NULL',
  ');'
)

foreach ($entry in $tables.Values) {
  $verify += "INSERT INTO _cutover_expected_rows VALUES ('$($entry.Schema)', '$($entry.Table)', $($entry.Rows));"
}

$verify += @(
  '',
  'CREATE TEMP TABLE _cutover_row_mismatches (',
  '  schema_name text,',
  '  table_name text,',
  '  expected_rows bigint,',
  '  actual_rows bigint',
  ');',
  '',
  'DO $$',
  'DECLARE',
  '  expected record;',
  '  actual_count bigint;',
  'BEGIN',
  '  FOR expected IN SELECT * FROM _cutover_expected_rows LOOP',
  "    EXECUTE format('SELECT count(*) FROM %I.%I', expected.schema_name, expected.table_name)",
  '      INTO actual_count;',
  '    IF actual_count IS DISTINCT FROM expected.expected_rows THEN',
  '      INSERT INTO _cutover_row_mismatches',
  '      VALUES (expected.schema_name, expected.table_name, expected.expected_rows, actual_count);',
  '    END IF;',
  '  END LOOP;',
  'END',
  '$$;',
  '',
  'TABLE _cutover_row_mismatches;',
  '',
  'DO $$',
  'BEGIN',
  '  IF EXISTS (SELECT 1 FROM _cutover_row_mismatches) THEN',
  "    RAISE EXCEPTION 'CUTOVER VERIFY FAILED: row counts differ from the final Cloud dump';",
  '  END IF;',
  'END',
  '$$;',
  '',
  "SELECT 'CUTOVER_VERIFY_OK' AS result,",
  '       count(*) AS checked_tables,',
  '       sum(expected_rows) AS checked_rows',
  'FROM _cutover_expected_rows;'
)

$preflightPath = Join-Path $outputDirectory '01-preflight-target.sql'
$restorePath = Join-Path $outputDirectory '02-replace-and-import.sql'
$verifyPath = Join-Path $outputDirectory '03-verify-target.sql'

Write-Utf8NoBom -Path $preflightPath -Lines $preflight
Write-Utf8NoBom -Path $restorePath -Lines $restore
Write-Utf8NoBom -Path $verifyPath -Lines $verify

$manifestFiles = @($resolvedDump, $preflightPath, $restorePath, $verifyPath)
$manifest = foreach ($file in $manifestFiles) {
  $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($file))"
}
Write-Utf8NoBom -Path (Join-Path $outputDirectory 'SHA256SUMS') -Lines $manifest

Write-Host "Generated final cutover package:"
Write-Host $outputDirectory
Write-Host "Tables: $($tables.Count)"
Write-Host "Rows: $((($tables.Values | ForEach-Object Rows) | Measure-Object -Sum).Sum)"

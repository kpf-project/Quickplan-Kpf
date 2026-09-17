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

$sharedTables = [ordered]@{
  "public.profiles" = @("id")
  "public.products_cache" = @("sku_code")
  "public.production_departments" = @("id")
  "public.production_department_products" = @("id")
  "public.product_barcodes" = @("sku_code")
  "public.pallet_trade_code_barcodes" = @("goods_code")
}

$filteredTables = [ordered]@{
  "public.production_daily_work_doc_counters" = "machine_code = 'PR'"
  "public.production_daily_work_doc_counter_audits" = "machine_code = 'PR'"
  "public.production_report_documents" = "report_type IN ('PRD', 'PRG', 'PRE', 'PRS')"
  "public.production_report_doc_audits" = "report_type IN ('PRD', 'PRG', 'PRE', 'PRS')"
  "public.production_report_doc_counters" = "report_type IN ('PRD', 'PRG', 'PRE', 'PRS')"
}

$replaceTables = @(
  "public.production_piece_rate_profiles",
  "public.production_piece_rate_profile_weights",
  "public.production_piece_rate_product_mappings",
  "public.production_piece_rate_logs",
  "public.production_piece_rate_log_revisions",
  "public.production_piece_rate_waste_logs",
  "public.production_weight_scale_products",
  "public.production_weight_scale_lots",
  "public.production_weight_receipts",
  "public.production_stock_issue_documents",
  "public.production_stock_issue_items",
  "public.production_stock_movements",
  "public.production_stock_opening_balances",
  "public.production_prison_issue_documents",
  "public.production_prison_issue_items",
  "public.production_erp_export_sequences",
  "public.production_erp_export_batches",
  "public.production_erp_export_documents",
  "public.production_erp_export_lines"
)

$selectedTables = @($sharedTables.Keys) + @($filteredTables.Keys) + $replaceTables
$selectedSet = @{}
$selectedTables | ForEach-Object { $selectedSet[$_] = $true }

$resolvedDump = (Resolve-Path -LiteralPath $DumpFile).Path
$outputDirectory = Split-Path -Parent $resolvedDump
$scopeDataPath = Join-Path $outputDirectory "production-scope-data.sql"
$scopeDataLines = New-Object System.Collections.Generic.List[string]
$tableInfo = [ordered]@{}
$currentKey = $null
$includeCurrent = $false

foreach ($line in [IO.File]::ReadLines($resolvedDump)) {
  if ($line -match '^COPY "([^"]+)"\."([^"]+)" \((.*)\) FROM stdin;$') {
    $schemaName = $matches[1]
    $tableName = $matches[2]
    $columnText = $matches[3]
    $currentKey = "$schemaName.$tableName"
    $includeCurrent = $selectedSet.ContainsKey($currentKey)

    if ($includeCurrent) {
      $columns = @([regex]::Matches($columnText, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
      $tableInfo[$currentKey] = [ordered]@{
        Schema = $schemaName
        Table = $tableName
        Columns = $columns
        Rows = [int64]0
      }

      if ($sharedTables.Contains($currentKey) -or $filteredTables.Contains($currentKey)) {
        $scopeDataLines.Add("COPY `"_cutover_$tableName`" ($columnText) FROM stdin;")
      } else {
        $scopeDataLines.Add($line)
      }
    }
    continue
  }

  if ($currentKey) {
    if ($includeCurrent) {
      $scopeDataLines.Add($line)
      if ($line -ne '\.') {
        $tableInfo[$currentKey].Rows += 1
      }
    }
    if ($line -eq '\.') {
      $currentKey = $null
      $includeCurrent = $false
    }
  }
}

$missing = @($selectedTables | Where-Object { -not $tableInfo.Contains($_) })
if ($missing.Count -gt 0) {
  throw "Missing selected tables in dump: $($missing -join ', ')"
}

Write-Utf8NoBom -Path $scopeDataPath -Lines $scopeDataLines

$preflight = @(
  '\set ON_ERROR_STOP on',
  'CREATE TEMP TABLE _cutover_expected_columns (schema_name text, table_name text, column_names text[]);'
)
foreach ($entry in $tableInfo.Values) {
  $columnArray = ($entry.Columns | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ", "
  $preflight += "INSERT INTO _cutover_expected_columns VALUES ('$($entry.Schema)', '$($entry.Table)', ARRAY[$columnArray]);"
}
$preflight += @(
  'CREATE TEMP VIEW _cutover_schema_mismatches AS',
  'SELECT expected.schema_name, expected.table_name, expected.column_names expected_columns, actual.column_names actual_columns',
  'FROM _cutover_expected_columns expected',
  'LEFT JOIN LATERAL (',
  '  SELECT array_agg(column_name::text ORDER BY ordinal_position) column_names',
  '  FROM information_schema.columns',
  '  WHERE table_schema = expected.schema_name AND table_name = expected.table_name AND is_generated = ''NEVER''',
  ') actual ON true',
  'WHERE actual.column_names IS DISTINCT FROM expected.column_names;',
  'TABLE _cutover_schema_mismatches;',
  'DO $$ BEGIN IF EXISTS (SELECT 1 FROM _cutover_schema_mismatches) THEN',
  "  RAISE EXCEPTION 'CUTOVER PREFLIGHT FAILED: schema mismatch';",
  'END IF; END $$;',
  "SELECT 'CUTOVER_PREFLIGHT_OK' result, count(*) checked_tables FROM _cutover_expected_columns;"
)

$restore = @(
  '\set ON_ERROR_STOP on',
  '\echo Starting production scope cutover...',
  'BEGIN;',
  "SET LOCAL lock_timeout = '15s';",
  'SET LOCAL statement_timeout = 0;',
  'SET LOCAL session_replication_role = replica;'
)

foreach ($key in @($sharedTables.Keys) + @($filteredTables.Keys)) {
  $entry = $tableInfo[$key]
  $restore += "CREATE TEMP TABLE `"_cutover_$($entry.Table)`" (LIKE `"$($entry.Schema)`".`"$($entry.Table)`" INCLUDING DEFAULTS INCLUDING GENERATED);"
}

$deleteOrder = @(
  "public.production_erp_export_lines",
  "public.production_erp_export_documents",
  "public.production_erp_export_batches",
  "public.production_erp_export_sequences",
  "public.production_prison_issue_items",
  "public.production_prison_issue_documents",
  "public.production_stock_issue_items",
  "public.production_stock_issue_documents",
  "public.production_stock_movements",
  "public.production_stock_opening_balances",
  "public.production_weight_receipts",
  "public.production_weight_scale_lots",
  "public.production_weight_scale_products",
  "public.production_piece_rate_waste_logs",
  "public.production_piece_rate_log_revisions",
  "public.production_piece_rate_logs",
  "public.production_piece_rate_product_mappings",
  "public.production_piece_rate_profile_weights",
  "public.production_piece_rate_profiles"
)
foreach ($key in $deleteOrder) {
  $parts = $key.Split('.')
  $restore += "DELETE FROM `"$($parts[0])`".`"$($parts[1])`";"
}
foreach ($key in $filteredTables.Keys) {
  $entry = $tableInfo[$key]
  $restore += "DELETE FROM `"$($entry.Schema)`".`"$($entry.Table)`" WHERE $($filteredTables[$key]);"
}

$restore += '\ir production-scope-data.sql'

foreach ($key in $sharedTables.Keys) {
  $entry = $tableInfo[$key]
  $quotedColumns = @($entry.Columns | ForEach-Object { '"' + $_ + '"' })
  $keyColumns = @($sharedTables[$key])
  $updateColumns = @($entry.Columns | Where-Object { $_ -notin $keyColumns })
  $conflict = ($keyColumns | ForEach-Object { '"' + $_ + '"' }) -join ', '
  $updates = ($updateColumns | ForEach-Object { '"' + $_ + '" = EXCLUDED."' + $_ + '"' }) -join ', '
  $restore += "INSERT INTO `"$($entry.Schema)`".`"$($entry.Table)`" ($($quotedColumns -join ', ')) SELECT $($quotedColumns -join ', ') FROM `"_cutover_$($entry.Table)`" ON CONFLICT ($conflict) DO UPDATE SET $updates;"
}

foreach ($key in $filteredTables.Keys) {
  $entry = $tableInfo[$key]
  $quotedColumns = @($entry.Columns | ForEach-Object { '"' + $_ + '"' }) -join ', '
  $restore += "INSERT INTO `"$($entry.Schema)`".`"$($entry.Table)`" ($quotedColumns) SELECT $quotedColumns FROM `"_cutover_$($entry.Table)`" WHERE $($filteredTables[$key]);"
}

$restore += @(
  "SELECT setval(pg_get_serial_sequence('public.production_department_products', 'id'), GREATEST(COALESCE((SELECT max(id) FROM public.production_department_products), 1), 1), EXISTS (SELECT 1 FROM public.production_department_products));",
  "SELECT setval(pg_get_serial_sequence('public.production_report_documents', 'id'), GREATEST(COALESCE((SELECT max(id) FROM public.production_report_documents), 1), 1), EXISTS (SELECT 1 FROM public.production_report_documents));",
  "SELECT setval(pg_get_serial_sequence('public.production_report_doc_audits', 'id'), GREATEST(COALESCE((SELECT max(id) FROM public.production_report_doc_audits), 1), 1), EXISTS (SELECT 1 FROM public.production_report_doc_audits));",
  'COMMIT;',
  '\echo Production scope cutover committed.',
  'ANALYZE;'
)

$verify = @('\set ON_ERROR_STOP on')
foreach ($key in $replaceTables) {
  $entry = $tableInfo[$key]
  $verify += "SELECT '$key' table_name, $($entry.Rows)::bigint expected_rows, count(*)::bigint actual_rows, count(*) = $($entry.Rows) ok FROM `"$($entry.Schema)`".`"$($entry.Table)`";"
}
$verify += @(
  "SELECT 'auth.users' check_name, count(*) actual_rows FROM auth.users;",
  "SELECT 'production_stock_balances_v' check_name, count(*) actual_rows FROM public.production_stock_balances_v;",
  "SELECT 'production_piece_rate_logs_orphans' check_name, count(*) actual_rows FROM public.production_piece_rate_log_revisions r LEFT JOIN public.production_piece_rate_logs l ON l.id = r.log_id WHERE l.id IS NULL;",
  "SELECT 'stock_issue_item_orphans' check_name, count(*) actual_rows FROM public.production_stock_issue_items i LEFT JOIN public.production_stock_issue_documents d ON d.id = i.issue_document_id WHERE d.id IS NULL;",
  "SELECT 'prison_issue_item_orphans' check_name, count(*) actual_rows FROM public.production_prison_issue_items i LEFT JOIN public.production_prison_issue_documents d ON d.id = i.prison_issue_document_id WHERE d.id IS NULL;",
  "SELECT 'production_report_documents_sequence' check_name, last_value sequence_value, COALESCE((SELECT max(id) FROM public.production_report_documents), 0) max_id, last_value >= COALESCE((SELECT max(id) FROM public.production_report_documents), 0) ok FROM public.production_report_documents_id_seq;",
  "SELECT 'production_report_doc_audits_sequence' check_name, last_value sequence_value, COALESCE((SELECT max(id) FROM public.production_report_doc_audits), 0) max_id, last_value >= COALESCE((SELECT max(id) FROM public.production_report_doc_audits), 0) ok FROM public.production_report_doc_audits_id_seq;"
)

$preflightPath = Join-Path $outputDirectory 'production-scope-01-preflight.sql'
$restorePath = Join-Path $outputDirectory 'production-scope-02-restore.sql'
$verifyPath = Join-Path $outputDirectory 'production-scope-03-verify.sql'
Write-Utf8NoBom -Path $preflightPath -Lines $preflight
Write-Utf8NoBom -Path $restorePath -Lines $restore
Write-Utf8NoBom -Path $verifyPath -Lines $verify

$packageFiles = @($scopeDataPath, $preflightPath, $restorePath, $verifyPath)
$manifest = foreach ($file in $packageFiles) {
  $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($file))"
}
Write-Utf8NoBom -Path (Join-Path $outputDirectory 'production-scope-SHA256SUMS') -Lines $manifest

Write-Host "Production scope package created:"
Write-Host $outputDirectory
Write-Host "Tables: $($tableInfo.Count)"
Write-Host "Rows in selected COPY blocks: $((($tableInfo.Values | ForEach-Object Rows) | Measure-Object -Sum).Sum)"

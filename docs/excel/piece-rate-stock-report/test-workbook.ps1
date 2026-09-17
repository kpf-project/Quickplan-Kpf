param(
  [Parameter(Mandatory = $true)][string]$WorkbookPath,
  [string]$PreviewPdfPath
)

$source = (Resolve-Path -LiteralPath $WorkbookPath).Path
$testPath = Join-Path $env:TEMP "kpf-piece-rate-workbook-test.xlsm"
$testCredentialTarget = "KPFExcelTest-" + [Guid]::NewGuid().ToString("N")
Copy-Item -LiteralPath $source -Destination $testPath -Force

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($testPath)
  $sheet = $workbook.Worksheets.Item("รายงานรับเข้า")

  $json = '{"data":{"rows":[{"movementDate":"2026-09-14","movementAt":"2026-09-14T05:31:50.96+00:00","barcode":"202609150001","productCode":"WKB-0002","productName":"ไส้กรอกหมูรมควัน","lotNo":"1409260002-1","quantityIn":12,"weightInKg":123.456,"employeeCode":"KPF-0001","employeeName":"สมชาย ใจดี","status":"ready"},{"movementDate":"2026-09-14","movementAt":"2026-09-14T05:31:50.96+00:00","status":"cancelled"}]}}'
  $excel.Run("'" + $workbook.Name + "'!KpfPieceRateReport.ImportJson", $sheet, $json)
  $sheet.Range("D5").Value = [DateTime]::ParseExact("2026-09-14", "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
  for ($refresh = 0; $refresh -lt 10; $refresh++) {
    $excel.Run("'" + $workbook.Name + "'!KpfPieceRateReport.ImportJson", $sheet, $json)
  }

  if ($sheet.Range("E9").Value2 -ne "ไส้กรอกหมูรมควัน") { throw "Thai product name failed" }
  if ($sheet.Range("J9").Value2 -ne "สมชาย ใจดี") { throw "Thai employee name failed" }
  if ($sheet.Range("C9").Text -ne "202609150001") { throw "Barcode text formatting failed: $($sheet.Range('C9').Text)" }
  if ($sheet.Range("B9").Text -ne "14/09/2026 12:31:50") { throw "Bangkok datetime failed: $($sheet.Range('B9').Text)" }
  if ($sheet.Range("B5").Text -notmatch '^\d{2}/\d{2}/\d{4}$') { throw "Start-date input formatting failed: $($sheet.Range('B5').Text)" }
  if ($sheet.Range("D5").Text -notmatch '^\d{2}/\d{2}/\d{4}$') { throw "End-date input formatting failed: text=$($sheet.Range('D5').Text), value=$($sheet.Range('D5').Value2), format=$($sheet.Range('D5').NumberFormat)" }
  if ($sheet.ListObjects.Item("PieceRateInboundReport").Range.Rows.Count -ne 2) { throw "Cancelled-row filter failed" }
  if ($sheet.Shapes.Item("RefreshReportButton").OnAction -notlike "*RefreshPieceRateInbound*") { throw "Refresh button macro failed" }
  if (-not $sheet.Shapes.Item("RefreshReportButton").Shadow.Visible) { throw "Grey button shadow failed" }
  if (-not $sheet.Columns("M").Hidden) { throw "Helper labels must stay hidden" }

  $bytes = [Text.Encoding]::UTF8.GetBytes('{"text":"ภาษาไทย"}')
  $decoded = $excel.Run("'" + $workbook.Name + "'!KpfPieceRateReport.Utf8Text", $bytes)
  if ($decoded -ne '{"text":"ภาษาไทย"}') { throw "UTF-8 response decoding failed" }

  $null = & cmdkey.exe "/generic:$testCredentialTarget" "/user:test" "/pass:test-only-read-token-1234567890"
  if ($LASTEXITCODE -ne 0) { throw "Temporary test credential installation failed" }
  $storedToken = $excel.Run("'" + $workbook.Name + "'!KpfPieceRateReport.ReadWindowsToken", $testCredentialTarget)
  if (-not [string]::Equals($storedToken, "test-only-read-token-1234567890", [StringComparison]::Ordinal)) { throw "Windows Credential Manager token read failed" }

  if ($PreviewPdfPath) {
    $sheet.PageSetup.PrintArea = '$A$1:$K$12'
    $sheet.ExportAsFixedFormat(0, [IO.Path]::GetFullPath($PreviewPdfPath))
  }

  Write-Output "PASS: Thai UTF-8, Bangkok datetime, filtering, design helpers, and refresh button"
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  Remove-Item -LiteralPath $testPath -Force -ErrorAction SilentlyContinue
  $null = & cmdkey.exe "/delete:$testCredentialTarget"
  if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
  if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

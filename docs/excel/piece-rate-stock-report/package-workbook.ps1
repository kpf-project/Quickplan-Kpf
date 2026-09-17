param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ModulePath,
  [string]$JsonModulePath
)

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open((Resolve-Path -LiteralPath $InputPath).Path)
  foreach ($componentName in @("RefreshPieceRateInbound", "KpfPieceRateReport")) {
    try {
      $component = $workbook.VBProject.VBComponents.Item($componentName)
      $workbook.VBProject.VBComponents.Remove($component)
    } catch {
      # Component is absent; nothing to replace.
    }
  }
  $null = $workbook.VBProject.VBComponents.Import((Resolve-Path -LiteralPath $ModulePath).Path)
  if ($JsonModulePath) {
    try {
      $jsonComponent = $workbook.VBProject.VBComponents.Item("JsonConverter")
      $workbook.VBProject.VBComponents.Remove($jsonComponent)
    } catch {
      # Component is absent; nothing to replace.
    }
    $null = $workbook.VBProject.VBComponents.Import((Resolve-Path -LiteralPath $JsonModulePath).Path)
    try {
      $null = $workbook.VBProject.References.AddFromGuid("{420B2830-E718-11CF-893D-00A0C9054228}", 1, 0)
    } catch {
      # Reference already exists.
    }
  }

  $sheet = $workbook.Worksheets.Item("รายงานรับเข้า")
  $sheet.Buttons().Delete()
  foreach ($shape in @($sheet.Shapes)) {
    if ($shape.Name -eq "RefreshReportButton") { $shape.Delete() }
  }
  $sheet.Cells.Font.Name = "Aptos"
  $sheet.Cells.Font.Size = 10
  $sheet.Application.ActiveWindow.DisplayGridlines = $false
  $sheet.Application.ActiveWindow.Zoom = 90

  $sheet.Range("A2:K2").Interior.Color = 0xFBEFEF
  $sheet.Range("A2:K2").Font.Color = 0x663B17
  $sheet.Range("A2:K2").Font.Size = 20
  $sheet.Range("A2:K2").Font.Bold = $true
  $sheet.Range("A2:K2").RowHeight = 34
  $sheet.Range("A3:K3").Merge()
  $sheet.Range("A3").Value2 = "ข้อมูลการรับเข้า WIP ตามช่วงวันที่"
  $sheet.Range("A3").Font.Color = 0x806A55
  $sheet.Range("A3").Font.Size = 10
  $sheet.Range("A4:G6").Interior.Color = 0xFFF6EF
  $sheet.Range("A4:G6").Borders.Color = 0xFEDBBF
  $sheet.Range("A4:A5,C5,F5").Font.Bold = $true
  $sheet.Range("B5,D5").Interior.Color = 0xFFFFFF
  $sheet.Range("B5,D5").Borders.Color = 0xEB6325
  $sheet.Range("B5,D5").HorizontalAlignment = -4108
  $sheet.Range("F5:G5").Merge()
  $sheet.Range("A6:G6").Merge()
  $sheet.Range("A6").Font.Italic = $true
  $sheet.Range("A6").Font.Color = 0x806A55

  $sheet.Range("A8:K8").Interior.Color = 0xCC7225
  $sheet.Range("A8:K8").Font.Color = 0xFFFFFF
  $sheet.Range("A8:K8").Font.Bold = $true
  $sheet.Range("A8:K8").HorizontalAlignment = -4108
  $sheet.Range("A8:K8").VerticalAlignment = -4108
  $sheet.Range("A8:K8").RowHeight = 28
  $sheet.Columns("A").ColumnWidth = 13
  $sheet.Columns("B").ColumnWidth = 21
  $sheet.Columns("C").ColumnWidth = 20
  $sheet.Columns("D").ColumnWidth = 15
  $sheet.Columns("E").ColumnWidth = 30
  $sheet.Columns("F").ColumnWidth = 18
  $sheet.Columns("G").ColumnWidth = 12
  $sheet.Columns("H").ColumnWidth = 16
  $sheet.Columns("I").ColumnWidth = 16
  $sheet.Columns("J").ColumnWidth = 23
  $sheet.Columns("K").ColumnWidth = 14
  $sheet.Columns("M").Hidden = $true
  $sheet.Range("M1").Value2 = "พร้อมเบิก"
  $sheet.Range("M2").Value2 = "เบิกแล้ว"
  foreach ($dateCellAddress in @("B5", "D5")) {
    $dateCell = $sheet.Range($dateCellAddress)
    if ($dateCell.Value2 -is [double] -or $dateCell.Value2 -match '^\d+(\.\d+)?$') {
      $dateCell.NumberFormat = "General"
      $dateCell.Value2 = [Math]::Floor([double]$dateCell.Value2)
    }
    $dateCell.NumberFormat = "dd/mm/yyyy"
  }
  $sheet.Range("A9:A2008").NumberFormat = "dd/mm/yyyy"
  $sheet.Range("B9:B2008").NumberFormat = "dd/mm/yyyy hh:mm:ss"
  $sheet.Range("C9:F2008").NumberFormat = "@"
  $sheet.Range("I9:J2008").NumberFormat = "@"
  $sheet.Range("G9:H2008").NumberFormat = "#,##0.000"
  $sheet.PageSetup.Orientation = 2
  $sheet.PageSetup.Zoom = $false
  $sheet.PageSetup.FitToPagesWide = 1
  $sheet.Activate()
  $sheet.Range("A9").Select()
  $sheet.Application.ActiveWindow.FreezePanes = $true

  $button = $sheet.Shapes.AddShape(5, $sheet.Range("I4").Left, $sheet.Range("I4").Top, 180, 48)
  $button.Name = "RefreshReportButton"
  $button.TextFrame2.TextRange.Text = "ดึงรายงาน"
  $button.OnAction = "KpfPieceRateReport.RefreshPieceRateInbound"
  $button.Fill.ForeColor.RGB = 0xE3E3E3
  $button.Line.ForeColor.RGB = 0x888888
  $button.Shadow.Visible = $true
  $button.Shadow.Blur = 4
  $button.Shadow.OffsetX = 2
  $button.Shadow.OffsetY = 3
  $button.TextFrame2.TextRange.Font.Name = "Aptos"
  $button.TextFrame2.TextRange.Font.Size = 13
  $button.TextFrame2.TextRange.Font.Bold = $true
  $button.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = 0x333333

  foreach ($dateCellAddress in @("B5", "D5")) {
    $dateCell = $sheet.Range($dateCellAddress)
    $dateValue = [DateTime]::FromOADate([double]$dateCell.Value2).Date
    $dateCell.MergeArea.Style = "Normal"
    $dateCell.MergeArea.Value = $dateValue
    $dateCell.MergeArea.NumberFormatLocal = "dd/mm/yyyy"
    $dateCell.MergeArea.Interior.Color = 0xFFFFFF
    $dateCell.MergeArea.Borders.Color = 0xEB6325
    $dateCell.MergeArea.HorizontalAlignment = -4108
  }

  $fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
  $workbook.SaveAs($fullOutputPath, 52)
  $excel.Run("'" + $workbook.Name + "'!KpfPieceRateReport.ValidatePieceRateWorkbook")
  $workbook.Save()
  Write-Output $fullOutputPath
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($button) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($button) }
  if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
  if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

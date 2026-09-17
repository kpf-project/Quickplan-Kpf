Attribute VB_Name = "KpfPieceRateReport"
Option Explicit

#If VBA7 Then
Private Declare PtrSafe Function CredRead Lib "advapi32.dll" Alias "CredReadW" (ByVal targetName As LongPtr, ByVal credentialType As Long, ByVal flags As Long, ByRef credentialPtr As LongPtr) As Long
Private Declare PtrSafe Sub CredFree Lib "advapi32.dll" (ByVal credentialPtr As LongPtr)
Private Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (ByRef destination As Any, ByVal source As LongPtr, ByVal byteCount As LongPtr)
#End If

#If VBA7 Then
Private Type WINDOWS_CREDENTIAL
  Flags As Long
  Type As Long
  TargetName As LongPtr
  Comment As LongPtr
  LastWrittenLow As Long
  LastWrittenHigh As Long
  BlobSize As Long
  BlobPointer As LongPtr
  Persist As Long
  AttributeCount As Long
  Attributes As LongPtr
  TargetAlias As LongPtr
  UserName As LongPtr
End Type
#End If


Public Sub ValidatePieceRateWorkbook()
  Dim ws As Worksheet
  Dim sample As Object
  Set ws = ThisWorkbook.Worksheets(1)
  If ws.Range("B4").Value2 <> "https://production.kpfoods.co.th" Then Err.Raise vbObjectError + 90, , "Invalid base URL"
  If Len(CStr(ws.Range("A8").Value2)) = 0 Then Err.Raise vbObjectError + 91, , "Missing report header"
  Set sample = JsonConverter.ParseJson("{""data"":{""rows"":[{""status"":""ready""}]}}")
  If sample("data")("rows").Count <> 1 Then Err.Raise vbObjectError + 92, , "JSON parser validation failed"
End Sub

Public Sub RefreshPieceRateInbound()
  Dim ws As Worksheet
  Dim baseUrl As String, dateFrom As String, dateTo As String, errorMessage As String
  Dim http As Object, reportUrl As String, tempFile As String, excelToken As String
  Dim oldCalculation As XlCalculation

  On Error GoTo Failed
  Set ws = ThisWorkbook.Worksheets(1)
  baseUrl = Trim$(CStr(ws.Range("B4").Value2))
  dateFrom = Format$(ws.Range("B5").Value, "yyyy-mm-dd")
  dateTo = Format$(ws.Range("D5").Value, "yyyy-mm-dd")

  If LCase$(Left$(baseUrl, 8)) <> "https://" Then Err.Raise vbObjectError + 100, , "The system URL must start with https://"
  If Not IsDate(ws.Range("B5").Value) Or Not IsDate(ws.Range("D5").Value) Then Err.Raise vbObjectError + 101, , "Enter a valid start date and end date"
  If CDate(ws.Range("B5").Value) > CDate(ws.Range("D5").Value) Then Err.Raise vbObjectError + 102, , "The start date must not be after the end date"
  oldCalculation = Application.Calculation
  Application.ScreenUpdating = False
  Application.EnableEvents = False
  Application.Calculation = xlCalculationManual
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.SetTimeouts 10000, 10000, 30000, 120000
  excelToken = ReadWindowsToken("KPF-Piece-Rate-Inbound-Excel")
  If Len(excelToken) = 0 Then Err.Raise vbObjectError + 108, , "The administrator must install the read-only report token in Windows Credential Manager."

  ws.Range("F5").Value = "Downloading report..."
  reportUrl = StripTrailingSlash(baseUrl) & "/api/attendance/piece-rate/stock/movements?report=inbound&format=csv&dateFrom=" & dateFrom & "&dateTo=" & dateTo
  http.Open "GET", reportUrl, False
  http.SetRequestHeader "Accept", "text/csv"
  http.SetRequestHeader "x-kpf-inbound-excel-token", excelToken
  http.Send
  If http.Status = 401 Then
    Err.Raise vbObjectError + 106, , "The read-only report token is invalid or not enabled on the server. Contact the administrator."
  End If
  If http.Status <> 200 Then Err.Raise vbObjectError + 105, , "Report download failed (HTTP " & http.Status & ")"
  If InStr(1, LCase$(http.GetResponseHeader("Content-Type")), "text/csv", vbTextCompare) > 0 Then
    tempFile = Environ$("TEMP") & "\kpf-piece-rate-" & Format$(Now, "yyyymmdd-hhnnss") & ".csv"
    SaveResponseBody http.ResponseBody, tempFile
    ImportCsv ws, tempFile
    Kill tempFile
    tempFile = vbNullString
  ElseIf InStr(1, LCase$(http.GetResponseHeader("Content-Type")), "application/json", vbTextCompare) > 0 Then
    ImportJson ws, Utf8Text(http.ResponseBody)
  Else
    Err.Raise vbObjectError + 107, , "The server returned an unsupported report format. The existing report was not changed."
  End If

  ws.Range("F5").Value = "Updated " & Format$(Now, "dd/mm/yyyy hh:mm")
  ws.Range("F5").Font.Color = RGB(5, 150, 105)
  MsgBox "Inbound report updated", vbInformation, "KPF Production Line"

CleanUp:
  excelToken = vbNullString
  On Error Resume Next
  If Len(tempFile) > 0 Then Kill tempFile
  Application.Calculation = oldCalculation
  Application.EnableEvents = True
  Application.ScreenUpdating = True
  Exit Sub

Failed:
  errorMessage = Err.Description
  If Not ws Is Nothing Then
    ws.Range("F5").Value = "Failed: " & errorMessage
    ws.Range("F5").Font.Color = RGB(190, 18, 60)
  End If
  MsgBox errorMessage, vbExclamation, "KPF Production Line"
  Resume CleanUp
End Sub

Public Function ReadWindowsToken(ByVal target As String) As String
#If VBA7 Then
  Dim credentialPtr As LongPtr, credential As WINDOWS_CREDENTIAL, tokenBytes() As Byte, index As Long
  If CredRead(StrPtr(target), 1, 0, credentialPtr) = 0 Then Exit Function
  On Error GoTo ReleaseCredential
  CopyMemory credential, credentialPtr, LenB(credential)
  If credential.BlobSize > 0 And credential.BlobSize <= 512 And credential.BlobSize Mod 2 = 0 And credential.BlobPointer <> 0 Then
    ReDim tokenBytes(0 To credential.BlobSize - 1)
    CopyMemory tokenBytes(0), credential.BlobPointer, credential.BlobSize
    For index = 0 To credential.BlobSize - 2 Step 2
      ReadWindowsToken = ReadWindowsToken & ChrW$(CLng(tokenBytes(index)) + 256 * CLng(tokenBytes(index + 1)))
    Next index
  End If
ReleaseCredential:
  CredFree credentialPtr
#End If
End Function

Private Function StripTrailingSlash(ByVal value As String) As String
  Do While Right$(value, 1) = "/"
    value = Left$(value, Len(value) - 1)
  Loop
  StripTrailingSlash = value
End Function

Public Function Utf8Text(ByVal body As Variant) As String
  Dim stream As Object
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 1
  stream.Open
  stream.Write body
  stream.Position = 0
  stream.Type = 2
  stream.Charset = "utf-8"
  Utf8Text = stream.ReadText
  stream.Close
End Function

Private Sub SaveResponseBody(ByVal body As Variant, ByVal fileName As String)
  Dim stream As Object
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 1
  stream.Open
  stream.Write body
  stream.SaveToFile fileName, 2
  stream.Close
End Sub

Private Sub ImportCsv(ByVal ws As Worksheet, ByVal fileName As String)
  Dim query As QueryTable, dataRange As Range, table As ListObject, lastRow As Long

  lastRow = LastReportRow(ws)
  For Each table In ws.ListObjects
    table.Delete
  Next table
  ws.Range("A8:K" & lastRow).ClearContents

  Set query = ws.QueryTables.Add(Connection:="TEXT;" & fileName, Destination:=ws.Range("A8"))
  With query
    .TextFilePlatform = 65001
    .TextFileParseType = xlDelimited
    .TextFileCommaDelimiter = True
    .TextFileTextQualifier = xlTextQualifierDoubleQuote
    .TextFileColumnDataTypes = Array(xlTextFormat, xlTextFormat, xlTextFormat, xlTextFormat, xlTextFormat, xlTextFormat, xlGeneralFormat, xlGeneralFormat, xlTextFormat, xlTextFormat, xlTextFormat)
    .Refresh BackgroundQuery:=False
    .Delete
  End With

  Set dataRange = ws.Range("A8").CurrentRegion
  Set table = ws.ListObjects.Add(xlSrcRange, dataRange, , xlYes)
  table.Name = "PieceRateInboundReport"
  table.TableStyle = "TableStyleMedium2"
  NormalizeAndFormatData ws, dataRange.Rows.Count
End Sub

Public Sub ImportJson(ByVal ws As Worksheet, ByVal jsonText As String)
  Dim payload As Object, data As Object, rows As Collection, row As Variant
  Dim values() As Variant, outputRow As Long, table As ListObject, dataRange As Range, lastRow As Long

  Set payload = JsonConverter.ParseJson(jsonText)
  Set data = payload("data")
  Set rows = data("rows")
  For Each row In rows
    If JsonTextValue(row, "status") <> "cancelled" Then outputRow = outputRow + 1
  Next row
  ReDim values(1 To IIf(outputRow > 0, outputRow, 1), 1 To 11)
  outputRow = 0

  For Each row In rows
    If JsonTextValue(row, "status") <> "cancelled" Then
      outputRow = outputRow + 1
      values(outputRow, 1) = ParseIsoDate(JsonTextValue(row, "movementDate"))
      values(outputRow, 2) = ParseBangkokDateTime(JsonTextValue(row, "movementAt"))
      values(outputRow, 3) = SafeExcelText(JsonTextValue(row, "barcode"))
      values(outputRow, 4) = SafeExcelText(JsonTextValue(row, "productCode"))
      values(outputRow, 5) = SafeExcelText(JsonTextValue(row, "productName"))
      values(outputRow, 6) = SafeExcelText(JsonTextValue(row, "lotNo"))
      values(outputRow, 7) = JsonNumberValue(row, "quantityIn")
      values(outputRow, 8) = JsonNumberValue(row, "weightInKg")
      values(outputRow, 9) = SafeExcelText(JsonTextValue(row, "employeeCode"))
      values(outputRow, 10) = SafeExcelText(JsonTextValue(row, "employeeName"))
      values(outputRow, 11) = IIf(JsonTextValue(row, "status") = "issued", ws.Range("M2").Value2, ws.Range("M1").Value2)
    End If
  Next row

  lastRow = LastReportRow(ws)
  For Each table In ws.ListObjects
    table.Unlist
  Next table
  If lastRow >= 9 Then ws.Range("A9:K" & lastRow).ClearContents
  If outputRow > 0 Then
    ws.Range("C9:F" & (outputRow + 8)).NumberFormat = "@"
    ws.Range("I9:J" & (outputRow + 8)).NumberFormat = "@"
  End If
  If outputRow > 0 Then ws.Range("A9").Resize(outputRow, 11).Value = values
  Set dataRange = ws.Range("A8").Resize(outputRow + 1, 11)
  Set table = ws.ListObjects.Add(xlSrcRange, dataRange, , xlYes)
  table.Name = "PieceRateInboundReport"
  table.TableStyle = "TableStyleMedium2"
  NormalizeAndFormatData ws, outputRow + 1
End Sub

Private Sub NormalizeAndFormatData(ByVal ws As Worksheet, ByVal rowCount As Long)
  Dim cell As Range, lastRow As Long
  lastRow = rowCount + 7
  If rowCount > 1 Then
    For Each cell In ws.Range("A9:A" & (rowCount + 7))
      If VarType(cell.Value2) = vbString Then cell.Value = ParseIsoDate(CStr(cell.Value2))
    Next cell
    For Each cell In ws.Range("B9:B" & (rowCount + 7))
      If VarType(cell.Value2) = vbString Then cell.Value = ParseBangkokDateTime(CStr(cell.Value2))
    Next cell
  End If
  If lastRow >= 9 Then
    ws.Range("A9:A" & lastRow).NumberFormat = "dd/mm/yyyy"
    ws.Range("B9:B" & lastRow).NumberFormat = "dd/mm/yyyy hh:mm:ss"
    ws.Range("C9:F" & lastRow).NumberFormat = "@"
    ws.Range("I9:J" & lastRow).NumberFormat = "@"
    ws.Range("G9:H" & lastRow).NumberFormat = "#,##0.000"
    ws.Range("A9:B" & lastRow).HorizontalAlignment = xlCenter
    ws.Range("G9:K" & lastRow).HorizontalAlignment = xlCenter
    ws.Range("E9:E" & lastRow).HorizontalAlignment = xlLeft
  End If
  If ws.ListObjects.Count > 0 Then
    If Not ws.ListObjects(1).DataBodyRange Is Nothing Then
      ws.ListObjects(1).DataBodyRange.Interior.Color = RGB(239, 246, 255)
      ws.ListObjects(1).DataBodyRange.Borders.Color = RGB(191, 219, 254)
    End If
  End If
End Sub

Private Function LastReportRow(ByVal ws As Worksheet) As Long
  Dim table As ListObject
  LastReportRow = 8
  For Each table In ws.ListObjects
    If table.Range.Row >= 8 Then LastReportRow = Application.Max(LastReportRow, table.Range.Row + table.Range.Rows.Count - 1)
  Next table
  LastReportRow = Application.Max(LastReportRow, ws.Cells(ws.Rows.Count, "A").End(xlUp).Row)
End Function

Private Function ParseIsoDate(ByVal value As String) As Variant
  If Len(value) >= 10 Then
    ParseIsoDate = DateSerial(CInt(Left$(value, 4)), CInt(Mid$(value, 6, 2)), CInt(Mid$(value, 9, 2)))
  Else
    ParseIsoDate = value
  End If
End Function

Private Function ParseBangkokDateTime(ByVal value As String) As Variant
  Dim parsed As Date, offsetMinutes As Long, offsetPosition As Long, sign As Long
  If Len(value) < 19 Or Mid$(value, 11, 1) <> "T" Then
    ParseBangkokDateTime = value
    Exit Function
  End If

  parsed = DateSerial(CInt(Left$(value, 4)), CInt(Mid$(value, 6, 2)), CInt(Mid$(value, 9, 2))) _
    + TimeSerial(CInt(Mid$(value, 12, 2)), CInt(Mid$(value, 15, 2)), CInt(Mid$(value, 18, 2)))
  offsetPosition = InStrRev(value, "+")
  sign = 1
  If offsetPosition <= 10 Then
    offsetPosition = InStrRev(value, "-")
    sign = -1
  End If
  If offsetPosition > 10 Then
    offsetMinutes = sign * (CLng(Mid$(value, offsetPosition + 1, 2)) * 60 + CLng(Mid$(value, offsetPosition + 4, 2)))
  End If
  ParseBangkokDateTime = DateAdd("n", 420 - offsetMinutes, parsed)
End Function

Private Function JsonTextValue(ByVal item As Object, ByVal key As String) As String
  If item.Exists(key) Then
    If Not IsNull(item(key)) Then JsonTextValue = CStr(item(key))
  End If
End Function

Private Function JsonNumberValue(ByVal item As Object, ByVal key As String) As Double
  If item.Exists(key) Then
    If IsNumeric(item(key)) Then JsonNumberValue = CDbl(item(key))
  End If
End Function

Private Function SafeExcelText(ByVal value As String) As String
  If Len(value) > 0 And InStr(1, "=+-@", Left$(value, 1), vbBinaryCompare) > 0 Then
    SafeExcelText = "'" & value
  Else
    SafeExcelText = value
  End If
End Function

Public Class FCancel_FW
    Dim old_txtnamepro As String
    Dim new_txtnamepro As String
    Dim PC_name As String
    Private Sub FCancel_FW_Load(sender As Object, e As EventArgs) Handles Me.Load
        Comname()
    End Sub
    Private Sub Tb_barcode_KeyDown(sender As Object, e As KeyEventArgs) Handles Tb_barcode.KeyDown
        If e.KeyData = Keys.Enter Then
            old_txtnamepro = Tb_barcode.Text
            new_txtnamepro = change_barcode(old_txtnamepro)
            If IsNumeric(new_txtnamepro) Then
                SQL = "Select * from Tb_Foodweight where Fwbarcode = '" & new_txtnamepro & "' and Isstockout = '1'"
                Dim dts As DataTable = Cmd_DataTable()

                If dts.Rows.Count > 0 Then
                    Select Case MsgBox("ต้องการยกเลิกการชั่งของ Barcode: " & dts.Rows(0).Item("Fwbarcode").ToString & " ใช่หรือไม่ ?", MsgBoxStyle.YesNo, "ยืนยันการบันทึกข้อมูล")
                        Case MsgBoxResult.Yes
                            Insert_data()
                            Update_Status()
                            MessageBox.Show("ทำการยกเลิกการชั่งเรียบร้อยแล้ว!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Information)
                            Tb_barcode.Text = ""
                        Case MsgBoxResult.No
                            Tb_barcode.Text = ""
                    End Select
                End If

            End If
        End If
    End Sub
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub
    Private Sub Insert_data()
        Dim regDate As DateTime = DateTime.Now 'วันที่ปัจจุบัน
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US")) 'วันที่ชั่ง
        Dim strTime As String = regDate.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US")) 'เวลาชั่ง
        SQL = "Insert into Tb_Canclefoodweight (Fwbarcode,Cfwdate,Cfwtime,Uid,Pc_name) 
                   VALUES (N'" & new_txtnamepro & "','" & strDate & "','" & strTime & "','" & FMain.Uid & "','" & PC_name & "')"
        Cmd_Excutequery()
    End Sub
    Private Sub Update_Status()
        SQL = "Update Tb_Foodweight Set Isstockout = '2' where Fwbarcode = '" & new_txtnamepro & "'"
        Cmd_Excutequery()
    End Sub

    Private Function change_barcode(barcode As String) As String
        Dim result As String = ""
        For Each c As Char In barcode
            Select Case c
                Case "ๅ" : result &= "1"
                Case "/" : result &= "2"
                Case "-" : result &= "3"
                Case "ภ" : result &= "4"
                Case "ถ" : result &= "5"
                Case "ุ" : result &= "6"
                Case "ึ" : result &= "7"
                Case "ค" : result &= "8"
                Case "ต" : result &= "9"
                Case "จ" : result &= "0"
                Case Else : result &= c
            End Select
        Next
        Return result
    End Function


End Class
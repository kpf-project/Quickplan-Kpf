Public Class FCancel_SO1
    Dim old_txtnamepro As String
    Dim new_txtnamepro As String
    Private Sub FCancel_SO1_Load(sender As Object, e As EventArgs) Handles MyBase.Load

    End Sub

    Private Sub Tb_barcode_KeyDown(sender As Object, e As KeyEventArgs) Handles Tb_barcode.KeyDown
        If e.KeyData = Keys.Enter Then
            old_txtnamepro = Tb_barcode.Text
            new_txtnamepro = change_barcode(old_txtnamepro)
            If IsNumeric(new_txtnamepro) Then
                SQL = "Select * from Tb_FW_In where Fbarcode_in = '" & new_txtnamepro & "' and Fstockin_inout = '0'"
                Dim dts As DataTable = Cmd_DataTable()

                If dts.Rows.Count > 0 Then
                    Select Case MsgBox("ต้องการยกเลิกการเบิก Barcode :" & dts.Rows(0).Item("Fbarcode_in").ToString & " ใช่หรือไม่ ?", MsgBoxStyle.YesNo, "ยืนยันการบันทึกข้อมูล")
                        Case MsgBoxResult.Yes
                            Delete_data()
                            Update_Status()
                            MessageBox.Show("ทำการยกเลิกการเบิกเรียบร้อยแล้ว!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Information)
                            Tb_barcode.Text = ""
                        Case MsgBoxResult.No
                            Tb_barcode.Text = ""
                    End Select
                End If

            End If
        End If
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

    Private Sub Delete_data()

        SQL = "Delete FROM Tb_FW_Out where Fbarcode_out = '" & new_txtnamepro & "'"
        Cmd_Excutequery()

    End Sub
    Private Sub Update_Status()
        SQL = "Update Tb_FW_In Set Fstockin_inout = '1' where Fbarcode_in = '" & new_txtnamepro & "'"
        Cmd_Excutequery()
    End Sub
End Class
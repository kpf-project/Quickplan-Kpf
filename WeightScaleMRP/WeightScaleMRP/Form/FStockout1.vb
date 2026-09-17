Public Class FStockout1
    Dim old_txtnamepro As String
    Dim new_txtnamepro As String
    Dim PC_name As String
    Private Sub FStockout1_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        ShowResult()
        Tb_barcode.Select()
        Comname()
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
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub
    Private Sub Tb_barcode_KeyDown(sender As Object, e As KeyEventArgs) Handles Tb_barcode.KeyDown
        If e.KeyData = Keys.Enter Then
            old_txtnamepro = Tb_barcode.Text
            new_txtnamepro = change_barcode(old_txtnamepro)
            If new_txtnamepro <> "" Then
                'SQL = "Select * from Tb_Foodweight where Fwbarcode = '" & new_txtnamepro & "' and Isstockout = '1'"
                SQL = "Select Tb_FW_In.Fbarcode_in,Tb_FW_In.Fstockin_inout from Tb_FW_In 
                where Tb_FW_In.Fstockin_inout = '1' and Tb_FW_In.Fbarcode_in =  '" & new_txtnamepro & "'"
                Dim dts As DataTable = Cmd_DataTable()

                If dts.Rows.Count > 0 And dts.Rows(0).Item(1).ToString = "1" Then
                    Insert_data()
                    Update_Status()
                    ShowResult()
                    Tb_barcode.Text = ""
                    'ElseIf dts.Rows.Count > 0 And dts.Rows(0).Item(3).ToString = "1" Then
                    '    'MessageBox.Show("เบิกชั่งคืน", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Error)
                    '    Insert_data()
                    '    Update_Status_return()
                    '    ShowResult()
                    '    Tb_barcode.Text = ""
                Else
                    MessageBox.Show("ไม่พบบาร์โค้ด !!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Error)
                End If

            End If
        End If
    End Sub
    Private Sub ShowResult()
        DGV1.DataSource = Nothing
        Dim regDate As DateTime = DateTime.Now
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US"))
        'SQL = "SELECT Tb_FW_In.Fbarcode_in,Tb_Product.Product_name,Tb_Productlots.Lots_code,Tb_Foodweight.Fgweight,Tb_FW_In.Ftime_in,Tb_Type.Tname FROM Tb_FW_In
        '         left join Tb_Foodweight on Tb_Foodweight.Fwbarcode = Tb_FW_In.Fbarcode_in
        '         left join Tb_Productlots on Tb_Foodweight.Lid = Tb_Productlots.Lid
        '         left join Tb_Product on Tb_Productlots.Pid = Tb_Product.Pid
        '         left join Tb_Type on Tb_Type.Tcode = Ftcode_in
        '         where Fdate_in = '" & strDate & "'  and Tb_FW_In.Fstockin_inout = '0' 
        '         order by Tb_FW_In.Ftime_in asc"


        SQL = "SELECT Tb_FW_Out.Fbarcode_out,Tb_Product.Product_name,Tb_Productlots.Lots_code,Tb_Foodweight.Fgweight,Tb_FW_Out.Ftime_out,Tb_Type.Tname FROM Tb_FW_Out
                 Left Join Tb_Foodweight on Tb_Foodweight.Fwbarcode = Tb_FW_Out.Fbarcode_out
                 Left Join Tb_Productlots on Tb_Foodweight.Lid = Tb_Productlots.Lid
                 Left Join Tb_Product on Tb_Productlots.Pid = Tb_Product.Pid
                 Left Join Tb_Type on Tb_Type.Tcode = Ftcode_out
                 where Fdate_out = '" & strDate & "' 
                 order by Tb_FW_Out.Ftime_out asc"

        DGV1.DataSource = Cmd_DataTable()
        With DGV1
            'ชื่อคอลัมที่ต้องการเปลี่ยน
            .Columns(0).HeaderText = "บาร์โค้ด"
            .Columns(1).HeaderText = "ชื่อผลิตภัณฑ์"
            .Columns(2).HeaderText = "เลขล็อต"
            .Columns(3).HeaderText = "น้ำหนัก"
            .Columns(4).HeaderText = "เวลาเบิก"
            .Columns(5).HeaderText = "สถานที่ส่งของ"
        End With
    End Sub
    Private Sub Update_Status()
        SQL = "Update Tb_FW_In Set Fstockin_inout = '0' where Fbarcode_in = '" & new_txtnamepro & "'"
        Cmd_Excutequery()
    End Sub
    Private Sub Insert_data()
        Dim regDate As DateTime = DateTime.Now 'วันที่ปัจจุบัน
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US")) 'วันที่ชั่ง
        Dim strTime As String = regDate.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US")) 'เวลาชั่ง
        SQL = "Insert into Tb_FW_Out (Fbarcode_out,Fdate_out,Ftime_out,Fuid_out,Fpcname_out,Ftcode_out) 
                   VALUES (N'" & new_txtnamepro & "','" & strDate & "','" & strTime & "','" & FMain.Uid & "','" & PC_name & "','T3')"
        Cmd_Excutequery()
    End Sub
End Class
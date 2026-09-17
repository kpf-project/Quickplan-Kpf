Imports System.Data.SqlClient
Public Class FStockout
    Dim old_txtnamepro As String
    Dim new_txtnamepro As String
    Dim PC_name As String
    Private Sub FStockout_Load(sender As Object, e As EventArgs) Handles Me.Load
        ShowResult()
        Tb_barcode.Select()
        Comname()
        FillcmbType()

    End Sub
    'Private Sub Tb_barcode_KeyDown(sender As Object, e As KeyEventArgs) Handles Tb_barcode.KeyDown
    '    If e.KeyData = Keys.Enter Then
    '        old_txtnamepro = Tb_barcode.Text
    '        new_txtnamepro = change_barcode(old_txtnamepro)
    '        'If new_txtnamepro <> "" Then
    '        '    'SQL = "Select * from Tb_Foodweight where Fwbarcode = '" & new_txtnamepro & "' and Isstockout = '1'"
    '        '    SQL = "Select Tb_Foodweight.Fwbarcode,Tb_Foodweight.Isstockout from Tb_Foodweight 
    '        '    where Tb_Foodweight.Isstockout = '1' and Tb_Foodweight.Fwbarcode =  '" & new_txtnamepro & "'"
    '        '    Dim dts As DataTable = Cmd_DataTable()

    '        '    If dts.Rows.Count > 0 And dts.Rows(0).Item(1).ToString = "1" Then
    '        '        Insert_data()
    '        '        Insert_data1()
    '        '        Update_Status()
    '        '        ShowResult()
    '        '        Tb_barcode.Text = ""
    '        '        'ElseIf dts.Rows.Count > 0 And dts.Rows(0).Item(3).ToString = "1" Then
    '        '        '    'MessageBox.Show("เบิกชั่งคืน", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Error)
    '        '        '    Insert_data()
    '        '        '    Update_Status_return()
    '        '        '    ShowResult()
    '        '        '    Tb_barcode.Text = ""
    '        '    Else
    '        '        MessageBox.Show("ไม่พบบาร์โค้ด !!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Error)
    '        '    End If

    '        'End If

    '        If new_txtnamepro <> "" Then
    '            SQL = "Select Tb_Foodweight.Fwbarcode,Tb_Foodweight.Isstockout from Tb_Foodweight " &
    '                  "where Tb_Foodweight.Isstockout = '1' " &
    '                  "and Tb_Foodweight.Fwbarcode = '" & new_txtnamepro & "'"

    '            Dim dts As DataTable = Cmd_DataTable()

    '            ' ✅ แยก If ออกจากกัน ไม่เช็คพร้อมกัน
    '            If dts IsNot Nothing AndAlso dts.Rows.Count > 0 Then
    '                If dts.Rows(0).Item(1).ToString = "1" Then
    '                    Insert_data()
    '                    Insert_data1()
    '                    Update_Status()
    '                    ShowResult()
    '                    Tb_barcode.Text = ""
    '                Else
    '                    MessageBox.Show("ไม่พบบาร์โค้ด !!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Error)
    '                End If
    '        End If
    '    End If

    '    End If
    'End Sub

    Private Sub Tb_barcode_KeyDown(sender As Object, e As KeyEventArgs) Handles Tb_barcode.KeyDown
        If e.KeyData = Keys.Enter Then

            old_txtnamepro = Tb_barcode.Text
            new_txtnamepro = change_barcode(old_txtnamepro)

            If new_txtnamepro <> "" Then

                SQL = "SELECT Fwbarcode, Isstockout 
                   FROM Tb_Foodweight 
                   WHERE Fwbarcode = '" & new_txtnamepro & "'"

                Dim dts As DataTable = Cmd_DataTable()

                If dts IsNot Nothing AndAlso dts.Rows.Count > 0 Then

                    If dts.Rows(0).Item("Isstockout").ToString = "0" Then

                        ' ❌ เบิกแล้ว → ห้ามยิงซ้ำ
                        MessageBox.Show("บาร์โค้ดนี้ถูกเบิกไปแล้ว !!!", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning)
                        Tb_barcode.Text = ""

                    ElseIf dts.Rows(0).Item("Isstockout").ToString = "1" Then

                        ' ✅ ยังไม่เบิก → ทำการเบิก
                        Insert_data()
                        Insert_data1()
                        Update_Status()   ' ต้อง set = 0
                        ShowResult()

                        Tb_barcode.Text = ""

                    End If

                Else
                    MessageBox.Show("ไม่พบบาร์โค้ด !!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Error)
                End If

            End If

        End If
    End Sub
    Private Sub Insert_data()
        Dim regDate As DateTime = DateTime.Now 'วันที่ปัจจุบัน
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US")) 'วันที่ชั่ง
        Dim strTime As String = regDate.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US")) 'เวลาชั่ง
        SQL = "Insert into Tb_Stockout (Fwbarcode,Sodate,Sotime,Uid,Pc_name,Tcode) 
                   VALUES (N'" & new_txtnamepro & "','" & strDate & "','" & strTime & "','" & FMain.Uid & "','" & PC_name & "','" & lblType.Text & "')"
        Cmd_Excutequery()
    End Sub

    Private Sub Insert_data1()
        Dim regDate As DateTime = DateTime.Now 'วันที่ปัจจุบัน
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US")) 'วันที่ชั่ง
        Dim strTime As String = regDate.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US")) 'เวลาชั่ง
        SQL = "Insert into Tb_FW_In (Fbarcode_in,Fdate_in,Ftime_in,Fuid_in,Fpcname_in,Ftcode_in,Fstockin_inout) 
                   VALUES (N'" & new_txtnamepro & "','" & strDate & "','" & strTime & "','" & FMain.Uid & "','" & PC_name & "','" & lblType.Text & "','1')"
        Cmd_Excutequery()
    End Sub

    Private Sub Update_Status()
        SQL = "Update Tb_Foodweight Set Isstockout = '0' where Fwbarcode = '" & new_txtnamepro & "'"
        Cmd_Excutequery()
    End Sub
    Private Sub ShowResult()
        DGV1.DataSource = Nothing
        Dim regDate As DateTime = DateTime.Now
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US"))
        SQL = "SELECT Tb_Stockout.Fwbarcode,Tb_Product.Product_name,Tb_Productlots.Lots_code,Tb_Foodweight.Fgweight,Tb_Stockout.Sotime,Tb_Type.Tname FROM Tb_Stockout
                left join Tb_Foodweight on Tb_Foodweight.Fwbarcode = Tb_Stockout.Fwbarcode
                left join Tb_Productlots on Tb_Foodweight.Lid = Tb_Productlots.Lid
                left join Tb_Product on Tb_Productlots.Pid = Tb_Product.Pid
                left join Tb_Type on Tb_Type.Tcode = Tb_Stockout.Tcode
                where Tb_Stockout.Sodate = '" & strDate & "' and Tb_Foodweight.Isstockout = '0' 
                order by Tb_Stockout.Sotime asc"

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
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub
    'Private Function change_barcode(barcode As String) As String
    '    Dim result As String = ""
    '    For Each c As Char In barcode
    '        Select Case c
    '            Case "ๅ" : result &= "1"
    '            Case "/" : result &= "2"
    '            Case "-" : result &= "3"
    '            Case "ภ" : result &= "4"
    '            Case "ถ" : result &= "5"
    '            Case "ุ" : result &= "6"
    '            Case "ึ" : result &= "7"
    '            Case "ค" : result &= "8"
    '            Case "ต" : result &= "9"
    '            Case "จ" : result &= "0"
    '            Case Else : result &= c
    '        End Select
    '    Next
    '    Return result
    'End Function
    'Private Function change_barcode(barcode As String) As String
    '    Dim result As String = ""
    '    For Each c As Char In barcode
    '        Select Case c
    '            Case "ๅ" : result &= "1"
    '            Case "/" : result &= "2"
    '            Case "-" : result &= "3"
    '            Case "ภ" : result &= "4"
    '            Case "ถ" : result &= "5"
    '            Case "ุ" : result &= "6"
    '            Case "ึ" : result &= "7"
    '            Case "ค" : result &= "8"
    '            Case "ต" : result &= "9"
    '            Case "จ" : result &= "0"
    '            Case "0" To "9" : result &= c
    '        End Select
    '    Next
    '    Return result
    'End Function
    Private Function change_barcode(barcode As String) As String

        barcode = barcode.Trim().Replace(vbCr, "").Replace(vbLf, "")

        Dim result As New System.Text.StringBuilder()

        For Each c As Char In barcode.ToUpper()

            Select Case c

            ' ตัวเลข
                Case "0"c To "9"c
                    result.Append(c)

            ' ไทย
                Case "ๅ"c : result.Append("1")
                Case "/"c : result.Append("2")
                Case "-"c : result.Append("3")
                Case "ภ"c : result.Append("4")
                Case "ถ"c : result.Append("5")
                Case "ุ"c : result.Append("6")
                Case "ึ"c : result.Append("7")
                Case "ค"c : result.Append("8")
                Case "ต"c : result.Append("9")
                Case "จ"c : result.Append("0")

            ' อังกฤษ
                Case "A"c, "B"c, "C"c : result.Append("2")
                Case "D"c, "E"c, "F"c : result.Append("3")
                Case "G"c, "H"c, "I"c : result.Append("4")
                Case "J"c, "K"c, "L"c : result.Append("5")
                Case "M"c, "N"c, "O"c : result.Append("6")
                Case "P"c, "Q"c, "R"c, "S"c : result.Append("7")
                Case "T"c, "U"c, "V"c : result.Append("8")
                Case "W"c, "X"c, "Y"c, "Z"c : result.Append("9")

            End Select

        Next

        Return result.ToString()

    End Function
    Private Sub FillcmbType()

        Ds.Tables.Clear()
        cmbType.DataSource = Nothing
        SQL = "Select * from Tb_Type order by Tcode ASC"
        Dim dts1 As DataTable = Cmd_DataTable()
        If dts1.Rows.Count > 0 Then
            cmbType.ValueMember = "Tcode" 'กำหนดค่า
            cmbType.DisplayMember = "Tname" 'แสดงค่า
            cmbType.DataSource = dts1
            cmbType.SelectedIndex = 0
            Return
        End If
    End Sub


    Private Sub cmbType_MouseClick(sender As Object, e As MouseEventArgs) Handles cmbType.MouseClick
        FillcmbType()
    End Sub

    Private Sub cmbType_SelectedIndexChanged(sender As Object, e As EventArgs) Handles cmbType.SelectedIndexChanged
        SQL = "Select * From Tb_Type Where Tname = '" & cmbType.Text & "' order by Tcode ASC"

        Da = New SqlDataAdapter(SQL, Cn)
        Dt = New DataTable
        Da.Fill(Dt)

        If Dt.Rows.Count > 0 Then
            lblType.Text = Dt.Rows(0)("Tcode")
        End If

    End Sub
End Class
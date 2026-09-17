Public Class Fsetting_products
    'Dim username As String 'เก็บค่า Username
    Dim Productid As String 'เก็บค่า pid
    Dim PC_name As String 'เก็บค่าชื่อคอม
    Private Sub Show_Data()

        SQL = "select Product_code,Product_name,Lotid_format,Weight_net,Tare_weight,Amountperlet,Status,pid from Tb_Product order by Pid asc"
        DGV1.DataSource = Cmd_DataTable()
        With DGV1
            'ชื่อคอลัมที่ต้องการเปลี่ยน
            .Columns(0).HeaderText = "รหัส"
            .Columns(1).HeaderText = "ชื่อผลิตภัณฑ์"
            .Columns(2).HeaderText = "รูปแบบล็อต"
            .Columns(3).HeaderText = "น้ำหนักผ่าน"
            .Columns(4).HeaderText = "น้ำหนักภาชนะ"
            .Columns(5).HeaderText = "จำนวนต่อเลท"
            .Columns(6).HeaderText = "สถานะ"
        End With


        DGV1.ColumnHeadersDefaultCellStyle.Font = New Font("TH Sarabun New", 16)
        DGV1.RowsDefaultCellStyle.Font = New Font("TH Sarabun New", 16)
        DGV1.Columns(7).Visible = False
    End Sub

    Private Sub btnSave_Click(sender As Object, e As EventArgs) Handles btnSave.Click

        Select Case MsgBox("ต้องการบันทึกข้อมูลใช่หรือไม่ ?", MsgBoxStyle.YesNo, "ยืนยันการบันทึกข้อมูล")
            Case MsgBoxResult.Yes
                If Tb_productcode.Text <> "" And Tb_productname.Text <> "" And Tb_pattern.Text <> "" And Tb_netweight.Text <> "" And Tb_tareweight.Text <> "" Then
                    SQL = "Select * From Tb_product where Product_code = '" & Tb_productcode.Text & "' or Product_name = '" & Tb_productname.Text & "' "
                    Dim dts As DataTable = Cmd_DataTable()
                    If dts.Rows.Count > 0 Then
                        MessageBox.Show("ข้อมูลซ้ำ !!!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Warning)
                        clear()
                    Else
                        SQL = "Insert into Tb_Product (Product_code,Product_name,Lotid_format,Weight_net,Tare_weight,AmountperLet,Status,Uid,Pc_name) 
                   VALUES (N'" & Tb_productcode.Text & "','" & Tb_productname.Text & "','" & Tb_pattern.Text & "','" & CDec(Tb_netweight.Text) & "','" & CDec(Tb_tareweight.Text) & "','" & CInt(Tb_amountperlet.Text) & "','Enable','" & FMain.Uid & "','" & PC_name & "')"
                        Cmd_Excutequery()
                        clear()
                    End If
                Else
                    MessageBox.Show("โปรดใส่ข้อมูลให้ครบ !!!!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Asterisk)
                End If
        End Select
    End Sub
    Private Sub clear()
        Tb_productcode.Text = ""
        Tb_productname.Text = ""
        Tb_pattern.Text = ""
        Tb_netweight.Text = ""
        Tb_tareweight.Text = ""
        Tb_amountperlet.Text = ""
        rb_enable.Checked = True
        rb_disable.Checked = False
        Show_Data()
    End Sub

    Private Sub Fsetting_products_Load(sender As Object, e As EventArgs) Handles Me.Load
        Show_Data()
        Comname()
        rb_enable.Checked = True
        btnUpdate.Enabled = False
    End Sub
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub
    Private Sub Tb_amountperlet_KeyPress(sender As Object, e As KeyPressEventArgs) Handles Tb_amountperlet.KeyPress 'เฉพาะตัวเลข
        If Not Char.IsControl(e.KeyChar) AndAlso Not Char.IsDigit(e.KeyChar) AndAlso (e.KeyChar <> "."c) Then
            e.Handled = True
        End If

        If (e.KeyChar = "."c) AndAlso ((TryCast(sender, TextBox)).Text.IndexOf("."c) > -1) Then
            e.Handled = True
        End If
    End Sub

    Private Sub Tb_netweight_KeyPress(sender As Object, e As KeyPressEventArgs) Handles Tb_netweight.KeyPress 'เฉพาะตัวเลข
        If Not Char.IsControl(e.KeyChar) AndAlso Not Char.IsDigit(e.KeyChar) AndAlso (e.KeyChar <> "."c) Then
            e.Handled = True
        End If

        If (e.KeyChar = "."c) AndAlso ((TryCast(sender, TextBox)).Text.IndexOf("."c) > -1) Then
            e.Handled = True
        End If
    End Sub

    Private Sub Tb_tareweight_KeyPress(sender As Object, e As KeyPressEventArgs) Handles Tb_tareweight.KeyPress 'เฉพาะตัวเลข
        If Not Char.IsControl(e.KeyChar) AndAlso Not Char.IsDigit(e.KeyChar) AndAlso (e.KeyChar <> "."c) Then
            e.Handled = True
        End If

        If (e.KeyChar = "."c) AndAlso ((TryCast(sender, TextBox)).Text.IndexOf("."c) > -1) Then
            e.Handled = True
        End If
    End Sub

    Private Sub DGV1_Click(sender As Object, e As EventArgs) Handles DGV1.Click
        With DGV1.CurrentRow
            Productid = .Cells(7).Value.ToString()
            Tb_productcode.Text = .Cells(0).Value.ToString()
            Tb_productname.Text = .Cells(1).Value.ToString()
            Tb_pattern.Text = .Cells(2).Value.ToString()
            Tb_netweight.Text = .Cells(3).Value.ToString()
            Tb_tareweight.Text = .Cells(4).Value.ToString()
            Tb_amountperlet.Text = .Cells(5).Value.ToString()

            Select Case .Cells(6).Value.ToString()
                Case "Enable"
                    rb_enable.Checked = True
                Case "Disable"
                    rb_disable.Checked = True
            End Select
        End With
        btnUpdate.Enabled = True
        btnSave.Enabled = False

    End Sub

    Private Sub btnClear_Click(sender As Object, e As EventArgs) Handles btnClear.Click
        clear()
    End Sub

    Private Sub btnUpdate_Click(sender As Object, e As EventArgs) Handles btnUpdate.Click
        Dim Status_check As String
        Select Case rb_enable.Checked
            Case True
                Status_check = "Enable"
            Case False
                Status_check = "Disable"
        End Select

        If Productid <> "" Then
            Select Case MsgBox("ต้องการแก้ไขข้อมูลใช่หรือไม่ ?", MsgBoxStyle.YesNo, "ยืนยันการบันทึกข้อมูล")
                Case MsgBoxResult.Yes
                    SQL = " Update Tb_Product Set Product_code = '" & Tb_productcode.Text & "', Product_name = '" & Tb_productname.Text & "' , Lotid_format = '" & Tb_pattern.Text & "', Weight_net = '" & CDec(Tb_netweight.Text) & "', Tare_weight = '" & CDec(Tb_tareweight.Text) & "',AmountperLet = '" & CInt(Tb_amountperlet.Text) & "',Status = '" & Status_check & "',Uid = '" & FMain.Username.ToString & "',PC_name = '" & PC_name & "'  WHERE pid = '" & Productid & "'"
                    Cmd_Excutequery()
                    clear()
                Case MsgBoxResult.No
                    clear()
            End Select
        End If
    End Sub
End Class
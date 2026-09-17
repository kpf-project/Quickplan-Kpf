Public Class Flots_manage
    Dim Productid As Integer 'เก็บค่า PID
    Dim PC_name As String 'เก็บค่าชื่อคอม
    Private Sub Flots_manage_Load(sender As Object, e As EventArgs) Handles Me.Load
        btnSave.Enabled = False
        Show_Data()
        Comname()
    End Sub
    Private Sub Show_Data()

        SQL = "select Tb_Product.Pid,Product_code,Product_name,lotid_format,Tb_Productlots.Lots_code from Tb_Product 
left join Tb_Productlots on Tb_Product.Lid = Tb_Productlots.Lid
where Status = 'Enable' order by Pid asc"
        DGV1.DataSource = Cmd_DataTable()
        With DGV1
            'ชื่อคอลัมที่ต้องการเปลี่ยน
            .Columns(1).HeaderText = "รหัสผลิตภัณฑ์"
            .Columns(2).HeaderText = "ชื่อผลิตภัณฑ์"
            .Columns(4).HeaderText = "ล็อต"
        End With

        DGV1.ColumnHeadersDefaultCellStyle.Font = New Font("TH Sarabun New", 16)
        DGV1.RowsDefaultCellStyle.Font = New Font("TH Sarabun New", 16)
        DGV1.Columns(0).Visible = False
        DGV1.Columns(3).Visible = False
    End Sub
    Private Sub DGV1_Click(sender As Object, e As EventArgs) Handles DGV1.Click
        With DGV1.CurrentRow
            Productid = .Cells(0).Value.ToString()
            Tb_productcode.Text = .Cells(1).Value.ToString()
            Tb_productname.Text = .Cells(2).Value.ToString()
            mtb_lotcode.Mask = .Cells(3).Value.ToString()
        End With
        btnSave.Enabled = True
    End Sub
    Private Sub Clear()
        Tb_productcode.Text = ""
        Tb_productname.Text = ""
        mtb_lotcode.Clear()
    End Sub

    Private Sub btnClear_Click(sender As Object, e As EventArgs) Handles btnClear.Click
        Clear()
    End Sub
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub

    Private Sub btnSave_Click(sender As Object, e As EventArgs) Handles btnSave.Click
        Dim Datestr As String = DateTime.Now.ToString("yyyy-MM-dd", New System.Globalization.CultureInfo("en-US"))
        Dim Timestr As String = DateTime.Now.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US"))
        Select Case MsgBox("ต้องการบันทึกข้อมูลใช่หรือไม่ ?", MsgBoxStyle.YesNo, "ยืนยันการบันทึกข้อมูล")
            Case MsgBoxResult.Yes
                If Tb_productcode.Text <> "" And Tb_productname.Text <> "" And mtb_lotcode.MaskCompleted Then
                    SQL = "Insert into Tb_Productlots (Lots_code,Pid,Date_createlot,Time_createlot,Uid,Pc_name) 
                   VALUES (N'" & mtb_lotcode.Text & "','" & Productid & "','" & Datestr & "','" & Timestr & "','" & FMain.Uid & "','" & PC_name & "')"
                    Cmd_Excutequery()

                    SQL = "Select * From Tb_Productlots where lots_code = '" & mtb_lotcode.Text & "'"
                    Dim dts As DataTable = Cmd_DataTable()

                    SQL = "Update Tb_Product set Lid = '" & dts.Rows(0).Item(0).ToString & "' where Pid = '" & Productid & "'"
                    Cmd_Excutequery()

                    Clear()
                    dts.Clear()
                    Show_Data()
                Else
                    MessageBox.Show("โปรดใส่ข้อมูลให้ครบ !!!!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Asterisk)
                End If
        End Select
    End Sub
End Class
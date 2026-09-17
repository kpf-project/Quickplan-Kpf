Public Class Fselect_productW
    Private Sub Fselect_productW_Load(sender As Object, e As EventArgs) Handles Me.Load
        Show_Data()
    End Sub

    Private Sub Show_Data()

        SQL = "select Product_code,Product_name,Tb_Productlots.Lots_code,Tb_Product.lid from Tb_Product
                inner join Tb_Productlots on Tb_Product.Lid = Tb_Productlots.Lid
                where Status = 'Enable' order by Tb_Product.Pid asc"
        DGV1.DataSource = Cmd_DataTable()
        With DGV1
            'ชื่อคอลัมที่ต้องการเปลี่ยน
            .Columns(0).HeaderText = "รหัสผลิตภัณฑ์"
            .Columns(1).HeaderText = "ชื่อผลิตภัณฑ์"
            .Columns(2).HeaderText = "ล็อต"
        End With

        DGV1.ColumnHeadersDefaultCellStyle.Font = New Font("TH Sarabun New", 18)
        DGV1.RowsDefaultCellStyle.Font = New Font("TH Sarabun New", 18)
        DGV1.Columns(3).Visible = False



    End Sub

    Private Sub DGV1_DoubleClick(sender As Object, e As EventArgs) Handles DGV1.DoubleClick
        MainForm.Lid = DGV1.CurrentRow.Cells(3).Value
        Me.Close()
    End Sub

    Private Sub Fselect_productW_Closed(sender As Object, e As EventArgs) Handles Me.Closed
        If MainForm.Lid < 0 Then
            MainForm.Lid = 0
        End If
    End Sub
End Class
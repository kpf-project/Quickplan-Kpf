Public Class Flots_select
    Dim Lid As Integer 'ค่า Lid
    Dim Lotcode As String 'ค่า lotcode
    Dim Productcode As String 'ค่า Productcode
    Private Sub Flots_select_Load(sender As Object, e As EventArgs) Handles Me.Load
        Comboboxproduct()
    End Sub
    Private Sub Comboboxproduct()
        SQL = "SELECT Product_code,Product_name FROM Tb_Product Where Status = 'Enable'"
        Dim tbpro As DataTable = Cmd_DataTable()
        cmb_product.ValueMember = "Product_code"
        cmb_product.DisplayMember = "Product_name"
        cmb_product.DataSource = tbpro
    End Sub

    Private Sub cmb_product_SelectedIndexChanged(sender As Object, e As EventArgs) Handles cmb_product.SelectedIndexChanged
        Lb_product.Text = cmb_product.SelectedValue.ToString & " - " & cmb_product.Text
        Productcode = cmb_product.SelectedValue.ToString
        Showresult()
    End Sub
    Private Sub Showresult()
        SQL = "SELECT Lots_code,Count(Tb_Foodweight.Fwbarcode) as LetAmount,CAST(ISNULL(SUM(Tb_Foodweight.FgWeight),0) AS DECIMAL(18,2)) AS SumWeight,
        convert(varchar, Date_createlot, 105),Time_createlot,tb_productlots.lid
        FROM Tb_Productlots
        left join Tb_Product on Tb_Product.Pid = Tb_Productlots.Pid
        left join Tb_Foodweight on Tb_Foodweight.Lid = Tb_Productlots.Lid
        where Tb_product.Product_code = '" & cmb_product.SelectedValue.ToString & "'
        group by Lots_code,Date_createlot,Time_createlot,tb_productlots.lid"
        DGV1.DataSource = Cmd_DataTable()
        With DGV1
            'ชื่อคอลัมที่ต้องการเปลี่ยน
            .Columns(0).HeaderText = "รหัสล็อต"
            .Columns(1).HeaderText = "จำนวนถุง/เลท"
            .Columns(2).HeaderText = "รวมน้ำหนัก"
            .Columns(3).HeaderText = "วันที่"
            .Columns(4).HeaderText = "เวลา"
        End With
        DGV1.Columns(5).Visible = False
    End Sub
    Private Sub DGV1_DoubleClick(sender As Object, e As EventArgs) Handles DGV1.DoubleClick
        Lid = CInt(DGV1.CurrentRow.Cells(5).Value)
        Lotcode = DGV1.CurrentRow.Cells(0).Value

        Select Case MsgBox("ต้องการเลือก LotCode : " & Lotcode & " ใช่หรือไม่ ?", MsgBoxStyle.YesNo, "ยืนยันการบันทึกข้อมูล")
            Case MsgBoxResult.Yes
                Update_data()
                MessageBox.Show("ทำการเปลี่ยนล็อตเรียบร้อยแล้ว !!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Information)
                Me.Close()
            Case MsgBoxResult.No
                Me.Close()
        End Select
    End Sub
    Private Sub Update_data()
        SQL = "Update Tb_Product Set Lid = '" & Lid & "' where Product_code = '" & Productcode & "'"
        Cmd_Excutequery()
    End Sub
End Class
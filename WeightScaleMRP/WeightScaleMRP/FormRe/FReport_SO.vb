Public Class FReport_SO
    Dim Ipserver As String
    Dim DatabaseName As String
    Dim Userid As String
    Dim Password As String
    Private Sub Comboboxproduct()
        SQL = "SELECT Product_code,Product_name FROM Tb_Product Where Status = 'Enable'"
        Dim tbpro As DataTable = Cmd_DataTable()
        Dim row As DataRow = tbpro.NewRow()
        row(0) = 0
        row(1) = "เลือกผลิตภัณฑ์"
        tbpro.Rows.InsertAt(row, 0)

        cmb_product.ValueMember = "Product_code"
        cmb_product.DisplayMember = "Product_name"
        cmb_product.DataSource = tbpro
    End Sub
    Private Sub BTN_Report_Click(sender As Object, e As EventArgs) Handles BTN_Report.Click

        Dim Product_code As String
        If cmb_product.SelectedIndex > 0 Then
            Product_code = cmb_product.SelectedValue.ToString
        Else
            Product_code = ""
        End If

        Dim rp As New Report_SO
        rp.SetParameterValue("date1", DTP_1.Value.ToString("dd/MM/yyyy"))
        rp.SetParameterValue("product_code", Product_code)
        Dim tblLogon As CrystalDecisions.CrystalReports.Engine.Table
        Dim rptLogon As New CrystalDecisions.Shared.TableLogOnInfo
        For Each tblLogon In rp.Database.Tables
            rptLogon = tblLogon.LogOnInfo
            With rptLogon.ConnectionInfo
                .ServerName = Ipserver ' servername
                .DatabaseName = DatabaseName 'dbname
                .UserID = Userid 'dbuser
                .Password = Password 'password
                CrystalReportViewer1.ReportSource = rp
            End With
            tblLogon.ApplyLogOnInfo(rptLogon)
        Next
    End Sub

    Private Sub FReport_SO_Load(sender As Object, e As EventArgs) Handles Me.Load
        Ipserver = My.Settings.ipserver
        DatabaseName = My.Settings.DBname
        Userid = My.Settings.Username
        Password = My.Settings.Password
        Comboboxproduct()
    End Sub
End Class
Public Class FReport_FW2
    Dim Ipserver As String
    Dim DatabaseName As String
    Dim Userid As String
    Dim Password As String
    Private Sub FReport_FW2_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        Ipserver = My.Settings.ipserver
        DatabaseName = My.Settings.DBname
        Userid = My.Settings.Username
        Password = My.Settings.Password

    End Sub

    Private Sub BTN_Report_Click(sender As Object, e As EventArgs) Handles BTN_Report.Click
        Dim rp As New Report_FW2
        rp.SetParameterValue("date1", DTP_1.Value.ToString("dd/MM/yyyy"))
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
End Class
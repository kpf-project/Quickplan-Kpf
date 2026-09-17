Public Class FReport_Sum
    Dim Ipserver As String
    Dim DatabaseName As String
    Dim Userid As String
    Dim Password As String
    Private Sub BTN_Report_Click(sender As Object, e As EventArgs) Handles BTN_Report.Click
        Dim rp As New Report_Sum
        rp.SetParameterValue("date1", DTP_1.Value.ToString("dd/MM/yyyy"))
        rp.SetParameterValue("date2", DTP_2.Value.ToString("dd/MM/yyyy"))
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

    Private Sub FReport_Sum_Load(sender As Object, e As EventArgs) Handles Me.Load
        Ipserver = My.Settings.ipserver
        DatabaseName = My.Settings.DBname
        Userid = My.Settings.Username
        Password = My.Settings.Password
    End Sub
End Class
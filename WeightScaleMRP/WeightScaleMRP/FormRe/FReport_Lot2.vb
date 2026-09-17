Public Class FReport_Lot2
    Dim Ipserver As String
    Dim DatabaseName As String
    Dim Userid As String
    Dim Password As String
    Private Sub FReport_Lot2_Load(sender As Object, e As EventArgs) Handles MyBase.Load

        Ipserver = My.Settings.ipserver
        DatabaseName = My.Settings.DBname
        Userid = My.Settings.Username
        Password = My.Settings.Password

        Dim rp As New Report_Lot2
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
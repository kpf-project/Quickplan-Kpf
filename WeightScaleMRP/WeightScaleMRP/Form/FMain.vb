Imports System.ComponentModel
Public Class FMain
    Public Shared Username As String
    Public Shared Uid As Integer

    Private Sub Tsm_setting_machine_Click(sender As Object, e As EventArgs) Handles Tsm_setting_machine.Click
        'Fsetting_machine.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim setting As Fsetting_machine
            setting = Fsetting_machine
            setting.MdiParent = Me
            setting.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try

    End Sub

    Private Sub Tsm_setting_SQL_Click(sender As Object, e As EventArgs) Handles Tsm_setting_SQL.Click
        'Fsetting_SQL.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim setting_SQL As Fsetting_SQL
            setting_SQL = Fsetting_SQL
            setting_SQL.MdiParent = Me
            setting_SQL.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_setting_pro_Click(sender As Object, e As EventArgs) Handles Tsm_setting_pro.Click
        'Fsetting_products.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim setting_products As Fsetting_products
            setting_products = Fsetting_products
            setting_products.MdiParent = Me
            setting_products.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub FMain_Closed(sender As Object, e As EventArgs) Handles Me.Closed
        Application.Exit()
    End Sub

    Private Sub FMain_Load(sender As Object, e As EventArgs) Handles Me.Load

        Tssl_username.Text = "Username : " & Username

        Select Case FLogin.Role 'เปิดปิดเมนูตาม Role Admin = สูงสุด Employee = พนักงาน Report = ดูรายงานอย่างเดียว
            Case "Admin"
                Tsm_setting.Visible = True
            Case "Employee"
                Tsm_setting.Visible = False
            Case "Report"
                Tsm_setting.Visible = False
                Tsm_lots.Visible = False
                Tsm_weight.Visible = False
                Tsm_stockout_m.Visible = False
        End Select
    End Sub

    Private Sub Tsm_Newlots_Click(sender As Object, e As EventArgs) Handles Tsm_Newlots.Click
        'Flots_manage.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim lots_manage As Flots_manage
            lots_manage = Flots_manage
            lots_manage.MdiParent = Me
            lots_manage.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try

    End Sub

    Private Sub Tsm_setting_printer_Click(sender As Object, e As EventArgs) Handles Tsm_setting_printer.Click
        'Fsetting_printer.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim setting_printer As Fsetting_printer
            setting_printer = Fsetting_printer
            setting_printer.MdiParent = Me
            setting_printer.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_weight1_Click(sender As Object, e As EventArgs) Handles Tsm_weight1.Click
        'MainForm.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim MainForm1 As MainForm
            MainForm1 = MainForm
            MainForm1.MdiParent = Me
            MainForm1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try

    End Sub

    Private Sub Tsm_Cancel_Click(sender As Object, e As EventArgs) Handles Tsm_Cancel.Click
        'FCancel_FW.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Cancel_FW As FCancel_FW
            Cancel_FW = FCancel_FW
            Cancel_FW.MdiParent = Me
            Cancel_FW.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try

    End Sub
    Private Sub Tsm_stockout_Click(sender As Object, e As EventArgs) Handles Tsm_stockout.Click
        '    'FStockout.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Stockout As FStockout
            Stockout = FStockout
            Stockout.MdiParent = Me
            Stockout.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub


    Private Sub Tsm_Cancel_SO_Click(sender As Object, e As EventArgs) Handles Tsm_Cancel_SO.Click
        'FCancel_SO.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Cancel_SO As FCancel_SO
            Cancel_SO = FCancel_SO
            Cancel_SO.MdiParent = Me
            Cancel_SO.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_Return_Click(sender As Object, e As EventArgs) Handles Tsm_Return.Click
        'FWeight_Return.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Weight_Return As FWeight_Return
            Weight_Return = FWeight_Return
            Weight_Return.MdiParent = Me
            Weight_Return.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_Oldlot_Click(sender As Object, e As EventArgs) Handles Tsm_Oldlot.Click
        'Flots_select.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim lots_select As Flots_select
            lots_select = Flots_select
            lots_select.MdiParent = Me
            lots_select.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try

    End Sub

    Private Sub Tsm_report_Sum_Click(sender As Object, e As EventArgs) Handles Tsm_report_Sum.Click
        'FReport_Sum.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_Sum As FReport_Sum
            Report_Sum = FReport_Sum
            Report_Sum.MdiParent = Me
            Report_Sum.WindowState = FormWindowState.Maximized
            Report_Sum.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_FG2_Click(sender As Object, e As EventArgs) Handles Tsm_report_FG2.Click
        'FReport_FW.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_FW As FReport_FW
            Report_FW = FReport_FW
            Report_FW.MdiParent = Me
            Report_FW.WindowState = FormWindowState.Maximized
            Report_FW.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_SO2_Click(sender As Object, e As EventArgs) Handles Tsm_report_SO2.Click
        'FReport_SO.ShowDialog()
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_SO As FReport_SO
            Report_SO = FReport_SO
            Report_SO.MdiParent = Me
            Report_SO.WindowState = FormWindowState.Maximized
            Report_SO.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try

    End Sub

    Private Sub Tsm_report_FG1_Click(sender As Object, e As EventArgs) Handles Tsm_report_FG1.Click
        'FReport_FW1.ShowDialog()

        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_FW1 As FReport_FW1
            Report_FW1 = FReport_FW1
            Report_FW1.MdiParent = Me
            Report_FW1.WindowState = FormWindowState.Maximized
            Report_FW1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub
    Private Sub Tsm_report_SO1_Click(sender As Object, e As EventArgs) Handles Tsm_report_SO1.Click
        'FReport_SO1.ShowDialog()
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_SO1 As FReport_SO1
            Report_SO1 = FReport_SO1
            Report_SO1.MdiParent = Me
            Report_SO1.WindowState = FormWindowState.Maximized
            Report_SO1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_out_prison_Click(sender As Object, e As EventArgs) Handles Tsm_out_prison.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Stockout1 As FStockout1
            Stockout1 = FStockout1
            Stockout1.MdiParent = Me
            Stockout1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_Cancel_prison2_Click(sender As Object, e As EventArgs) Handles Tsm_Cancel_prison2.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Cancel_SO1 As FCancel_SO1
            Cancel_SO1 = FCancel_SO1
            Cancel_SO1.MdiParent = Me
            Cancel_SO1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_Cancel_prison1_Click(sender As Object, e As EventArgs) Handles Tsm_Cancel_prison1.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Cancel_FW1 As FCancel_FW1
            Cancel_FW1 = FCancel_FW1
            Cancel_FW1.MdiParent = Me
            Cancel_FW1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_prison_in1_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_in1.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_FW3 As FReport_FW3
            Report_FW3 = FReport_FW3
            Report_FW3.MdiParent = Me
            Report_FW3.WindowState = FormWindowState.Maximized
            Report_FW3.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_prison_in2_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_in2.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_FW2 As FReport_FW2
            Report_FW2 = FReport_FW2
            Report_FW2.MdiParent = Me
            Report_FW2.WindowState = FormWindowState.Maximized
            Report_FW2.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_prison_out1_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_out1.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_SO3 As FReport_SO3
            Report_SO3 = FReport_SO3
            Report_SO3.MdiParent = Me
            Report_SO3.WindowState = FormWindowState.Maximized
            Report_SO3.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_prison_out2_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_out2.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_SO2 As FReport_SO2
            Report_SO2 = FReport_SO2
            Report_SO2.MdiParent = Me
            Report_SO2.WindowState = FormWindowState.Maximized
            Report_SO2.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_prison_sum_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_sum.Click

    End Sub

    Private Sub Tsm_report_prison_lot_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_lot.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_Lot1 As FReport_Lot1
            Report_Lot1 = FReport_Lot1
            Report_Lot1.MdiParent = Me
            Report_Lot1.WindowState = FormWindowState.Maximized
            Report_Lot1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub

    Private Sub Tsm_report_prison_totalsum_Click(sender As Object, e As EventArgs) Handles Tsm_report_prison_totalsum.Click
        Try
            For Each frm As Form In Me.MdiChildren
                frm.Close()
            Next
            Dim Report_Sum1 As FReport_Sum1
            Report_Sum1 = FReport_Sum1
            Report_Sum1.MdiParent = Me
            Report_Sum1.WindowState = FormWindowState.Maximized
            Report_Sum1.Show()
        Catch ex As Exception
            MessageBox.Show(ex.ToString)
        End Try
    End Sub
End Class
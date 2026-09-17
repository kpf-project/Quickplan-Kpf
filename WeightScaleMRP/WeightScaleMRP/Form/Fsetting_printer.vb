Public Class Fsetting_printer
    Private Sub btnSave_Click(sender As Object, e As EventArgs) Handles btnSave.Click
        Try
            My.Settings.Printername = cmb_printer.Text
        Catch ex As Exception
        End Try
        Me.Close()
    End Sub
    Private Sub loadprinter()
        For Each InstalledPrinters In
            System.Drawing.Printing.PrinterSettings.InstalledPrinters
            Me.cmb_printer.Items.Add(InstalledPrinters)
        Next InstalledPrinters
    End Sub

    Private Sub btnClear_Click(sender As Object, e As EventArgs)
        cmb_printer.SelectedIndex = 0
    End Sub

    Private Sub Fsetting_printer_Load(sender As Object, e As EventArgs) Handles Me.Load
        loadprinter()
        cmb_printer.SelectedText = My.Settings.Printername
    End Sub
End Class
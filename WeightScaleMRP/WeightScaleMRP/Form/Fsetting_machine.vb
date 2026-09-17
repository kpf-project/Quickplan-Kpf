Imports System.IO.Ports
Public Class Fsetting_machine
    Private Sub Fsetting_machine_Load(sender As Object, e As EventArgs) Handles Me.Load
        tb_iploadcell.Text = My.Settings.iploadcell
        tb_portloadcell.Text = My.Settings.portloadcell

    End Sub
    Private Sub Savesetting()
        If tb_iploadcell.Text <> "" Or tb_portloadcell.Text <> "" Then
            Try
                My.Settings.iploadcell = tb_iploadcell.Text
                My.Settings.portloadcell = tb_portloadcell.Text
                My.Settings.Save()
                MessageBox.Show("บันทึกเรียบร้อยแล้ว", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Information)
                'Application.Exit()
            Catch ex As Exception

            End Try
        Else
            MessageBox.Show("โปรดใส่ข้อมูลให้ครบ !!!!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Information)
        End If

    End Sub
    Private Sub Btn_save_Click(sender As Object, e As EventArgs) Handles Btn_save.Click
        Savesetting()
        Me.Close()
    End Sub

    Private Sub Btn_cancle_Click(sender As Object, e As EventArgs) Handles Btn_cancel.Click
        Me.Close()
    End Sub
End Class
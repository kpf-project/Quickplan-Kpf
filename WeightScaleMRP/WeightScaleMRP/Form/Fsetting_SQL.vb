Imports System.Data.SqlClient
Public Class Fsetting_SQL

    Private Sub Btn_cancel_Click(sender As Object, e As EventArgs) Handles Btn_cancel.Click
        Me.Close()
    End Sub

    Private Sub Btn_save_Click(sender As Object, e As EventArgs) Handles Btn_save.Click
        Savesetting()
        MessageBox.Show("บันทึกเรียบร้อยแล้ว", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Information)
        Me.Close()

        'Application.Exit()
    End Sub

    Private Sub Fsetting_SQL_Load(sender As Object, e As EventArgs) Handles Me.Load

        TB_dbname.Text = My.Settings.DBname
        TB_ipserver.Text = My.Settings.ipserver
        Tb_username.Text = My.Settings.Username
        Tb_password.Text = My.Settings.Password

    End Sub

    Private Sub Savesetting()
        Dim Cn As New SqlConnection("Data Source=" & TB_ipserver.Text & ";Initial Catalog=" & TB_dbname.Text & ";Persist Security Info=True;User ID=" & Tb_username.Text & ";Password=" & Tb_password.Text & "")
        If TB_dbname.Text <> "" Or TB_ipserver.Text <> "" Or Tb_username.Text <> "" Or Tb_password.Text <> "" Then
            Try
                With Cn
                    Try
                        Cursor.Current = Cursors.WaitCursor
                        If .State = ConnectionState.Open Then
                            .Close()
                            .Open()
                            MessageBox.Show("Server Connected", "ทดสอบการเชื่อมต่อ", MessageBoxButtons.OK, MessageBoxIcon.Information)
                            My.Settings.DBname = TB_dbname.Text
                            My.Settings.ipserver = TB_ipserver.Text
                            My.Settings.Username = Tb_username.Text
                            My.Settings.Password = Tb_password.Text
                            My.Settings.Save()
                        Else
                            .Open()
                            MessageBox.Show("Server Connected", "ทดสอบการเชื่อมต่อ", MessageBoxButtons.OK, MessageBoxIcon.Information)
                            My.Settings.DBname = TB_dbname.Text
                            My.Settings.ipserver = TB_ipserver.Text
                            My.Settings.Username = Tb_username.Text
                            My.Settings.Password = Tb_password.Text
                            My.Settings.Save()
                        End If
                    Catch ex As Exception
                        MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error)
                    Finally
                        Cursor.Current = Cursors.Default
                        .Close()
                    End Try
                End With

            Catch ex As Exception
                MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error)
            End Try

        Else
            MessageBox.Show("โปรดใส่ข้อมูลให้ครบ !!!!!", "ผลการทำงาน", MessageBoxButtons.OK, MessageBoxIcon.Asterisk)
        End If
    End Sub
End Class
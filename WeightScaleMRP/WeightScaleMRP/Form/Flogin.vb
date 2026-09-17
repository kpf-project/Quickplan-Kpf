Public Class FLogin
    Public Role As String
    Private Sub btnlogin_Click(sender As Object, e As EventArgs) Handles btnlogin.Click
        SQL = "Select * from Tb_User where Username  = '" & tb_username.Text & "' and Password = '" & tb_password.Text & "'"
        Dim dts As DataTable = Cmd_DataTable()
        If dts.Rows.Count <= 0 Then
            MessageBox.Show("กรอกชื่อผู้ใช้งาน และ รหัสผ่านไม่ถูกต้อง !!!", "แจ้งเตือนข้อผิดพลาด", MessageBoxButtons.OK, MessageBoxIcon.Warning)
            tb_username.Text = ""
            tb_password.Text = ""
            tb_username.Focus()
            Exit Sub
        Else
            FMain.Uid = dts.Rows(0)("Uid").ToString
            FMain.Username = dts.Rows(0)("Username").ToString
            Role = dts.Rows(0)("User_role").ToString
            FMain.Show()
            Me.Hide()
        End If
    End Sub
    Private Sub tb_username_KeyDown(sender As Object, e As KeyEventArgs) Handles tb_username.KeyDown
        If e.KeyCode = Keys.Enter Then
            tb_password.Focus()
        End If
    End Sub
    Private Sub tb_password_KeyDown(sender As Object, e As KeyEventArgs) Handles tb_password.KeyDown
        If e.KeyCode = Keys.Enter Then
            btnlogin_Click(sender, e)
        End If
    End Sub

    Private Sub Flogin_Load(sender As Object, e As EventArgs) Handles Me.Load
        'My.Settings.Reset()
        If My.Settings.ipserver = "" Then
            Fsetting_SQL.ShowDialog()
            'Me.Hide()
        End If
    End Sub
End Class
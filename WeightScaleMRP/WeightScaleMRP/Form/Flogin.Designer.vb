<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class FLogin
    Inherits System.Windows.Forms.Form

    'Form overrides dispose to clean up the component list.
    <System.Diagnostics.DebuggerNonUserCode()> _
    Protected Overrides Sub Dispose(ByVal disposing As Boolean)
        Try
            If disposing AndAlso components IsNot Nothing Then
                components.Dispose()
            End If
        Finally
            MyBase.Dispose(disposing)
        End Try
    End Sub

    'Required by the Windows Form Designer
    Private components As System.ComponentModel.IContainer

    'NOTE: The following procedure is required by the Windows Form Designer
    'It can be modified using the Windows Form Designer.  
    'Do not modify it using the code editor.
    <System.Diagnostics.DebuggerStepThrough()> _
    Private Sub InitializeComponent()
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(FLogin))
        Me.Label1 = New System.Windows.Forms.Label()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.tb_username = New System.Windows.Forms.TextBox()
        Me.tb_password = New System.Windows.Forms.TextBox()
        Me.btnlogin = New System.Windows.Forms.Button()
        Me.SuspendLayout()
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(12, 27)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(101, 32)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "Username :"
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(12, 82)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(94, 32)
        Me.Label2.TabIndex = 1
        Me.Label2.Text = "Password :"
        '
        'tb_username
        '
        Me.tb_username.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.tb_username.Location = New System.Drawing.Point(114, 24)
        Me.tb_username.Name = "tb_username"
        Me.tb_username.Size = New System.Drawing.Size(115, 39)
        Me.tb_username.TabIndex = 2
        '
        'tb_password
        '
        Me.tb_password.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.tb_password.Location = New System.Drawing.Point(114, 79)
        Me.tb_password.Name = "tb_password"
        Me.tb_password.PasswordChar = Global.Microsoft.VisualBasic.ChrW(42)
        Me.tb_password.Size = New System.Drawing.Size(115, 39)
        Me.tb_password.TabIndex = 3
        '
        'btnlogin
        '
        Me.btnlogin.BackColor = System.Drawing.Color.White
        Me.btnlogin.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnlogin.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnlogin.ForeColor = System.Drawing.Color.Blue
        Me.btnlogin.Location = New System.Drawing.Point(114, 142)
        Me.btnlogin.Name = "btnlogin"
        Me.btnlogin.Size = New System.Drawing.Size(115, 46)
        Me.btnlogin.TabIndex = 5
        Me.btnlogin.Text = "Login"
        Me.btnlogin.UseVisualStyleBackColor = False
        '
        'FLogin
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(283, 213)
        Me.Controls.Add(Me.btnlogin)
        Me.Controls.Add(Me.tb_password)
        Me.Controls.Add(Me.tb_username)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 6, 4, 6)
        Me.Name = "FLogin"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "Login"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label1 As Label
    Friend WithEvents Label2 As Label
    Friend WithEvents tb_username As TextBox
    Friend WithEvents tb_password As TextBox
    Friend WithEvents btnlogin As Button
End Class

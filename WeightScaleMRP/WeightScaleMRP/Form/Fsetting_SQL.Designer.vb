<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Fsetting_SQL
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Fsetting_SQL))
        Me.Label1 = New System.Windows.Forms.Label()
        Me.TB_dbname = New System.Windows.Forms.TextBox()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.TB_ipserver = New System.Windows.Forms.TextBox()
        Me.Label3 = New System.Windows.Forms.Label()
        Me.Tb_username = New System.Windows.Forms.TextBox()
        Me.Tb_password = New System.Windows.Forms.TextBox()
        Me.Label4 = New System.Windows.Forms.Label()
        Me.Btn_save = New System.Windows.Forms.Button()
        Me.Btn_cancel = New System.Windows.Forms.Button()
        Me.SuspendLayout()
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(24, 35)
        Me.Label1.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(82, 30)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "IP Server:"
        '
        'TB_dbname
        '
        Me.TB_dbname.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.TB_dbname.Location = New System.Drawing.Point(164, 87)
        Me.TB_dbname.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.TB_dbname.Name = "TB_dbname"
        Me.TB_dbname.Size = New System.Drawing.Size(221, 39)
        Me.TB_dbname.TabIndex = 1
        Me.TB_dbname.Text = "Weight"
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(24, 90)
        Me.Label2.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(128, 30)
        Me.Label2.TabIndex = 2
        Me.Label2.Text = "Database Name:"
        '
        'TB_ipserver
        '
        Me.TB_ipserver.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.TB_ipserver.Location = New System.Drawing.Point(164, 32)
        Me.TB_ipserver.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.TB_ipserver.Name = "TB_ipserver"
        Me.TB_ipserver.Size = New System.Drawing.Size(221, 39)
        Me.TB_ipserver.TabIndex = 0
        Me.TB_ipserver.Text = "192.168.210.6"
        '
        'Label3
        '
        Me.Label3.AutoSize = True
        Me.Label3.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label3.Location = New System.Drawing.Point(24, 153)
        Me.Label3.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label3.Name = "Label3"
        Me.Label3.Size = New System.Drawing.Size(90, 30)
        Me.Label3.TabIndex = 4
        Me.Label3.Text = "Username:"
        '
        'Tb_username
        '
        Me.Tb_username.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_username.Location = New System.Drawing.Point(164, 150)
        Me.Tb_username.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_username.Name = "Tb_username"
        Me.Tb_username.Size = New System.Drawing.Size(221, 39)
        Me.Tb_username.TabIndex = 2
        Me.Tb_username.Text = "sa"
        '
        'Tb_password
        '
        Me.Tb_password.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_password.Location = New System.Drawing.Point(164, 210)
        Me.Tb_password.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_password.Name = "Tb_password"
        Me.Tb_password.Size = New System.Drawing.Size(221, 39)
        Me.Tb_password.TabIndex = 3
        Me.Tb_password.Text = "KPfood%2023"
        Me.Tb_password.UseSystemPasswordChar = True
        '
        'Label4
        '
        Me.Label4.AutoSize = True
        Me.Label4.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label4.Location = New System.Drawing.Point(24, 213)
        Me.Label4.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label4.Name = "Label4"
        Me.Label4.Size = New System.Drawing.Size(83, 30)
        Me.Label4.TabIndex = 7
        Me.Label4.Text = "Password:"
        '
        'Btn_save
        '
        Me.Btn_save.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Btn_save.Location = New System.Drawing.Point(164, 274)
        Me.Btn_save.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Btn_save.Name = "Btn_save"
        Me.Btn_save.Size = New System.Drawing.Size(102, 52)
        Me.Btn_save.TabIndex = 4
        Me.Btn_save.Text = "Save"
        Me.Btn_save.UseVisualStyleBackColor = True
        '
        'Btn_cancel
        '
        Me.Btn_cancel.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Btn_cancel.Location = New System.Drawing.Point(283, 274)
        Me.Btn_cancel.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Btn_cancel.Name = "Btn_cancel"
        Me.Btn_cancel.Size = New System.Drawing.Size(102, 52)
        Me.Btn_cancel.TabIndex = 5
        Me.Btn_cancel.Text = "Cancel"
        Me.Btn_cancel.UseVisualStyleBackColor = True
        '
        'Fsetting_SQL
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(417, 346)
        Me.Controls.Add(Me.Btn_cancel)
        Me.Controls.Add(Me.Btn_save)
        Me.Controls.Add(Me.Label4)
        Me.Controls.Add(Me.Tb_password)
        Me.Controls.Add(Me.Tb_username)
        Me.Controls.Add(Me.Label3)
        Me.Controls.Add(Me.TB_ipserver)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.TB_dbname)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "Fsetting_SQL"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ตั้งค่าเชื่อมต่อฐานข้อมูล SQL"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label1 As Label
    Friend WithEvents TB_dbname As TextBox
    Friend WithEvents Label2 As Label
    Friend WithEvents TB_ipserver As TextBox
    Friend WithEvents Label3 As Label
    Friend WithEvents Tb_username As TextBox
    Friend WithEvents Tb_password As TextBox
    Friend WithEvents Label4 As Label
    Friend WithEvents Btn_save As Button
    Friend WithEvents Btn_cancel As Button
End Class

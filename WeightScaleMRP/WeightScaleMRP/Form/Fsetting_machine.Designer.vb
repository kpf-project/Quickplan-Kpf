<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Fsetting_machine
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Fsetting_machine))
        Me.Label1 = New System.Windows.Forms.Label()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.Btn_save = New System.Windows.Forms.Button()
        Me.Btn_cancel = New System.Windows.Forms.Button()
        Me.tb_iploadcell = New System.Windows.Forms.TextBox()
        Me.tb_portloadcell = New System.Windows.Forms.TextBox()
        Me.SuspendLayout()
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(12, 34)
        Me.Label1.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(93, 30)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "IP Address:"
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(12, 88)
        Me.Label2.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(47, 30)
        Me.Label2.TabIndex = 2
        Me.Label2.Text = "Port:"
        '
        'Btn_save
        '
        Me.Btn_save.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Btn_save.Location = New System.Drawing.Point(132, 145)
        Me.Btn_save.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Btn_save.Name = "Btn_save"
        Me.Btn_save.Size = New System.Drawing.Size(86, 50)
        Me.Btn_save.TabIndex = 10
        Me.Btn_save.Text = "Save"
        Me.Btn_save.UseVisualStyleBackColor = True
        '
        'Btn_cancel
        '
        Me.Btn_cancel.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Btn_cancel.Location = New System.Drawing.Point(228, 145)
        Me.Btn_cancel.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Btn_cancel.Name = "Btn_cancel"
        Me.Btn_cancel.Size = New System.Drawing.Size(86, 50)
        Me.Btn_cancel.TabIndex = 11
        Me.Btn_cancel.Text = "Cancel"
        Me.Btn_cancel.UseVisualStyleBackColor = True
        '
        'tb_iploadcell
        '
        Me.tb_iploadcell.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.tb_iploadcell.Location = New System.Drawing.Point(132, 31)
        Me.tb_iploadcell.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.tb_iploadcell.Name = "tb_iploadcell"
        Me.tb_iploadcell.Size = New System.Drawing.Size(182, 39)
        Me.tb_iploadcell.TabIndex = 12
        Me.tb_iploadcell.Text = "192.168.211.241"
        '
        'tb_portloadcell
        '
        Me.tb_portloadcell.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.tb_portloadcell.Location = New System.Drawing.Point(132, 85)
        Me.tb_portloadcell.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.tb_portloadcell.Name = "tb_portloadcell"
        Me.tb_portloadcell.Size = New System.Drawing.Size(182, 39)
        Me.tb_portloadcell.TabIndex = 13
        Me.tb_portloadcell.Text = "9761"
        '
        'Fsetting_machine
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(355, 222)
        Me.Controls.Add(Me.tb_portloadcell)
        Me.Controls.Add(Me.tb_iploadcell)
        Me.Controls.Add(Me.Btn_cancel)
        Me.Controls.Add(Me.Btn_save)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "Fsetting_machine"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ตั้งค่าเชื่อมต่อเครื่องLoad Cell"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label1 As Label
    Friend WithEvents Label2 As Label
    Friend WithEvents Btn_save As Button
    Friend WithEvents Btn_cancel As Button
    Friend WithEvents tb_iploadcell As TextBox
    Friend WithEvents tb_portloadcell As TextBox
End Class

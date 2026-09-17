<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class FCancel_FW
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(FCancel_FW))
        Me.Label1 = New System.Windows.Forms.Label()
        Me.Tb_barcode = New System.Windows.Forms.TextBox()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.SuspendLayout()
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(37, 90)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(146, 37)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "สแกนบาร์โค้ด :"
        '
        'Tb_barcode
        '
        Me.Tb_barcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_barcode.Location = New System.Drawing.Point(185, 87)
        Me.Tb_barcode.Name = "Tb_barcode"
        Me.Tb_barcode.Size = New System.Drawing.Size(311, 43)
        Me.Tb_barcode.TabIndex = 1
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 19.8!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(234, 22)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(140, 44)
        Me.Label2.TabIndex = 2
        Me.Label2.Text = "ยกเลิกการชั่ง"
        '
        'FCancel_FW
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(10.0!, 36.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(589, 188)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.Tb_barcode)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.MaximizeBox = False
        Me.MinimizeBox = False
        Me.Name = "FCancel_FW"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ยกเลิกการชั่ง"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label1 As Label
    Friend WithEvents Tb_barcode As TextBox
    Friend WithEvents Label2 As Label
End Class

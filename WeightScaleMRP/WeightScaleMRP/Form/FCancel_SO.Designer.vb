<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class FCancel_SO
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(FCancel_SO))
        Me.Label2 = New System.Windows.Forms.Label()
        Me.Tb_barcode = New System.Windows.Forms.TextBox()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.SuspendLayout()
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 19.8!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(232, 25)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(135, 36)
        Me.Label2.TabIndex = 5
        Me.Label2.Text = "ยกเลิกการเบิก"
        '
        'Tb_barcode
        '
        Me.Tb_barcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_barcode.Location = New System.Drawing.Point(186, 91)
        Me.Tb_barcode.Name = "Tb_barcode"
        Me.Tb_barcode.Size = New System.Drawing.Size(311, 36)
        Me.Tb_barcode.TabIndex = 4
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(38, 98)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(115, 30)
        Me.Label1.TabIndex = 3
        Me.Label1.Text = "สแกนบาร์โค้ด :"
        '
        'FCancel_SO
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(589, 188)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.Tb_barcode)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 6, 4, 6)
        Me.MaximizeBox = False
        Me.MinimizeBox = False
        Me.Name = "FCancel_SO"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ยกเลิกการเบิก"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label2 As Label
    Friend WithEvents Tb_barcode As TextBox
    Friend WithEvents Label1 As Label
End Class

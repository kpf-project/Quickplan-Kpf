<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()>
Partial Class FCancel_SO1
    Inherits System.Windows.Forms.Form

    'Form overrides dispose to clean up the component list.
    <System.Diagnostics.DebuggerNonUserCode()>
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
    <System.Diagnostics.DebuggerStepThrough()>
    Private Sub InitializeComponent()
        Me.Label3 = New System.Windows.Forms.Label()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.Tb_barcode = New System.Windows.Forms.TextBox()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.SuspendLayout()
        '
        'Label3
        '
        Me.Label3.AutoSize = True
        Me.Label3.Font = New System.Drawing.Font("TH Sarabun New", 20.25!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label3.ForeColor = System.Drawing.Color.Red
        Me.Label3.Location = New System.Drawing.Point(12, 9)
        Me.Label3.Name = "Label3"
        Me.Label3.Size = New System.Drawing.Size(110, 36)
        Me.Label3.TabIndex = 10
        Me.Label3.Text = "* เรือนจำ *"
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 19.8!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.ForeColor = System.Drawing.Color.Blue
        Me.Label2.Location = New System.Drawing.Point(204, 9)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(135, 36)
        Me.Label2.TabIndex = 9
        Me.Label2.Text = "ยกเลิกการเบิก"
        '
        'Tb_barcode
        '
        Me.Tb_barcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_barcode.Location = New System.Drawing.Point(149, 62)
        Me.Tb_barcode.Name = "Tb_barcode"
        Me.Tb_barcode.Size = New System.Drawing.Size(256, 36)
        Me.Tb_barcode.TabIndex = 8
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(13, 65)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(115, 30)
        Me.Label1.TabIndex = 7
        Me.Label1.Text = "สแกนบาร์โค้ด :"
        '
        'FCancel_SO1
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 28.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(447, 128)
        Me.Controls.Add(Me.Label3)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.Tb_barcode)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Margin = New System.Windows.Forms.Padding(4, 6, 4, 6)
        Me.Name = "FCancel_SO1"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ยกเลิกการเบิก เรือนจำ"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label3 As Label
    Friend WithEvents Label2 As Label
    Friend WithEvents Tb_barcode As TextBox
    Friend WithEvents Label1 As Label
End Class

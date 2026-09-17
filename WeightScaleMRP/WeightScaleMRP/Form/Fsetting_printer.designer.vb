<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Fsetting_printer
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Fsetting_printer))
        Me.Label1 = New System.Windows.Forms.Label()
        Me.cmb_printer = New System.Windows.Forms.ComboBox()
        Me.btnClear = New System.Windows.Forms.Button()
        Me.btnSave = New System.Windows.Forms.Button()
        Me.SuspendLayout()
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(12, 30)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(191, 37)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "เครื่องปริ้นบาร์โค้ด : "
        '
        'cmb_printer
        '
        Me.cmb_printer.FormattingEnabled = True
        Me.cmb_printer.Location = New System.Drawing.Point(209, 27)
        Me.cmb_printer.Name = "cmb_printer"
        Me.cmb_printer.Size = New System.Drawing.Size(363, 44)
        Me.cmb_printer.TabIndex = 84
        '
        'btnClear
        '
        Me.btnClear.BackgroundImage = CType(resources.GetObject("btnClear.BackgroundImage"), System.Drawing.Image)
        Me.btnClear.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch
        Me.btnClear.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnClear.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnClear.ForeColor = System.Drawing.Color.Green
        Me.btnClear.Image = CType(resources.GetObject("btnClear.Image"), System.Drawing.Image)
        Me.btnClear.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.btnClear.Location = New System.Drawing.Point(388, 91)
        Me.btnClear.Margin = New System.Windows.Forms.Padding(5, 7, 5, 7)
        Me.btnClear.Name = "btnClear"
        Me.btnClear.Size = New System.Drawing.Size(116, 47)
        Me.btnClear.TabIndex = 86
        Me.btnClear.Text = "เคลียร์"
        Me.btnClear.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnClear.UseVisualStyleBackColor = True
        '
        'btnSave
        '
        Me.btnSave.BackgroundImage = CType(resources.GetObject("btnSave.BackgroundImage"), System.Drawing.Image)
        Me.btnSave.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch
        Me.btnSave.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnSave.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnSave.ForeColor = System.Drawing.SystemColors.ControlText
        Me.btnSave.Image = CType(resources.GetObject("btnSave.Image"), System.Drawing.Image)
        Me.btnSave.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.btnSave.Location = New System.Drawing.Point(231, 91)
        Me.btnSave.Margin = New System.Windows.Forms.Padding(5, 7, 5, 7)
        Me.btnSave.Name = "btnSave"
        Me.btnSave.Size = New System.Drawing.Size(116, 47)
        Me.btnSave.TabIndex = 85
        Me.btnSave.Text = "บันทึก"
        Me.btnSave.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnSave.UseVisualStyleBackColor = True
        '
        'Fsetting_printer
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(10.0!, 36.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(607, 162)
        Me.Controls.Add(Me.btnClear)
        Me.Controls.Add(Me.btnSave)
        Me.Controls.Add(Me.cmb_printer)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "Fsetting_printer"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "คั้งค่าเครื่องปริ้นบาร์โค้ด"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label1 As Label
    Friend WithEvents cmb_printer As ComboBox
    Friend WithEvents btnClear As Button
    Friend WithEvents btnSave As Button
End Class

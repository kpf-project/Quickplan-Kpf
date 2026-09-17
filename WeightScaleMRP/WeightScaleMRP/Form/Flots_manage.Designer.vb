<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()>
Partial Class Flots_manage
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Flots_manage))
        Me.GroupBox1 = New System.Windows.Forms.GroupBox()
        Me.DGV1 = New System.Windows.Forms.DataGridView()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.Tb_productcode = New System.Windows.Forms.TextBox()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.Tb_productname = New System.Windows.Forms.TextBox()
        Me.mtb_lotcode = New System.Windows.Forms.MaskedTextBox()
        Me.Label3 = New System.Windows.Forms.Label()
        Me.btnClear = New System.Windows.Forms.Button()
        Me.btnSave = New System.Windows.Forms.Button()
        Me.GroupBox1.SuspendLayout()
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).BeginInit()
        Me.SuspendLayout()
        '
        'GroupBox1
        '
        Me.GroupBox1.Controls.Add(Me.DGV1)
        Me.GroupBox1.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.GroupBox1.Location = New System.Drawing.Point(16, 12)
        Me.GroupBox1.Name = "GroupBox1"
        Me.GroupBox1.Size = New System.Drawing.Size(618, 426)
        Me.GroupBox1.TabIndex = 0
        Me.GroupBox1.TabStop = False
        Me.GroupBox1.Text = "เลือกผลิตภัณฑ์เพื่อสร้างล็อต"
        '
        'DGV1
        '
        Me.DGV1.Anchor = CType((((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.DGV1.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill
        Me.DGV1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize
        Me.DGV1.Location = New System.Drawing.Point(6, 34)
        Me.DGV1.MultiSelect = False
        Me.DGV1.Name = "DGV1"
        Me.DGV1.ReadOnly = True
        Me.DGV1.RowHeadersVisible = False
        Me.DGV1.RowTemplate.Height = 35
        Me.DGV1.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect
        Me.DGV1.Size = New System.Drawing.Size(606, 387)
        Me.DGV1.TabIndex = 0
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(654, 81)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(104, 30)
        Me.Label1.TabIndex = 1
        Me.Label1.Text = "รหัสผลิตภัณฑ์ :"
        '
        'Tb_productcode
        '
        Me.Tb_productcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_productcode.Location = New System.Drawing.Point(774, 78)
        Me.Tb_productcode.Name = "Tb_productcode"
        Me.Tb_productcode.ReadOnly = True
        Me.Tb_productcode.Size = New System.Drawing.Size(179, 36)
        Me.Tb_productcode.TabIndex = 2
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(654, 143)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(96, 30)
        Me.Label2.TabIndex = 3
        Me.Label2.Text = "ชื่อผลิตภัณฑ์ :"
        '
        'Tb_productname
        '
        Me.Tb_productname.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_productname.Location = New System.Drawing.Point(774, 140)
        Me.Tb_productname.Name = "Tb_productname"
        Me.Tb_productname.ReadOnly = True
        Me.Tb_productname.Size = New System.Drawing.Size(179, 36)
        Me.Tb_productname.TabIndex = 4
        '
        'mtb_lotcode
        '
        Me.mtb_lotcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.mtb_lotcode.Location = New System.Drawing.Point(774, 196)
        Me.mtb_lotcode.Name = "mtb_lotcode"
        Me.mtb_lotcode.Size = New System.Drawing.Size(179, 36)
        Me.mtb_lotcode.TabIndex = 5
        Me.mtb_lotcode.TextAlign = System.Windows.Forms.HorizontalAlignment.Center
        '
        'Label3
        '
        Me.Label3.AutoSize = True
        Me.Label3.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label3.Location = New System.Drawing.Point(654, 199)
        Me.Label3.Name = "Label3"
        Me.Label3.Size = New System.Drawing.Size(63, 30)
        Me.Label3.TabIndex = 6
        Me.Label3.Text = "รหัสล็อต"
        '
        'btnClear
        '
        Me.btnClear.BackgroundImage = CType(resources.GetObject("btnClear.BackgroundImage"), System.Drawing.Image)
        Me.btnClear.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch
        Me.btnClear.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnClear.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnClear.ForeColor = System.Drawing.Color.Green
        Me.btnClear.Image = CType(resources.GetObject("btnClear.Image"), System.Drawing.Image)
        Me.btnClear.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.btnClear.Location = New System.Drawing.Point(854, 283)
        Me.btnClear.Margin = New System.Windows.Forms.Padding(5, 7, 5, 7)
        Me.btnClear.Name = "btnClear"
        Me.btnClear.Size = New System.Drawing.Size(99, 46)
        Me.btnClear.TabIndex = 87
        Me.btnClear.Text = "เคลียร์"
        Me.btnClear.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnClear.UseVisualStyleBackColor = True
        '
        'btnSave
        '
        Me.btnSave.BackgroundImage = CType(resources.GetObject("btnSave.BackgroundImage"), System.Drawing.Image)
        Me.btnSave.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch
        Me.btnSave.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnSave.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnSave.ForeColor = System.Drawing.Color.Blue
        Me.btnSave.Image = CType(resources.GetObject("btnSave.Image"), System.Drawing.Image)
        Me.btnSave.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.btnSave.Location = New System.Drawing.Point(705, 283)
        Me.btnSave.Margin = New System.Windows.Forms.Padding(5, 7, 5, 7)
        Me.btnSave.Name = "btnSave"
        Me.btnSave.Size = New System.Drawing.Size(99, 46)
        Me.btnSave.TabIndex = 86
        Me.btnSave.Text = "บันทึก"
        Me.btnSave.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnSave.UseVisualStyleBackColor = True
        '
        'Flots_manage
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 31.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(1005, 455)
        Me.Controls.Add(Me.btnClear)
        Me.Controls.Add(Me.btnSave)
        Me.Controls.Add(Me.Label3)
        Me.Controls.Add(Me.mtb_lotcode)
        Me.Controls.Add(Me.Tb_productname)
        Me.Controls.Add(Me.Label2)
        Me.Controls.Add(Me.Tb_productcode)
        Me.Controls.Add(Me.Label1)
        Me.Controls.Add(Me.GroupBox1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 17.25!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "Flots_manage"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "สร้างล็อตใหม่"
        Me.GroupBox1.ResumeLayout(False)
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).EndInit()
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents GroupBox1 As GroupBox
    Friend WithEvents DGV1 As DataGridView
    Friend WithEvents Label1 As Label
    Friend WithEvents Tb_productcode As TextBox
    Friend WithEvents Label2 As Label
    Friend WithEvents Tb_productname As TextBox
    Friend WithEvents mtb_lotcode As MaskedTextBox
    Friend WithEvents Label3 As Label
    Friend WithEvents btnClear As Button
    Friend WithEvents btnSave As Button
End Class

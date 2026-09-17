<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Fsetting_products
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Fsetting_products))
        Me.GroupBox1 = New System.Windows.Forms.GroupBox()
        Me.DGV1 = New System.Windows.Forms.DataGridView()
        Me.GroupBox2 = New System.Windows.Forms.GroupBox()
        Me.rb_disable = New System.Windows.Forms.RadioButton()
        Me.rb_enable = New System.Windows.Forms.RadioButton()
        Me.Tb_amountperlet = New System.Windows.Forms.TextBox()
        Me.Label6 = New System.Windows.Forms.Label()
        Me.btnClear = New System.Windows.Forms.Button()
        Me.btnUpdate = New System.Windows.Forms.Button()
        Me.btnSave = New System.Windows.Forms.Button()
        Me.Label5 = New System.Windows.Forms.Label()
        Me.Label4 = New System.Windows.Forms.Label()
        Me.Label3 = New System.Windows.Forms.Label()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.Tb_tareweight = New System.Windows.Forms.TextBox()
        Me.Tb_netweight = New System.Windows.Forms.TextBox()
        Me.Tb_pattern = New System.Windows.Forms.TextBox()
        Me.Tb_productname = New System.Windows.Forms.TextBox()
        Me.Tb_productcode = New System.Windows.Forms.TextBox()
        Me.GroupBox1.SuspendLayout()
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).BeginInit()
        Me.GroupBox2.SuspendLayout()
        Me.SuspendLayout()
        '
        'GroupBox1
        '
        Me.GroupBox1.Anchor = CType(((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left), System.Windows.Forms.AnchorStyles)
        Me.GroupBox1.Controls.Add(Me.DGV1)
        Me.GroupBox1.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.GroupBox1.Location = New System.Drawing.Point(11, 7)
        Me.GroupBox1.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.GroupBox1.Name = "GroupBox1"
        Me.GroupBox1.Padding = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.GroupBox1.Size = New System.Drawing.Size(766, 505)
        Me.GroupBox1.TabIndex = 0
        Me.GroupBox1.TabStop = False
        Me.GroupBox1.Text = "ตารางผลิตภัณฑ์"
        '
        'DGV1
        '
        Me.DGV1.Anchor = CType((((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.DGV1.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.DisplayedCells
        Me.DGV1.AutoSizeRowsMode = System.Windows.Forms.DataGridViewAutoSizeRowsMode.DisplayedCells
        Me.DGV1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize
        Me.DGV1.Location = New System.Drawing.Point(8, 34)
        Me.DGV1.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.DGV1.MultiSelect = False
        Me.DGV1.Name = "DGV1"
        Me.DGV1.ReadOnly = True
        Me.DGV1.RowHeadersVisible = False
        Me.DGV1.RowTemplate.Height = 35
        Me.DGV1.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect
        Me.DGV1.Size = New System.Drawing.Size(754, 465)
        Me.DGV1.TabIndex = 0
        '
        'GroupBox2
        '
        Me.GroupBox2.Anchor = CType((((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.GroupBox2.Controls.Add(Me.rb_disable)
        Me.GroupBox2.Controls.Add(Me.rb_enable)
        Me.GroupBox2.Controls.Add(Me.Tb_amountperlet)
        Me.GroupBox2.Controls.Add(Me.Label6)
        Me.GroupBox2.Controls.Add(Me.btnClear)
        Me.GroupBox2.Controls.Add(Me.btnUpdate)
        Me.GroupBox2.Controls.Add(Me.btnSave)
        Me.GroupBox2.Controls.Add(Me.Label5)
        Me.GroupBox2.Controls.Add(Me.Label4)
        Me.GroupBox2.Controls.Add(Me.Label3)
        Me.GroupBox2.Controls.Add(Me.Label2)
        Me.GroupBox2.Controls.Add(Me.Label1)
        Me.GroupBox2.Controls.Add(Me.Tb_tareweight)
        Me.GroupBox2.Controls.Add(Me.Tb_netweight)
        Me.GroupBox2.Controls.Add(Me.Tb_pattern)
        Me.GroupBox2.Controls.Add(Me.Tb_productname)
        Me.GroupBox2.Controls.Add(Me.Tb_productcode)
        Me.GroupBox2.Location = New System.Drawing.Point(781, 7)
        Me.GroupBox2.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.GroupBox2.Name = "GroupBox2"
        Me.GroupBox2.Padding = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.GroupBox2.Size = New System.Drawing.Size(413, 505)
        Me.GroupBox2.TabIndex = 1
        Me.GroupBox2.TabStop = False
        '
        'rb_disable
        '
        Me.rb_disable.AutoSize = True
        Me.rb_disable.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.rb_disable.ForeColor = System.Drawing.Color.FromArgb(CType(CType(192, Byte), Integer), CType(CType(0, Byte), Integer), CType(CType(0, Byte), Integer))
        Me.rb_disable.Location = New System.Drawing.Point(215, 364)
        Me.rb_disable.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.rb_disable.Name = "rb_disable"
        Me.rb_disable.Size = New System.Drawing.Size(119, 34)
        Me.rb_disable.TabIndex = 89
        Me.rb_disable.TabStop = True
        Me.rb_disable.Text = "ปิดการใช้งาน"
        Me.rb_disable.UseVisualStyleBackColor = True
        '
        'rb_enable
        '
        Me.rb_enable.AutoSize = True
        Me.rb_enable.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.rb_enable.ForeColor = System.Drawing.Color.DarkGreen
        Me.rb_enable.Location = New System.Drawing.Point(65, 364)
        Me.rb_enable.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.rb_enable.Name = "rb_enable"
        Me.rb_enable.Size = New System.Drawing.Size(124, 34)
        Me.rb_enable.TabIndex = 88
        Me.rb_enable.TabStop = True
        Me.rb_enable.Text = "เปิดการใช้งาน"
        Me.rb_enable.UseVisualStyleBackColor = True
        '
        'Tb_amountperlet
        '
        Me.Tb_amountperlet.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_amountperlet.Location = New System.Drawing.Point(169, 301)
        Me.Tb_amountperlet.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.Tb_amountperlet.Name = "Tb_amountperlet"
        Me.Tb_amountperlet.Size = New System.Drawing.Size(183, 36)
        Me.Tb_amountperlet.TabIndex = 87
        '
        'Label6
        '
        Me.Label6.AutoSize = True
        Me.Label6.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Label6.Location = New System.Drawing.Point(11, 301)
        Me.Label6.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label6.Name = "Label6"
        Me.Label6.Size = New System.Drawing.Size(120, 32)
        Me.Label6.TabIndex = 86
        Me.Label6.Text = "จำนวนต่อเลท:"
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
        Me.btnClear.Location = New System.Drawing.Point(260, 419)
        Me.btnClear.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.btnClear.Name = "btnClear"
        Me.btnClear.Size = New System.Drawing.Size(114, 51)
        Me.btnClear.TabIndex = 85
        Me.btnClear.Text = "เคลียร์"
        Me.btnClear.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnClear.UseVisualStyleBackColor = True
        '
        'btnUpdate
        '
        Me.btnUpdate.BackgroundImage = CType(resources.GetObject("btnUpdate.BackgroundImage"), System.Drawing.Image)
        Me.btnUpdate.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch
        Me.btnUpdate.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnUpdate.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnUpdate.ForeColor = System.Drawing.SystemColors.ControlText
        Me.btnUpdate.Image = CType(resources.GetObject("btnUpdate.Image"), System.Drawing.Image)
        Me.btnUpdate.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.btnUpdate.Location = New System.Drawing.Point(138, 419)
        Me.btnUpdate.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.btnUpdate.Name = "btnUpdate"
        Me.btnUpdate.Size = New System.Drawing.Size(114, 51)
        Me.btnUpdate.TabIndex = 82
        Me.btnUpdate.Text = "แก้ไข"
        Me.btnUpdate.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnUpdate.UseVisualStyleBackColor = True
        '
        'btnSave
        '
        Me.btnSave.BackgroundImage = CType(resources.GetObject("btnSave.BackgroundImage"), System.Drawing.Image)
        Me.btnSave.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch
        Me.btnSave.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.btnSave.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.btnSave.ForeColor = System.Drawing.Color.Blue
        Me.btnSave.Image = CType(resources.GetObject("btnSave.Image"), System.Drawing.Image)
        Me.btnSave.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.btnSave.Location = New System.Drawing.Point(16, 419)
        Me.btnSave.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.btnSave.Name = "btnSave"
        Me.btnSave.Size = New System.Drawing.Size(114, 51)
        Me.btnSave.TabIndex = 5
        Me.btnSave.Text = "บันทึก"
        Me.btnSave.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.btnSave.UseVisualStyleBackColor = True
        '
        'Label5
        '
        Me.Label5.AutoSize = True
        Me.Label5.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Label5.Location = New System.Drawing.Point(11, 249)
        Me.Label5.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label5.Name = "Label5"
        Me.Label5.Size = New System.Drawing.Size(121, 32)
        Me.Label5.TabIndex = 9
        Me.Label5.Text = "น้ำหนักภาชนะ:"
        '
        'Label4
        '
        Me.Label4.AutoSize = True
        Me.Label4.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Label4.Location = New System.Drawing.Point(11, 194)
        Me.Label4.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label4.Name = "Label4"
        Me.Label4.Size = New System.Drawing.Size(100, 32)
        Me.Label4.TabIndex = 8
        Me.Label4.Text = "น้ำหนักผ่าน:"
        '
        'Label3
        '
        Me.Label3.AutoSize = True
        Me.Label3.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Label3.Location = New System.Drawing.Point(11, 139)
        Me.Label3.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label3.Name = "Label3"
        Me.Label3.Size = New System.Drawing.Size(110, 32)
        Me.Label3.TabIndex = 7
        Me.Label3.Text = "รูปแบบล็อต:"
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Label2.Location = New System.Drawing.Point(11, 87)
        Me.Label2.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(110, 32)
        Me.Label2.TabIndex = 6
        Me.Label2.Text = "ชื่อผลิตภัณฑ์:"
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 18.0!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Label1.Location = New System.Drawing.Point(11, 33)
        Me.Label1.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(122, 32)
        Me.Label1.TabIndex = 5
        Me.Label1.Text = "รหัสผลิตภัณฑ์:"
        '
        'Tb_tareweight
        '
        Me.Tb_tareweight.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_tareweight.Location = New System.Drawing.Point(169, 246)
        Me.Tb_tareweight.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.Tb_tareweight.Name = "Tb_tareweight"
        Me.Tb_tareweight.Size = New System.Drawing.Size(183, 36)
        Me.Tb_tareweight.TabIndex = 4
        '
        'Tb_netweight
        '
        Me.Tb_netweight.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_netweight.Location = New System.Drawing.Point(169, 191)
        Me.Tb_netweight.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.Tb_netweight.Name = "Tb_netweight"
        Me.Tb_netweight.Size = New System.Drawing.Size(183, 36)
        Me.Tb_netweight.TabIndex = 3
        '
        'Tb_pattern
        '
        Me.Tb_pattern.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_pattern.Location = New System.Drawing.Point(169, 136)
        Me.Tb_pattern.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.Tb_pattern.Name = "Tb_pattern"
        Me.Tb_pattern.Size = New System.Drawing.Size(183, 36)
        Me.Tb_pattern.TabIndex = 2
        '
        'Tb_productname
        '
        Me.Tb_productname.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_productname.Location = New System.Drawing.Point(169, 84)
        Me.Tb_productname.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.Tb_productname.Name = "Tb_productname"
        Me.Tb_productname.Size = New System.Drawing.Size(183, 36)
        Me.Tb_productname.TabIndex = 1
        '
        'Tb_productcode
        '
        Me.Tb_productcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_productcode.Location = New System.Drawing.Point(169, 30)
        Me.Tb_productcode.Margin = New System.Windows.Forms.Padding(2, 3, 2, 3)
        Me.Tb_productcode.Name = "Tb_productcode"
        Me.Tb_productcode.Size = New System.Drawing.Size(183, 36)
        Me.Tb_productcode.TabIndex = 0
        '
        'Fsetting_products
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 28.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(1205, 523)
        Me.Controls.Add(Me.GroupBox2)
        Me.Controls.Add(Me.GroupBox1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "Fsetting_products"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ตั้งค่าผลิตภัณฑ์"
        Me.GroupBox1.ResumeLayout(False)
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).EndInit()
        Me.GroupBox2.ResumeLayout(False)
        Me.GroupBox2.PerformLayout()
        Me.ResumeLayout(False)

    End Sub

    Friend WithEvents GroupBox1 As GroupBox
    Friend WithEvents DGV1 As DataGridView
    Friend WithEvents GroupBox2 As GroupBox
    Friend WithEvents Label3 As Label
    Friend WithEvents Label2 As Label
    Friend WithEvents Label1 As Label
    Friend WithEvents Tb_tareweight As TextBox
    Friend WithEvents Tb_netweight As TextBox
    Friend WithEvents Tb_productname As TextBox
    Friend WithEvents Tb_productcode As TextBox
    Friend WithEvents Label4 As Label
    Friend WithEvents btnUpdate As Button
    Friend WithEvents btnSave As Button
    Friend WithEvents Label5 As Label
    Friend WithEvents btnClear As Button
    Friend WithEvents Tb_pattern As TextBox
    Friend WithEvents Tb_amountperlet As TextBox
    Friend WithEvents Label6 As Label
    Friend WithEvents rb_disable As RadioButton
    Friend WithEvents rb_enable As RadioButton
End Class

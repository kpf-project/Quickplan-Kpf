<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Flots_select
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Flots_select))
        Me.GroupBox1 = New System.Windows.Forms.GroupBox()
        Me.cmb_product = New System.Windows.Forms.ComboBox()
        Me.GroupBox2 = New System.Windows.Forms.GroupBox()
        Me.DGV1 = New System.Windows.Forms.DataGridView()
        Me.Lb_product = New System.Windows.Forms.Label()
        Me.GroupBox1.SuspendLayout()
        Me.GroupBox2.SuspendLayout()
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).BeginInit()
        Me.SuspendLayout()
        '
        'GroupBox1
        '
        Me.GroupBox1.Controls.Add(Me.cmb_product)
        Me.GroupBox1.Location = New System.Drawing.Point(50, 12)
        Me.GroupBox1.Name = "GroupBox1"
        Me.GroupBox1.Size = New System.Drawing.Size(506, 86)
        Me.GroupBox1.TabIndex = 0
        Me.GroupBox1.TabStop = False
        Me.GroupBox1.Text = "เลือกผลิตภัณฑ์"
        '
        'cmb_product
        '
        Me.cmb_product.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList
        Me.cmb_product.FormattingEnabled = True
        Me.cmb_product.Location = New System.Drawing.Point(81, 35)
        Me.cmb_product.Name = "cmb_product"
        Me.cmb_product.Size = New System.Drawing.Size(349, 38)
        Me.cmb_product.TabIndex = 0
        '
        'GroupBox2
        '
        Me.GroupBox2.Controls.Add(Me.DGV1)
        Me.GroupBox2.Location = New System.Drawing.Point(10, 158)
        Me.GroupBox2.Name = "GroupBox2"
        Me.GroupBox2.Size = New System.Drawing.Size(594, 260)
        Me.GroupBox2.TabIndex = 1
        Me.GroupBox2.TabStop = False
        Me.GroupBox2.Text = "เลือกล็อต"
        '
        'DGV1
        '
        Me.DGV1.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill
        Me.DGV1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize
        Me.DGV1.Location = New System.Drawing.Point(15, 33)
        Me.DGV1.MultiSelect = False
        Me.DGV1.Name = "DGV1"
        Me.DGV1.ReadOnly = True
        Me.DGV1.RowHeadersVisible = False
        Me.DGV1.RowTemplate.Height = 35
        Me.DGV1.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect
        Me.DGV1.Size = New System.Drawing.Size(561, 218)
        Me.DGV1.TabIndex = 0
        '
        'Lb_product
        '
        Me.Lb_product.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle
        Me.Lb_product.Font = New System.Drawing.Font("TH Sarabun New", 22.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Lb_product.Location = New System.Drawing.Point(131, 108)
        Me.Lb_product.Name = "Lb_product"
        Me.Lb_product.Size = New System.Drawing.Size(349, 47)
        Me.Lb_product.TabIndex = 2
        Me.Lb_product.Text = "...."
        Me.Lb_product.TextAlign = System.Drawing.ContentAlignment.TopCenter
        '
        'Flots_select
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(617, 431)
        Me.Controls.Add(Me.Lb_product)
        Me.Controls.Add(Me.GroupBox2)
        Me.Controls.Add(Me.GroupBox1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.MaximizeBox = False
        Me.MinimizeBox = False
        Me.Name = "Flots_select"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "เลือกล็อตเก่า"
        Me.GroupBox1.ResumeLayout(False)
        Me.GroupBox2.ResumeLayout(False)
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).EndInit()
        Me.ResumeLayout(False)

    End Sub

    Friend WithEvents GroupBox1 As GroupBox
    Friend WithEvents cmb_product As ComboBox
    Friend WithEvents GroupBox2 As GroupBox
    Friend WithEvents DGV1 As DataGridView
    Friend WithEvents Lb_product As Label
End Class

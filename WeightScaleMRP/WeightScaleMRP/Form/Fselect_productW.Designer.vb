<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Fselect_productW
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(Fselect_productW))
        Me.Label1 = New System.Windows.Forms.Label()
        Me.DGV1 = New System.Windows.Forms.DataGridView()
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).BeginInit()
        Me.SuspendLayout()
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 22.2!, CType((System.Drawing.FontStyle.Bold Or System.Drawing.FontStyle.Underline), System.Drawing.FontStyle), System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(256, 9)
        Me.Label1.Margin = New System.Windows.Forms.Padding(5, 0, 5, 0)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(150, 40)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "เลือกผลิตภัณฑ์"
        '
        'DGV1
        '
        Me.DGV1.Anchor = CType(((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left), System.Windows.Forms.AnchorStyles)
        Me.DGV1.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill
        Me.DGV1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize
        Me.DGV1.Location = New System.Drawing.Point(14, 67)
        Me.DGV1.Margin = New System.Windows.Forms.Padding(8, 4, 8, 4)
        Me.DGV1.MultiSelect = False
        Me.DGV1.Name = "DGV1"
        Me.DGV1.ReadOnly = True
        Me.DGV1.RowHeadersVisible = False
        Me.DGV1.RowHeadersWidth = 42
        Me.DGV1.RowTemplate.Height = 30
        Me.DGV1.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect
        Me.DGV1.Size = New System.Drawing.Size(725, 561)
        Me.DGV1.TabIndex = 1
        '
        'Fselect_productW
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(753, 646)
        Me.Controls.Add(Me.DGV1)
        Me.Controls.Add(Me.Label1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(5, 9, 5, 9)
        Me.MaximizeBox = False
        Me.MinimizeBox = False
        Me.Name = "Fselect_productW"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "เลือกผลิตภัณฑ์"
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).EndInit()
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Label1 As Label
    Friend WithEvents DGV1 As DataGridView
End Class

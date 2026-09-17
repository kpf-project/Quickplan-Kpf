<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class FReport_FW1
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(FReport_FW1))
        Me.CrystalReportViewer1 = New CrystalDecisions.Windows.Forms.CrystalReportViewer()
        Me.GroupBox1 = New System.Windows.Forms.GroupBox()
        Me.cmb_product = New System.Windows.Forms.ComboBox()
        Me.DTP_2 = New System.Windows.Forms.DateTimePicker()
        Me.Label3 = New System.Windows.Forms.Label()
        Me.BTN_Report = New System.Windows.Forms.Button()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.DTP_1 = New System.Windows.Forms.DateTimePicker()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.GroupBox2 = New System.Windows.Forms.GroupBox()
        Me.GroupBox1.SuspendLayout()
        Me.GroupBox2.SuspendLayout()
        Me.SuspendLayout()
        '
        'CrystalReportViewer1
        '
        Me.CrystalReportViewer1.ActiveViewIndex = -1
        Me.CrystalReportViewer1.Anchor = CType((((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.CrystalReportViewer1.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle
        Me.CrystalReportViewer1.Cursor = System.Windows.Forms.Cursors.Default
        Me.CrystalReportViewer1.Location = New System.Drawing.Point(6, 33)
        Me.CrystalReportViewer1.Name = "CrystalReportViewer1"
        Me.CrystalReportViewer1.ShowCloseButton = False
        Me.CrystalReportViewer1.Size = New System.Drawing.Size(862, 392)
        Me.CrystalReportViewer1.TabIndex = 0
        Me.CrystalReportViewer1.ToolPanelView = CrystalDecisions.Windows.Forms.ToolPanelViewType.None
        '
        'GroupBox1
        '
        Me.GroupBox1.Anchor = CType(((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.GroupBox1.Controls.Add(Me.cmb_product)
        Me.GroupBox1.Controls.Add(Me.DTP_2)
        Me.GroupBox1.Controls.Add(Me.Label3)
        Me.GroupBox1.Controls.Add(Me.BTN_Report)
        Me.GroupBox1.Controls.Add(Me.Label2)
        Me.GroupBox1.Controls.Add(Me.DTP_1)
        Me.GroupBox1.Controls.Add(Me.Label1)
        Me.GroupBox1.Location = New System.Drawing.Point(11, 10)
        Me.GroupBox1.Name = "GroupBox1"
        Me.GroupBox1.Size = New System.Drawing.Size(874, 94)
        Me.GroupBox1.TabIndex = 2
        Me.GroupBox1.TabStop = False
        Me.GroupBox1.Text = "ค้นหา"
        '
        'cmb_product
        '
        Me.cmb_product.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList
        Me.cmb_product.FormattingEnabled = True
        Me.cmb_product.Location = New System.Drawing.Point(530, 32)
        Me.cmb_product.Name = "cmb_product"
        Me.cmb_product.Size = New System.Drawing.Size(178, 36)
        Me.cmb_product.TabIndex = 11
        '
        'DTP_2
        '
        Me.DTP_2.CustomFormat = "dd MMM yyyy"
        Me.DTP_2.Format = System.Windows.Forms.DateTimePickerFormat.Custom
        Me.DTP_2.Location = New System.Drawing.Point(262, 30)
        Me.DTP_2.Name = "DTP_2"
        Me.DTP_2.Size = New System.Drawing.Size(127, 35)
        Me.DTP_2.TabIndex = 3
        '
        'Label3
        '
        Me.Label3.AutoSize = True
        Me.Label3.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label3.Location = New System.Drawing.Point(403, 35)
        Me.Label3.Name = "Label3"
        Me.Label3.Size = New System.Drawing.Size(121, 30)
        Me.Label3.TabIndex = 10
        Me.Label3.Text = "เลือกผลิตภัณฑ์ :"
        '
        'BTN_Report
        '
        Me.BTN_Report.FlatStyle = System.Windows.Forms.FlatStyle.Flat
        Me.BTN_Report.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.BTN_Report.ForeColor = System.Drawing.Color.Blue
        Me.BTN_Report.Image = CType(resources.GetObject("BTN_Report.Image"), System.Drawing.Image)
        Me.BTN_Report.ImageAlign = System.Drawing.ContentAlignment.MiddleLeft
        Me.BTN_Report.Location = New System.Drawing.Point(715, 28)
        Me.BTN_Report.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.BTN_Report.Name = "BTN_Report"
        Me.BTN_Report.Size = New System.Drawing.Size(138, 44)
        Me.BTN_Report.TabIndex = 9
        Me.BTN_Report.Text = "แสดงข้อมูล"
        Me.BTN_Report.TextAlign = System.Drawing.ContentAlignment.MiddleRight
        Me.BTN_Report.UseVisualStyleBackColor = True
        '
        'Label2
        '
        Me.Label2.Anchor = CType(((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.Label2.AutoSize = True
        Me.Label2.Location = New System.Drawing.Point(238, 35)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(17, 28)
        Me.Label2.TabIndex = 4
        Me.Label2.Text = "-"
        '
        'DTP_1
        '
        Me.DTP_1.CustomFormat = "dd MMM yyyy"
        Me.DTP_1.Format = System.Windows.Forms.DateTimePickerFormat.Custom
        Me.DTP_1.Location = New System.Drawing.Point(97, 30)
        Me.DTP_1.Name = "DTP_1"
        Me.DTP_1.Size = New System.Drawing.Size(127, 35)
        Me.DTP_1.TabIndex = 1
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(6, 35)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(85, 30)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "เลือกวันที่ :"
        '
        'GroupBox2
        '
        Me.GroupBox2.Anchor = CType((((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.GroupBox2.Controls.Add(Me.CrystalReportViewer1)
        Me.GroupBox2.Location = New System.Drawing.Point(11, 110)
        Me.GroupBox2.Name = "GroupBox2"
        Me.GroupBox2.Size = New System.Drawing.Size(874, 431)
        Me.GroupBox2.TabIndex = 3
        Me.GroupBox2.TabStop = False
        Me.GroupBox2.Text = "รายงาน"
        '
        'FReport_FW1
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 28.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(896, 551)
        Me.Controls.Add(Me.GroupBox1)
        Me.Controls.Add(Me.GroupBox2)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Margin = New System.Windows.Forms.Padding(4, 6, 4, 6)
        Me.Name = "FReport_FW1"
        Me.Text = "รายงานสรุปชั่งน้ำหนัก"
        Me.GroupBox1.ResumeLayout(False)
        Me.GroupBox1.PerformLayout()
        Me.GroupBox2.ResumeLayout(False)
        Me.ResumeLayout(False)

    End Sub

    Friend WithEvents CrystalReportViewer1 As CrystalDecisions.Windows.Forms.CrystalReportViewer
    Friend WithEvents GroupBox1 As GroupBox
    Friend WithEvents cmb_product As ComboBox
    Friend WithEvents DTP_2 As DateTimePicker
    Friend WithEvents Label3 As Label
    Friend WithEvents BTN_Report As Button
    Friend WithEvents Label2 As Label
    Friend WithEvents DTP_1 As DateTimePicker
    Friend WithEvents Label1 As Label
    Friend WithEvents GroupBox2 As GroupBox
End Class

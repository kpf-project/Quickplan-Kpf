<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()>
Partial Class MainForm
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
        Me.components = New System.ComponentModel.Container()
        Dim DataGridViewCellStyle1 As System.Windows.Forms.DataGridViewCellStyle = New System.Windows.Forms.DataGridViewCellStyle()
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(MainForm))
        Me.Tb_Weight = New System.Windows.Forms.TextBox()
        Me.ButtonConnect = New System.Windows.Forms.Button()
        Me.ButtonDisconnect = New System.Windows.Forms.Button()
        Me.GroupBox1 = New System.Windows.Forms.GroupBox()
        Me.LB_time = New System.Windows.Forms.Label()
        Me.LB_date = New System.Windows.Forms.Label()
        Me.Timer1 = New System.Windows.Forms.Timer(Me.components)
        Me.GroupBox2 = New System.Windows.Forms.GroupBox()
        Me.Tb_wnet = New System.Windows.Forms.TextBox()
        Me.Tb_lotcode = New System.Windows.Forms.TextBox()
        Me.Label4 = New System.Windows.Forms.Label()
        Me.Label2 = New System.Windows.Forms.Label()
        Me.Tb_tareweight = New System.Windows.Forms.TextBox()
        Me.Label3 = New System.Windows.Forms.Label()
        Me.Tb_barcode = New System.Windows.Forms.TextBox()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.GroupBox3 = New System.Windows.Forms.GroupBox()
        Me.DGV1 = New System.Windows.Forms.DataGridView()
        Me.Label5 = New System.Windows.Forms.Label()
        Me.Tb_wpass = New System.Windows.Forms.TextBox()
        Me.StatusStrip1 = New System.Windows.Forms.StatusStrip()
        Me.Tssl_iploadcell = New System.Windows.Forms.ToolStripStatusLabel()
        Me.Tssl_portloadcell = New System.Windows.Forms.ToolStripStatusLabel()
        Me.Tssl_status = New System.Windows.Forms.ToolStripStatusLabel()
        Me.Label6 = New System.Windows.Forms.Label()
        Me.Tb_amountlet = New System.Windows.Forms.TextBox()
        Me.LB_Product = New System.Windows.Forms.Label()
        Me.lb_wstatus = New System.Windows.Forms.Label()
        Me.Label7 = New System.Windows.Forms.Label()
        Me.Timer2 = New System.Windows.Forms.Timer(Me.components)
        Me.Label8 = New System.Windows.Forms.Label()
        Me.Label9 = New System.Windows.Forms.Label()
        Me.Label10 = New System.Windows.Forms.Label()
        Me.GroupBox1.SuspendLayout()
        Me.GroupBox2.SuspendLayout()
        Me.GroupBox3.SuspendLayout()
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).BeginInit()
        Me.StatusStrip1.SuspendLayout()
        Me.SuspendLayout()
        '
        'Tb_Weight
        '
        Me.Tb_Weight.BackColor = System.Drawing.Color.Black
        Me.Tb_Weight.Font = New System.Drawing.Font("Microsoft Sans Serif", 60.0!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_Weight.ForeColor = System.Drawing.Color.Lime
        Me.Tb_Weight.Location = New System.Drawing.Point(139, 313)
        Me.Tb_Weight.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Tb_Weight.Name = "Tb_Weight"
        Me.Tb_Weight.Size = New System.Drawing.Size(433, 98)
        Me.Tb_Weight.TabIndex = 0
        Me.Tb_Weight.Text = "0.00"
        Me.Tb_Weight.TextAlign = System.Windows.Forms.HorizontalAlignment.Center
        '
        'ButtonConnect
        '
        Me.ButtonConnect.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.ButtonConnect.Location = New System.Drawing.Point(477, 748)
        Me.ButtonConnect.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.ButtonConnect.Name = "ButtonConnect"
        Me.ButtonConnect.Size = New System.Drawing.Size(114, 42)
        Me.ButtonConnect.TabIndex = 1
        Me.ButtonConnect.Text = "Connect"
        Me.ButtonConnect.UseVisualStyleBackColor = True
        '
        'ButtonDisconnect
        '
        Me.ButtonDisconnect.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.ButtonDisconnect.Location = New System.Drawing.Point(613, 749)
        Me.ButtonDisconnect.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.ButtonDisconnect.Name = "ButtonDisconnect"
        Me.ButtonDisconnect.Size = New System.Drawing.Size(114, 41)
        Me.ButtonDisconnect.TabIndex = 2
        Me.ButtonDisconnect.Text = "Disconnect"
        Me.ButtonDisconnect.UseVisualStyleBackColor = True
        '
        'GroupBox1
        '
        Me.GroupBox1.Controls.Add(Me.LB_time)
        Me.GroupBox1.Controls.Add(Me.LB_date)
        Me.GroupBox1.Location = New System.Drawing.Point(364, 4)
        Me.GroupBox1.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.GroupBox1.Name = "GroupBox1"
        Me.GroupBox1.Padding = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.GroupBox1.Size = New System.Drawing.Size(314, 131)
        Me.GroupBox1.TabIndex = 7
        Me.GroupBox1.TabStop = False
        '
        'LB_time
        '
        Me.LB_time.AutoSize = True
        Me.LB_time.Location = New System.Drawing.Point(9, 83)
        Me.LB_time.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.LB_time.Name = "LB_time"
        Me.LB_time.Size = New System.Drawing.Size(21, 30)
        Me.LB_time.TabIndex = 8
        Me.LB_time.Text = ".."
        '
        'LB_date
        '
        Me.LB_date.AutoSize = True
        Me.LB_date.Location = New System.Drawing.Point(9, 36)
        Me.LB_date.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.LB_date.Name = "LB_date"
        Me.LB_date.Size = New System.Drawing.Size(21, 30)
        Me.LB_date.TabIndex = 7
        Me.LB_date.Text = ".."
        '
        'Timer1
        '
        '
        'GroupBox2
        '
        Me.GroupBox2.Controls.Add(Me.Tb_wnet)
        Me.GroupBox2.Controls.Add(Me.Tb_lotcode)
        Me.GroupBox2.Controls.Add(Me.Label4)
        Me.GroupBox2.Controls.Add(Me.Label2)
        Me.GroupBox2.Controls.Add(Me.Tb_tareweight)
        Me.GroupBox2.Controls.Add(Me.Label3)
        Me.GroupBox2.Controls.Add(Me.Tb_barcode)
        Me.GroupBox2.Controls.Add(Me.Label1)
        Me.GroupBox2.Location = New System.Drawing.Point(40, 4)
        Me.GroupBox2.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.GroupBox2.Name = "GroupBox2"
        Me.GroupBox2.Padding = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.GroupBox2.Size = New System.Drawing.Size(320, 242)
        Me.GroupBox2.TabIndex = 8
        Me.GroupBox2.TabStop = False
        '
        'Tb_wnet
        '
        Me.Tb_wnet.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_wnet.Location = New System.Drawing.Point(116, 186)
        Me.Tb_wnet.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_wnet.Name = "Tb_wnet"
        Me.Tb_wnet.ReadOnly = True
        Me.Tb_wnet.Size = New System.Drawing.Size(127, 36)
        Me.Tb_wnet.TabIndex = 7
        '
        'Tb_lotcode
        '
        Me.Tb_lotcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_lotcode.Location = New System.Drawing.Point(116, 84)
        Me.Tb_lotcode.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_lotcode.Name = "Tb_lotcode"
        Me.Tb_lotcode.ReadOnly = True
        Me.Tb_lotcode.Size = New System.Drawing.Size(179, 36)
        Me.Tb_lotcode.TabIndex = 3
        '
        'Label4
        '
        Me.Label4.AutoSize = True
        Me.Label4.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label4.Location = New System.Drawing.Point(6, 189)
        Me.Label4.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label4.Name = "Label4"
        Me.Label4.Size = New System.Drawing.Size(92, 30)
        Me.Label4.TabIndex = 6
        Me.Label4.Text = "น้ำหนักสูตร:"
        '
        'Label2
        '
        Me.Label2.AutoSize = True
        Me.Label2.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label2.Location = New System.Drawing.Point(5, 83)
        Me.Label2.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label2.Name = "Label2"
        Me.Label2.Size = New System.Drawing.Size(76, 30)
        Me.Label2.TabIndex = 2
        Me.Label2.Text = "Lotcode:"
        '
        'Tb_tareweight
        '
        Me.Tb_tareweight.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_tareweight.Location = New System.Drawing.Point(116, 135)
        Me.Tb_tareweight.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_tareweight.Name = "Tb_tareweight"
        Me.Tb_tareweight.ReadOnly = True
        Me.Tb_tareweight.Size = New System.Drawing.Size(127, 36)
        Me.Tb_tareweight.TabIndex = 4
        '
        'Label3
        '
        Me.Label3.AutoSize = True
        Me.Label3.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label3.Location = New System.Drawing.Point(5, 135)
        Me.Label3.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label3.Name = "Label3"
        Me.Label3.Size = New System.Drawing.Size(80, 30)
        Me.Label3.TabIndex = 5
        Me.Label3.Text = "น้ำหนักถุง:"
        '
        'Tb_barcode
        '
        Me.Tb_barcode.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_barcode.Location = New System.Drawing.Point(116, 33)
        Me.Tb_barcode.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_barcode.Name = "Tb_barcode"
        Me.Tb_barcode.ReadOnly = True
        Me.Tb_barcode.Size = New System.Drawing.Size(179, 36)
        Me.Tb_barcode.TabIndex = 1
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label1.Location = New System.Drawing.Point(5, 36)
        Me.Label1.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(90, 30)
        Me.Label1.TabIndex = 0
        Me.Label1.Text = "BarcodeID:"
        '
        'GroupBox3
        '
        Me.GroupBox3.Controls.Add(Me.DGV1)
        Me.GroupBox3.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.GroupBox3.Location = New System.Drawing.Point(11, 422)
        Me.GroupBox3.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.GroupBox3.Name = "GroupBox3"
        Me.GroupBox3.Padding = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.GroupBox3.Size = New System.Drawing.Size(716, 322)
        Me.GroupBox3.TabIndex = 103
        Me.GroupBox3.TabStop = False
        Me.GroupBox3.Text = "รายการชั่งน้ำหนัก"
        '
        'DGV1
        '
        Me.DGV1.Anchor = CType((((System.Windows.Forms.AnchorStyles.Top Or System.Windows.Forms.AnchorStyles.Bottom) _
            Or System.Windows.Forms.AnchorStyles.Left) _
            Or System.Windows.Forms.AnchorStyles.Right), System.Windows.Forms.AnchorStyles)
        Me.DGV1.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill
        Me.DGV1.AutoSizeRowsMode = System.Windows.Forms.DataGridViewAutoSizeRowsMode.DisplayedCells
        DataGridViewCellStyle1.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter
        DataGridViewCellStyle1.BackColor = System.Drawing.SystemColors.Control
        DataGridViewCellStyle1.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        DataGridViewCellStyle1.ForeColor = System.Drawing.SystemColors.WindowText
        DataGridViewCellStyle1.SelectionBackColor = System.Drawing.SystemColors.Highlight
        DataGridViewCellStyle1.SelectionForeColor = System.Drawing.SystemColors.HighlightText
        DataGridViewCellStyle1.WrapMode = System.Windows.Forms.DataGridViewTriState.[True]
        Me.DGV1.ColumnHeadersDefaultCellStyle = DataGridViewCellStyle1
        Me.DGV1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize
        Me.DGV1.Location = New System.Drawing.Point(8, 40)
        Me.DGV1.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.DGV1.MultiSelect = False
        Me.DGV1.Name = "DGV1"
        Me.DGV1.ReadOnly = True
        Me.DGV1.RowHeadersVisible = False
        Me.DGV1.RowTemplate.Height = 35
        Me.DGV1.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect
        Me.DGV1.Size = New System.Drawing.Size(696, 274)
        Me.DGV1.TabIndex = 0
        '
        'Label5
        '
        Me.Label5.AutoSize = True
        Me.Label5.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label5.Location = New System.Drawing.Point(539, 142)
        Me.Label5.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label5.Name = "Label5"
        Me.Label5.Size = New System.Drawing.Size(122, 30)
        Me.Label5.TabIndex = 104
        Me.Label5.Text = "น้ำหนักที่ต้องการ"
        '
        'Tb_wpass
        '
        Me.Tb_wpass.BackColor = System.Drawing.Color.FromArgb(CType(CType(192, Byte), Integer), CType(CType(255, Byte), Integer), CType(CType(255, Byte), Integer))
        Me.Tb_wpass.Font = New System.Drawing.Font("TH Sarabun New", 28.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_wpass.ForeColor = System.Drawing.Color.Red
        Me.Tb_wpass.Location = New System.Drawing.Point(528, 176)
        Me.Tb_wpass.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_wpass.Name = "Tb_wpass"
        Me.Tb_wpass.ReadOnly = True
        Me.Tb_wpass.Size = New System.Drawing.Size(150, 58)
        Me.Tb_wpass.TabIndex = 105
        Me.Tb_wpass.TextAlign = System.Windows.Forms.HorizontalAlignment.Center
        '
        'StatusStrip1
        '
        Me.StatusStrip1.ImageScalingSize = New System.Drawing.Size(20, 20)
        Me.StatusStrip1.Items.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tssl_iploadcell, Me.Tssl_portloadcell, Me.Tssl_status})
        Me.StatusStrip1.Location = New System.Drawing.Point(0, 799)
        Me.StatusStrip1.Name = "StatusStrip1"
        Me.StatusStrip1.Padding = New System.Windows.Forms.Padding(1, 0, 9, 0)
        Me.StatusStrip1.Size = New System.Drawing.Size(738, 31)
        Me.StatusStrip1.TabIndex = 106
        Me.StatusStrip1.Text = "StatusStrip1"
        '
        'Tssl_iploadcell
        '
        Me.Tssl_iploadcell.Font = New System.Drawing.Font("TH Sarabun New", 13.8!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tssl_iploadcell.Name = "Tssl_iploadcell"
        Me.Tssl_iploadcell.Size = New System.Drawing.Size(19, 26)
        Me.Tssl_iploadcell.Text = "0"
        '
        'Tssl_portloadcell
        '
        Me.Tssl_portloadcell.Font = New System.Drawing.Font("TH Sarabun New", 13.8!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tssl_portloadcell.Name = "Tssl_portloadcell"
        Me.Tssl_portloadcell.Size = New System.Drawing.Size(19, 26)
        Me.Tssl_portloadcell.Text = "0"
        '
        'Tssl_status
        '
        Me.Tssl_status.Font = New System.Drawing.Font("TH Sarabun New", 13.8!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tssl_status.Name = "Tssl_status"
        Me.Tssl_status.Size = New System.Drawing.Size(19, 26)
        Me.Tssl_status.Text = "0"
        '
        'Label6
        '
        Me.Label6.AutoSize = True
        Me.Label6.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label6.Location = New System.Drawing.Point(384, 142)
        Me.Label6.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label6.Name = "Label6"
        Me.Label6.Size = New System.Drawing.Size(104, 30)
        Me.Label6.TabIndex = 107
        Me.Label6.Text = "จำนวนต่อเลท"
        '
        'Tb_amountlet
        '
        Me.Tb_amountlet.BackColor = System.Drawing.Color.FromArgb(CType(CType(255, Byte), Integer), CType(CType(255, Byte), Integer), CType(CType(192, Byte), Integer))
        Me.Tb_amountlet.Font = New System.Drawing.Font("TH Sarabun New", 28.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Tb_amountlet.ForeColor = System.Drawing.Color.Black
        Me.Tb_amountlet.Location = New System.Drawing.Point(378, 176)
        Me.Tb_amountlet.Margin = New System.Windows.Forms.Padding(2, 4, 2, 4)
        Me.Tb_amountlet.Name = "Tb_amountlet"
        Me.Tb_amountlet.Size = New System.Drawing.Size(125, 58)
        Me.Tb_amountlet.TabIndex = 108
        Me.Tb_amountlet.TextAlign = System.Windows.Forms.HorizontalAlignment.Center
        '
        'LB_Product
        '
        Me.LB_Product.BorderStyle = System.Windows.Forms.BorderStyle.Fixed3D
        Me.LB_Product.Font = New System.Drawing.Font("TH Sarabun New", 27.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.LB_Product.Location = New System.Drawing.Point(40, 250)
        Me.LB_Product.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.LB_Product.Name = "LB_Product"
        Me.LB_Product.Size = New System.Drawing.Size(638, 56)
        Me.LB_Product.TabIndex = 109
        Me.LB_Product.Text = "เลือกผลิตภัณฑ์"
        Me.LB_Product.TextAlign = System.Drawing.ContentAlignment.MiddleCenter
        '
        'lb_wstatus
        '
        Me.lb_wstatus.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle
        Me.lb_wstatus.Font = New System.Drawing.Font("Angsana New", 22.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.lb_wstatus.ForeColor = System.Drawing.SystemColors.ControlText
        Me.lb_wstatus.Location = New System.Drawing.Point(598, 342)
        Me.lb_wstatus.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.lb_wstatus.Name = "lb_wstatus"
        Me.lb_wstatus.Size = New System.Drawing.Size(80, 52)
        Me.lb_wstatus.TabIndex = 110
        Me.lb_wstatus.Text = "...."
        Me.lb_wstatus.TextAlign = System.Drawing.ContentAlignment.TopCenter
        '
        'Label7
        '
        Me.Label7.AutoSize = True
        Me.Label7.Font = New System.Drawing.Font("TH Sarabun New", 22.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label7.Location = New System.Drawing.Point(33, 346)
        Me.Label7.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label7.Name = "Label7"
        Me.Label7.Size = New System.Drawing.Size(88, 40)
        Me.Label7.TabIndex = 111
        Me.Label7.Text = "น้ำหนัก:"
        '
        'Timer2
        '
        '
        'Label8
        '
        Me.Label8.AutoSize = True
        Me.Label8.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Label8.Location = New System.Drawing.Point(200, 754)
        Me.Label8.Margin = New System.Windows.Forms.Padding(2, 0, 2, 0)
        Me.Label8.Name = "Label8"
        Me.Label8.Size = New System.Drawing.Size(171, 30)
        Me.Label8.TabIndex = 112
        Me.Label8.Text = "*กด F1 เพื่อบันทึกข้อมูล"
        Me.Label8.Visible = False
        '
        'Label9
        '
        Me.Label9.AutoSize = True
        Me.Label9.Location = New System.Drawing.Point(14, 754)
        Me.Label9.Name = "Label9"
        Me.Label9.Size = New System.Drawing.Size(59, 30)
        Me.Label9.TabIndex = 113
        Me.Label9.Text = "Label9"
        Me.Label9.Visible = False
        '
        'Label10
        '
        Me.Label10.AutoSize = True
        Me.Label10.Location = New System.Drawing.Point(98, 754)
        Me.Label10.Name = "Label10"
        Me.Label10.Size = New System.Drawing.Size(67, 30)
        Me.Label10.TabIndex = 114
        Me.Label10.Text = "Label10"
        Me.Label10.Visible = False
        '
        'MainForm
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(738, 830)
        Me.Controls.Add(Me.Label10)
        Me.Controls.Add(Me.Label9)
        Me.Controls.Add(Me.Label8)
        Me.Controls.Add(Me.Label7)
        Me.Controls.Add(Me.lb_wstatus)
        Me.Controls.Add(Me.LB_Product)
        Me.Controls.Add(Me.Tb_amountlet)
        Me.Controls.Add(Me.Label6)
        Me.Controls.Add(Me.StatusStrip1)
        Me.Controls.Add(Me.Tb_wpass)
        Me.Controls.Add(Me.Label5)
        Me.Controls.Add(Me.GroupBox3)
        Me.Controls.Add(Me.GroupBox2)
        Me.Controls.Add(Me.GroupBox1)
        Me.Controls.Add(Me.ButtonDisconnect)
        Me.Controls.Add(Me.ButtonConnect)
        Me.Controls.Add(Me.Tb_Weight)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "MainForm"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "ชั่งน้ำหนัก"
        Me.GroupBox1.ResumeLayout(False)
        Me.GroupBox1.PerformLayout()
        Me.GroupBox2.ResumeLayout(False)
        Me.GroupBox2.PerformLayout()
        Me.GroupBox3.ResumeLayout(False)
        CType(Me.DGV1, System.ComponentModel.ISupportInitialize).EndInit()
        Me.StatusStrip1.ResumeLayout(False)
        Me.StatusStrip1.PerformLayout()
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents Tb_Weight As TextBox
    Friend WithEvents ButtonConnect As Button
    Friend WithEvents ButtonDisconnect As Button
    Friend WithEvents GroupBox1 As GroupBox
    Friend WithEvents LB_time As Label
    Friend WithEvents LB_date As Label
    Friend WithEvents Timer1 As Timer
    Friend WithEvents GroupBox2 As GroupBox
    Friend WithEvents Tb_barcode As TextBox
    Friend WithEvents Label1 As Label
    Friend WithEvents Tb_lotcode As TextBox
    Friend WithEvents Label2 As Label
    Friend WithEvents GroupBox3 As GroupBox
    Friend WithEvents Tb_wnet As TextBox
    Friend WithEvents Label4 As Label
    Friend WithEvents Label3 As Label
    Friend WithEvents Tb_tareweight As TextBox
    Friend WithEvents Label5 As Label
    Friend WithEvents Tb_wpass As TextBox
    Friend WithEvents StatusStrip1 As StatusStrip
    Friend WithEvents Tssl_iploadcell As ToolStripStatusLabel
    Friend WithEvents Tssl_portloadcell As ToolStripStatusLabel
    Friend WithEvents Tssl_status As ToolStripStatusLabel
    Friend WithEvents Label6 As Label
    Friend WithEvents Tb_amountlet As TextBox
    Friend WithEvents DGV1 As DataGridView
    Friend WithEvents LB_Product As Label
    Friend WithEvents lb_wstatus As Label
    Friend WithEvents Label7 As Label
    Friend WithEvents Timer2 As Timer
    Friend WithEvents Label8 As Label
    Friend WithEvents Label9 As Label
    Friend WithEvents Label10 As Label
End Class

<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()>
Partial Class FMain
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
        Dim resources As System.ComponentModel.ComponentResourceManager = New System.ComponentModel.ComponentResourceManager(GetType(FMain))
        Me.MenuStrip1 = New System.Windows.Forms.MenuStrip()
        Me.Tsm_setting = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_setting_pro = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_setting_machine = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_setting_SQL = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_setting_printer = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_lots = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Newlots = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Oldlot = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_weight = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_weight1 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Cancel = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Return = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_stockout_m = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_stockout = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Cancel_SO = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_FG = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_FG1 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_FG2 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_SO = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_SO1 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_SO2 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_Sum = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_prison = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_out_prison = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Cancel_prison = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Cancel_prison2 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_Cancel_prison1 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_in = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_in1 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_in2 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_out = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_out1 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_out2 = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_sum = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_lot = New System.Windows.Forms.ToolStripMenuItem()
        Me.Tsm_report_prison_totalsum = New System.Windows.Forms.ToolStripMenuItem()
        Me.StatusStrip1 = New System.Windows.Forms.StatusStrip()
        Me.Tssl_username = New System.Windows.Forms.ToolStripStatusLabel()
        Me.MenuStrip1.SuspendLayout()
        Me.StatusStrip1.SuspendLayout()
        Me.SuspendLayout()
        '
        'MenuStrip1
        '
        Me.MenuStrip1.BackColor = System.Drawing.Color.White
        Me.MenuStrip1.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.MenuStrip1.ImageScalingSize = New System.Drawing.Size(20, 20)
        Me.MenuStrip1.Items.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_setting, Me.Tsm_lots, Me.Tsm_weight, Me.Tsm_stockout_m, Me.Tsm_report, Me.Tsm_prison})
        Me.MenuStrip1.Location = New System.Drawing.Point(0, 0)
        Me.MenuStrip1.Name = "MenuStrip1"
        Me.MenuStrip1.Padding = New System.Windows.Forms.Padding(8, 4, 0, 4)
        Me.MenuStrip1.Size = New System.Drawing.Size(1003, 60)
        Me.MenuStrip1.TabIndex = 0
        Me.MenuStrip1.Text = "MenuStrip1"
        '
        'Tsm_setting
        '
        Me.Tsm_setting.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_setting_pro, Me.Tsm_setting_machine, Me.Tsm_setting_SQL, Me.Tsm_setting_printer})
        Me.Tsm_setting.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tsm_setting.Image = CType(resources.GetObject("Tsm_setting.Image"), System.Drawing.Image)
        Me.Tsm_setting.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_setting.Name = "Tsm_setting"
        Me.Tsm_setting.Size = New System.Drawing.Size(103, 52)
        Me.Tsm_setting.Text = "ตั้งค่า"
        '
        'Tsm_setting_pro
        '
        Me.Tsm_setting_pro.Image = CType(resources.GetObject("Tsm_setting_pro.Image"), System.Drawing.Image)
        Me.Tsm_setting_pro.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_setting_pro.Name = "Tsm_setting_pro"
        Me.Tsm_setting_pro.Size = New System.Drawing.Size(268, 52)
        Me.Tsm_setting_pro.Text = "ข้อมูลสูตรผลิตภัณฑ์"
        '
        'Tsm_setting_machine
        '
        Me.Tsm_setting_machine.Image = CType(resources.GetObject("Tsm_setting_machine.Image"), System.Drawing.Image)
        Me.Tsm_setting_machine.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_setting_machine.Name = "Tsm_setting_machine"
        Me.Tsm_setting_machine.Size = New System.Drawing.Size(268, 52)
        Me.Tsm_setting_machine.Text = "ตั้งค่าเครื่องชั่งน้ำหนัก"
        '
        'Tsm_setting_SQL
        '
        Me.Tsm_setting_SQL.Image = CType(resources.GetObject("Tsm_setting_SQL.Image"), System.Drawing.Image)
        Me.Tsm_setting_SQL.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_setting_SQL.Name = "Tsm_setting_SQL"
        Me.Tsm_setting_SQL.Size = New System.Drawing.Size(268, 52)
        Me.Tsm_setting_SQL.Text = "ตั้งค่าฐานข้อมูล SQL"
        '
        'Tsm_setting_printer
        '
        Me.Tsm_setting_printer.Image = CType(resources.GetObject("Tsm_setting_printer.Image"), System.Drawing.Image)
        Me.Tsm_setting_printer.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_setting_printer.Name = "Tsm_setting_printer"
        Me.Tsm_setting_printer.Size = New System.Drawing.Size(268, 52)
        Me.Tsm_setting_printer.Text = "ตั้งค่าเครื่องปริ้นบาร์โค้ด"
        '
        'Tsm_lots
        '
        Me.Tsm_lots.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_Newlots, Me.Tsm_Oldlot})
        Me.Tsm_lots.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tsm_lots.Image = CType(resources.GetObject("Tsm_lots.Image"), System.Drawing.Image)
        Me.Tsm_lots.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_lots.Name = "Tsm_lots"
        Me.Tsm_lots.Size = New System.Drawing.Size(159, 52)
        Me.Tsm_lots.Text = "ล็อตผลิตภัณฑ์"
        '
        'Tsm_Newlots
        '
        Me.Tsm_Newlots.Image = CType(resources.GetObject("Tsm_Newlots.Image"), System.Drawing.Image)
        Me.Tsm_Newlots.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Newlots.Name = "Tsm_Newlots"
        Me.Tsm_Newlots.Size = New System.Drawing.Size(199, 52)
        Me.Tsm_Newlots.Text = "สร้างล็อตใหม่"
        '
        'Tsm_Oldlot
        '
        Me.Tsm_Oldlot.Image = CType(resources.GetObject("Tsm_Oldlot.Image"), System.Drawing.Image)
        Me.Tsm_Oldlot.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Oldlot.Name = "Tsm_Oldlot"
        Me.Tsm_Oldlot.Size = New System.Drawing.Size(199, 52)
        Me.Tsm_Oldlot.Text = "เลือกล็อตเก่า"
        '
        'Tsm_weight
        '
        Me.Tsm_weight.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_weight1, Me.Tsm_Cancel, Me.Tsm_Return})
        Me.Tsm_weight.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tsm_weight.Image = CType(resources.GetObject("Tsm_weight.Image"), System.Drawing.Image)
        Me.Tsm_weight.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_weight.Name = "Tsm_weight"
        Me.Tsm_weight.Size = New System.Drawing.Size(133, 52)
        Me.Tsm_weight.Text = "ชั่งน้ำหนัก"
        '
        'Tsm_weight1
        '
        Me.Tsm_weight1.Image = CType(resources.GetObject("Tsm_weight1.Image"), System.Drawing.Image)
        Me.Tsm_weight1.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_weight1.Name = "Tsm_weight1"
        Me.Tsm_weight1.Size = New System.Drawing.Size(177, 52)
        Me.Tsm_weight1.Text = "ชั่งน้ำหนัก"
        '
        'Tsm_Cancel
        '
        Me.Tsm_Cancel.Image = CType(resources.GetObject("Tsm_Cancel.Image"), System.Drawing.Image)
        Me.Tsm_Cancel.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Cancel.Name = "Tsm_Cancel"
        Me.Tsm_Cancel.Size = New System.Drawing.Size(177, 52)
        Me.Tsm_Cancel.Text = "ยกเลิกชั่ง"
        '
        'Tsm_Return
        '
        Me.Tsm_Return.Image = CType(resources.GetObject("Tsm_Return.Image"), System.Drawing.Image)
        Me.Tsm_Return.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Return.Name = "Tsm_Return"
        Me.Tsm_Return.Size = New System.Drawing.Size(177, 52)
        Me.Tsm_Return.Text = "ชั่งคืน"
        '
        'Tsm_stockout_m
        '
        Me.Tsm_stockout_m.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_stockout, Me.Tsm_Cancel_SO})
        Me.Tsm_stockout_m.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tsm_stockout_m.Image = CType(resources.GetObject("Tsm_stockout_m.Image"), System.Drawing.Image)
        Me.Tsm_stockout_m.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_stockout_m.Name = "Tsm_stockout_m"
        Me.Tsm_stockout_m.Size = New System.Drawing.Size(156, 52)
        Me.Tsm_stockout_m.Text = "เบิกผลิตภัณฑ์"
        '
        'Tsm_stockout
        '
        Me.Tsm_stockout.Image = CType(resources.GetObject("Tsm_stockout.Image"), System.Drawing.Image)
        Me.Tsm_stockout.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_stockout.Name = "Tsm_stockout"
        Me.Tsm_stockout.Size = New System.Drawing.Size(179, 52)
        Me.Tsm_stockout.Text = "สแกนเบิก"
        '
        'Tsm_Cancel_SO
        '
        Me.Tsm_Cancel_SO.Image = CType(resources.GetObject("Tsm_Cancel_SO.Image"), System.Drawing.Image)
        Me.Tsm_Cancel_SO.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Cancel_SO.Name = "Tsm_Cancel_SO"
        Me.Tsm_Cancel_SO.Size = New System.Drawing.Size(179, 52)
        Me.Tsm_Cancel_SO.Text = "ยกเลิกเบิก"
        '
        'Tsm_report
        '
        Me.Tsm_report.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_report_FG, Me.Tsm_report_SO, Me.Tsm_report_Sum})
        Me.Tsm_report.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tsm_report.Image = CType(resources.GetObject("Tsm_report.Image"), System.Drawing.Image)
        Me.Tsm_report.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report.Name = "Tsm_report"
        Me.Tsm_report.Size = New System.Drawing.Size(119, 52)
        Me.Tsm_report.Text = "รายงาน"
        '
        'Tsm_report_FG
        '
        Me.Tsm_report_FG.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_report_FG1, Me.Tsm_report_FG2})
        Me.Tsm_report_FG.Image = CType(resources.GetObject("Tsm_report_FG.Image"), System.Drawing.Image)
        Me.Tsm_report_FG.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_FG.Name = "Tsm_report_FG"
        Me.Tsm_report_FG.Size = New System.Drawing.Size(242, 52)
        Me.Tsm_report_FG.Text = "รายงานชั่ง"
        '
        'Tsm_report_FG1
        '
        Me.Tsm_report_FG1.Image = CType(resources.GetObject("Tsm_report_FG1.Image"), System.Drawing.Image)
        Me.Tsm_report_FG1.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_FG1.Name = "Tsm_report_FG1"
        Me.Tsm_report_FG1.Size = New System.Drawing.Size(274, 54)
        Me.Tsm_report_FG1.Text = "รายงานสรุปชั่ง"
        '
        'Tsm_report_FG2
        '
        Me.Tsm_report_FG2.Image = CType(resources.GetObject("Tsm_report_FG2.Image"), System.Drawing.Image)
        Me.Tsm_report_FG2.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_FG2.Name = "Tsm_report_FG2"
        Me.Tsm_report_FG2.Size = New System.Drawing.Size(274, 54)
        Me.Tsm_report_FG2.Text = "รายงานสรุปชั่ง (ละเอียด)"
        '
        'Tsm_report_SO
        '
        Me.Tsm_report_SO.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_report_SO1, Me.Tsm_report_SO2})
        Me.Tsm_report_SO.Image = CType(resources.GetObject("Tsm_report_SO.Image"), System.Drawing.Image)
        Me.Tsm_report_SO.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_SO.Name = "Tsm_report_SO"
        Me.Tsm_report_SO.Size = New System.Drawing.Size(242, 52)
        Me.Tsm_report_SO.Text = "รายงานเบิก"
        '
        'Tsm_report_SO1
        '
        Me.Tsm_report_SO1.Image = CType(resources.GetObject("Tsm_report_SO1.Image"), System.Drawing.Image)
        Me.Tsm_report_SO1.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_SO1.Name = "Tsm_report_SO1"
        Me.Tsm_report_SO1.Size = New System.Drawing.Size(281, 54)
        Me.Tsm_report_SO1.Text = "รายงานสรุปเบิก"
        '
        'Tsm_report_SO2
        '
        Me.Tsm_report_SO2.Image = CType(resources.GetObject("Tsm_report_SO2.Image"), System.Drawing.Image)
        Me.Tsm_report_SO2.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_SO2.Name = "Tsm_report_SO2"
        Me.Tsm_report_SO2.Size = New System.Drawing.Size(281, 54)
        Me.Tsm_report_SO2.Text = "รายงานสรุปเบิก (ละเอียด)"
        '
        'Tsm_report_Sum
        '
        Me.Tsm_report_Sum.Image = CType(resources.GetObject("Tsm_report_Sum.Image"), System.Drawing.Image)
        Me.Tsm_report_Sum.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_Sum.Name = "Tsm_report_Sum"
        Me.Tsm_report_Sum.Size = New System.Drawing.Size(242, 52)
        Me.Tsm_report_Sum.Text = "รายงานสรุป ชั่ง-เบิก"
        '
        'Tsm_prison
        '
        Me.Tsm_prison.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_out_prison, Me.Tsm_Cancel_prison, Me.Tsm_report_prison_in, Me.Tsm_report_prison_out, Me.Tsm_report_prison_sum})
        Me.Tsm_prison.Font = New System.Drawing.Font("TH Sarabun New", 15.75!, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tsm_prison.Image = CType(resources.GetObject("Tsm_prison.Image"), System.Drawing.Image)
        Me.Tsm_prison.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_prison.Name = "Tsm_prison"
        Me.Tsm_prison.Size = New System.Drawing.Size(121, 52)
        Me.Tsm_prison.Text = "เรือนจำ"
        '
        'Tsm_out_prison
        '
        Me.Tsm_out_prison.Image = CType(resources.GetObject("Tsm_out_prison.Image"), System.Drawing.Image)
        Me.Tsm_out_prison.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_out_prison.Name = "Tsm_out_prison"
        Me.Tsm_out_prison.Size = New System.Drawing.Size(215, 54)
        Me.Tsm_out_prison.Text = "สแกนเบิก"
        '
        'Tsm_Cancel_prison
        '
        Me.Tsm_Cancel_prison.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_Cancel_prison2, Me.Tsm_Cancel_prison1})
        Me.Tsm_Cancel_prison.Image = CType(resources.GetObject("Tsm_Cancel_prison.Image"), System.Drawing.Image)
        Me.Tsm_Cancel_prison.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Cancel_prison.Name = "Tsm_Cancel_prison"
        Me.Tsm_Cancel_prison.Size = New System.Drawing.Size(215, 54)
        Me.Tsm_Cancel_prison.Text = "ยกเลิกเบิก"
        '
        'Tsm_Cancel_prison2
        '
        Me.Tsm_Cancel_prison2.Image = CType(resources.GetObject("Tsm_Cancel_prison2.Image"), System.Drawing.Image)
        Me.Tsm_Cancel_prison2.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Cancel_prison2.Name = "Tsm_Cancel_prison2"
        Me.Tsm_Cancel_prison2.Size = New System.Drawing.Size(179, 52)
        Me.Tsm_Cancel_prison2.Text = "ยกเลิกเบิก"
        '
        'Tsm_Cancel_prison1
        '
        Me.Tsm_Cancel_prison1.Image = CType(resources.GetObject("Tsm_Cancel_prison1.Image"), System.Drawing.Image)
        Me.Tsm_Cancel_prison1.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_Cancel_prison1.Name = "Tsm_Cancel_prison1"
        Me.Tsm_Cancel_prison1.Size = New System.Drawing.Size(179, 52)
        Me.Tsm_Cancel_prison1.Text = "ยกเลิกชั่ง"
        '
        'Tsm_report_prison_in
        '
        Me.Tsm_report_prison_in.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_report_prison_in1, Me.Tsm_report_prison_in2})
        Me.Tsm_report_prison_in.Image = CType(resources.GetObject("Tsm_report_prison_in.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_in.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_in.Name = "Tsm_report_prison_in"
        Me.Tsm_report_prison_in.Size = New System.Drawing.Size(215, 54)
        Me.Tsm_report_prison_in.Text = "รายงานชั่ง"
        '
        'Tsm_report_prison_in1
        '
        Me.Tsm_report_prison_in1.Image = CType(resources.GetObject("Tsm_report_prison_in1.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_in1.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_in1.Name = "Tsm_report_prison_in1"
        Me.Tsm_report_prison_in1.Size = New System.Drawing.Size(274, 54)
        Me.Tsm_report_prison_in1.Text = "รายงานสรุปชั่ง"
        '
        'Tsm_report_prison_in2
        '
        Me.Tsm_report_prison_in2.Image = CType(resources.GetObject("Tsm_report_prison_in2.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_in2.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_in2.Name = "Tsm_report_prison_in2"
        Me.Tsm_report_prison_in2.Size = New System.Drawing.Size(274, 54)
        Me.Tsm_report_prison_in2.Text = "รายงานสรุปชั่ง (ละเอียด)"
        '
        'Tsm_report_prison_out
        '
        Me.Tsm_report_prison_out.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_report_prison_out1, Me.Tsm_report_prison_out2})
        Me.Tsm_report_prison_out.Image = CType(resources.GetObject("Tsm_report_prison_out.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_out.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_out.Name = "Tsm_report_prison_out"
        Me.Tsm_report_prison_out.Size = New System.Drawing.Size(215, 54)
        Me.Tsm_report_prison_out.Text = "รายงานเบิก"
        '
        'Tsm_report_prison_out1
        '
        Me.Tsm_report_prison_out1.Image = CType(resources.GetObject("Tsm_report_prison_out1.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_out1.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_out1.Name = "Tsm_report_prison_out1"
        Me.Tsm_report_prison_out1.Size = New System.Drawing.Size(281, 54)
        Me.Tsm_report_prison_out1.Text = "รายงานสรุปเบิก"
        '
        'Tsm_report_prison_out2
        '
        Me.Tsm_report_prison_out2.Image = CType(resources.GetObject("Tsm_report_prison_out2.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_out2.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_out2.Name = "Tsm_report_prison_out2"
        Me.Tsm_report_prison_out2.Size = New System.Drawing.Size(281, 54)
        Me.Tsm_report_prison_out2.Text = "รายงานสรุปเบิก (ละเอียด)"
        '
        'Tsm_report_prison_sum
        '
        Me.Tsm_report_prison_sum.DropDownItems.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tsm_report_prison_lot, Me.Tsm_report_prison_totalsum})
        Me.Tsm_report_prison_sum.Image = CType(resources.GetObject("Tsm_report_prison_sum.Image"), System.Drawing.Image)
        Me.Tsm_report_prison_sum.ImageScaling = System.Windows.Forms.ToolStripItemImageScaling.None
        Me.Tsm_report_prison_sum.Name = "Tsm_report_prison_sum"
        Me.Tsm_report_prison_sum.Size = New System.Drawing.Size(215, 54)
        Me.Tsm_report_prison_sum.Text = "รายงานคงเหลือ"
        '
        'Tsm_report_prison_lot
        '
        Me.Tsm_report_prison_lot.Name = "Tsm_report_prison_lot"
        Me.Tsm_report_prison_lot.Size = New System.Drawing.Size(212, 32)
        Me.Tsm_report_prison_lot.Text = "รายงาน Lot คงค้าง"
        '
        'Tsm_report_prison_totalsum
        '
        Me.Tsm_report_prison_totalsum.Name = "Tsm_report_prison_totalsum"
        Me.Tsm_report_prison_totalsum.Size = New System.Drawing.Size(212, 32)
        Me.Tsm_report_prison_totalsum.Text = "รายงานสรุป ชั่ง-เบิก"
        '
        'StatusStrip1
        '
        Me.StatusStrip1.Font = New System.Drawing.Font("Angsana New", 15.75!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.StatusStrip1.ImageScalingSize = New System.Drawing.Size(20, 20)
        Me.StatusStrip1.Items.AddRange(New System.Windows.Forms.ToolStripItem() {Me.Tssl_username})
        Me.StatusStrip1.Location = New System.Drawing.Point(0, 494)
        Me.StatusStrip1.Name = "StatusStrip1"
        Me.StatusStrip1.Size = New System.Drawing.Size(1003, 35)
        Me.StatusStrip1.TabIndex = 1
        Me.StatusStrip1.Text = "StatusStrip1"
        '
        'Tssl_username
        '
        Me.Tssl_username.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(0, Byte))
        Me.Tssl_username.Name = "Tssl_username"
        Me.Tssl_username.Size = New System.Drawing.Size(82, 30)
        Me.Tssl_username.Text = "Username"
        '
        'FMain
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(8.0!, 30.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(1003, 529)
        Me.Controls.Add(Me.StatusStrip1)
        Me.Controls.Add(Me.MenuStrip1)
        Me.Font = New System.Drawing.Font("TH Sarabun New", 16.2!, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, CType(222, Byte))
        Me.Icon = CType(resources.GetObject("$this.Icon"), System.Drawing.Icon)
        Me.IsMdiContainer = True
        Me.MainMenuStrip = Me.MenuStrip1
        Me.Margin = New System.Windows.Forms.Padding(4, 7, 4, 7)
        Me.Name = "FMain"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "โปรแกรมชั่งน้ำหนัก"
        Me.WindowState = System.Windows.Forms.FormWindowState.Maximized
        Me.MenuStrip1.ResumeLayout(False)
        Me.MenuStrip1.PerformLayout()
        Me.StatusStrip1.ResumeLayout(False)
        Me.StatusStrip1.PerformLayout()
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub

    Friend WithEvents MenuStrip1 As MenuStrip
    Friend WithEvents Tsm_setting As ToolStripMenuItem
    Friend WithEvents Tsm_setting_pro As ToolStripMenuItem
    Friend WithEvents Tsm_setting_machine As ToolStripMenuItem
    Friend WithEvents Tsm_setting_SQL As ToolStripMenuItem
    Friend WithEvents Tsm_weight As ToolStripMenuItem
    Friend WithEvents Tsm_report As ToolStripMenuItem
    Friend WithEvents Tsm_lots As ToolStripMenuItem
    Friend WithEvents StatusStrip1 As StatusStrip
    Friend WithEvents Tssl_username As ToolStripStatusLabel
    Friend WithEvents Tsm_Newlots As ToolStripMenuItem
    Friend WithEvents Tsm_Oldlot As ToolStripMenuItem
    Friend WithEvents Tsm_setting_printer As ToolStripMenuItem
    Friend WithEvents Tsm_weight1 As ToolStripMenuItem
    Friend WithEvents Tsm_Cancel As ToolStripMenuItem
    Friend WithEvents Tsm_stockout_m As ToolStripMenuItem
    Friend WithEvents Tsm_stockout As ToolStripMenuItem
    Friend WithEvents Tsm_Cancel_SO As ToolStripMenuItem
    Friend WithEvents Tsm_Return As ToolStripMenuItem
    Friend WithEvents Tsm_report_FG As ToolStripMenuItem
    Friend WithEvents Tsm_report_SO As ToolStripMenuItem
    Friend WithEvents Tsm_report_Sum As ToolStripMenuItem
    Friend WithEvents Tsm_report_FG1 As ToolStripMenuItem
    Friend WithEvents Tsm_report_FG2 As ToolStripMenuItem
    Friend WithEvents Tsm_report_SO1 As ToolStripMenuItem
    Friend WithEvents Tsm_report_SO2 As ToolStripMenuItem
    Friend WithEvents Tsm_prison As ToolStripMenuItem
    Friend WithEvents Tsm_out_prison As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_in As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_out As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_in1 As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_in2 As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_out1 As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_out2 As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_sum As ToolStripMenuItem
    Friend WithEvents Tsm_Cancel_prison As ToolStripMenuItem
    Friend WithEvents Tsm_Cancel_prison1 As ToolStripMenuItem
    Friend WithEvents Tsm_Cancel_prison2 As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_lot As ToolStripMenuItem
    Friend WithEvents Tsm_report_prison_totalsum As ToolStripMenuItem
End Class

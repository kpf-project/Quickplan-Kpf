Imports System.IO.Ports
Imports System.Drawing.Drawing2D
Imports System.Threading
Imports System.Globalization
Imports CrystalDecisions.Shared
Imports System.ComponentModel
Imports EasyModbus

Public Class MainForm
    Public Lid As Integer 'ค่า lotsid
    Dim Client2 As ModbusClient
    Dim Productcode As String 'ค่า Productcode 
    Dim Productname As String 'ค่า Productname
    Dim PC_name As String 'ค่า PC_name
    Dim CountFG As String 'นับจำนวน FG ตามรหัสสินค้า
    Dim weight As Decimal 'ค่าน้ำหนักจาก loadcell
    Dim iploadcell As String 'ค่า ip เครื่อง loadcell
    Dim portloadcell As String 'ค่า port เครื่อง loadcell
    Dim Printername As String 'ค่าชื่อเครื่องปริ้น
    Dim Weightnet As Double 'ค่าน้ำหนัก Net
    Dim tareweight As Double 'ค่าน้ำหนัก ภาชนะ
    Dim Weightpass As Double 'ค่าน้ำหนัก ผ่าน
    Dim threading1 As System.Threading.Thread 'threading
    Dim counttime As Long 'ค่าเวลาชั่งน้ำหนัก

    Private Sub MainForm_Load(sender As Object, e As EventArgs) Handles MyBase.Load

        If My.Settings.iploadcell = "" Or My.Settings.Printername = "" Then
            MessageBox.Show("ไม่พบการตั้งค่า เครื่องชั่งน้ำหนัก หรือ เครื่องปริ้นบาร์โค้ด !!!!", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning)
            Me.Close()
        Else
            counttime = 3500
            iploadcell = My.Settings.iploadcell
            portloadcell = My.Settings.portloadcell
            Tssl_iploadcell.Text = "Ip: " & iploadcell & " "
            Tssl_portloadcell.Text = "Port: " & portloadcell
            Printername = My.Settings.Printername

            ShowResult()
            ButtonConnect.Enabled = False
            ButtonDisconnect.Enabled = False
            Timer1.Start()
            Tssl_status.Text = "Status : Disconnect"
            Comname()

        End If
    End Sub
    'Print Barcode
    Private Sub Label_Barcode()
        Dim regDate As DateTime = DateTime.Now
        Dim strDate As String = regDate.ToString("dd-MM-yyyy", New System.Globalization.CultureInfo("en-US"))
        Try
            Dim rp1 As New ReportBarcode
            rp1.SetParameterValue("Proname", Productname)
            rp1.SetParameterValue("Codepro", Productcode)
            rp1.SetParameterValue("lotcode", Tb_lotcode.Text)
            rp1.SetParameterValue("AmountNum", Tb_amountlet.Text)
            rp1.SetParameterValue("barcode", Tb_barcode.Text)
            rp1.SetParameterValue("Tareweight", Tb_tareweight.Text)
            rp1.SetParameterValue("Netweight", Weightnet)
            rp1.PrintOptions.PrinterName = Printername
            rp1.PrintOptions.PaperSize = PaperSize.DefaultPaperSize
            rp1.PrintOptions.PaperOrientation = PaperOrientation.Landscape
            rp1.PrintToPrinter(1, True, 0, 0)
        Catch ex As Exception
            MessageBox.Show(ex.Message, "Error Report", MessageBoxButtons.OK, MessageBoxIcon.Error)
        End Try
    End Sub
    Private Sub timTimer_Tick(sender As Object, e As EventArgs) Handles Timer1.Tick

        LB_date.Text = "วันที่ : " & Now.ToString("dd/MM/yyyy", New System.Globalization.CultureInfo("en-US"))
        LB_time.Text = "เวลา : " & Now.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US"))
    End Sub

    Private Sub ButtonConnect_Click(sender As Object, e As EventArgs) Handles ButtonConnect.Click
        ConnectModbus()
    End Sub
    Sub getweight()
        Try
            While Client2.Connected
                Dim Rawdata() As Integer = Client2.ReadInputRegisters(1, 1)
                weight = Rawdata(0)
                weight /= 100
                Me.Invoke(New Thread1assistdelegate(AddressOf threadingassist))
                'threading1.Sleep(100)
            End While
        Catch ex As IO.IOException
            MessageBox.Show(ex.Message, "Error Connect", MessageBoxButtons.OK, MessageBoxIcon.Error)

        End Try
    End Sub
    Delegate Sub Thread1assistdelegate()
    Private Sub threadingassist()
        Tb_Weight.Text = weight

        If ((Convert.ToDouble(weight) - tareweight) - Convert.ToDouble(Tb_wnet.Text) >= 0) Then
            Timer2.Start()
        ElseIf Convert.ToDouble(weight) <= 0.1 Then
            counttime = 3500
        End If

    End Sub
    Private Sub ConnectModbus()
        Client2 = New ModbusClient(iploadcell, portloadcell)
        Try
            Client2.Connect()
            Client2.UnitIdentifier = 1

            If Client2.Connected = True Then
                Tssl_status.Text = "Status : Connect"
                ButtonConnect.Enabled = False
                ButtonDisconnect.Enabled = True
            End If

        Catch ex As Exception
            MessageBox.Show("Error: " & ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error)
            ButtonConnect.Enabled = True
        End Try

        threading1 = New System.Threading.Thread(AddressOf getweight)
        threading1.Start()
    End Sub
    Private Sub disconnectmodbus()
        If threading1.IsAlive = True Then
            Try
                threading1.Abort()
            Catch ex As Exception
                MessageBox.Show("Error: " & ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error)
            End Try
        End If

        Client2.Disconnect()
        Tssl_status.Text = "Status : Disconnect"
        ButtonDisconnect.Enabled = False
        ButtonConnect.Enabled = True
    End Sub
    Private Sub Timer2_Tick(sender As Object, e As EventArgs) Handles Timer2.Tick
        counttime = counttime - 100

        Label9.Text = counttime
        Label10.Text = ((Convert.ToDouble(weight) - tareweight) - Convert.ToDouble(Tb_wnet.Text))

        If counttime = 0 And ((Convert.ToDouble(weight) - tareweight) - Convert.ToDouble(Tb_wnet.Text) >= 0) Then
            Timer2.Stop()
            PassResult()
        ElseIf counttime = 0 And ((Convert.ToDouble(weight) - tareweight) - Convert.ToDouble(Tb_wnet.Text) < 0) Then
            Timer2.Stop()
            NotpassResult()
        End If
    End Sub
    Private Sub ButtonDisconnect_Click(sender As Object, e As EventArgs) Handles ButtonDisconnect.Click
        disconnectmodbus()
    End Sub
    Private Sub PassResult()
        Tb_Weight.ForeColor = Color.Lime
        lb_wstatus.Text = "Pass"
        lb_wstatus.ForeColor = Color.LimeGreen
        Weightnet = Convert.ToDouble(Tb_Weight.Text) - tareweight
        Label_Barcode()
        Insert_data()
    End Sub
    Private Sub NotpassResult()
        Tb_Weight.ForeColor = Color.Red
        lb_wstatus.Text = "Not Pass"
        lb_wstatus.ForeColor = Color.Red

    End Sub
    Private Sub clear()
        Tb_barcode.Text = ""
        Tb_lotcode.Text = ""
        Tb_tareweight.Text = ""
        Tb_wnet.Text = ""
        Tb_wpass.Text = ""
        Tb_amountlet.Text = ""
        LB_Product.Text = "เลือกผลิตภัณฑ์"
        Tb_Weight.Text = "0.00"
        lb_wstatus.Text = "...."
    End Sub

    Private Sub LB_Product_DoubleClick(sender As Object, e As EventArgs) Handles LB_Product.DoubleClick
        Lid = 0 'รีเช็ตค่า lid
        Fselect_productW.ShowDialog()

        If Lid > 0 Then
            'MessageBox.Show(Lid, "test")
            SQL = "SELECT Tb_Productlots.Pid,Tb_Product.Product_code,Tb_Product.Product_name,Lots_code,
                   Tb_Product.Tare_weight,Tb_Product.Weight_net,Tb_Product.AmountperLet FROM Tb_productlots
                   inner join Tb_Product on Tb_Product.Pid = Tb_Productlots.Pid
                   where Tb_Productlots.Lid = '" & Lid & "'"
            Dim dts As DataTable = Cmd_DataTable()
            Tb_lotcode.Text = dts.Rows(0)("lots_code").ToString
            LB_Product.Text = dts.Rows(0)("Product_code").ToString & " - " & dts.Rows(0)("Product_name").ToString
            Productcode = dts.Rows(0)("Product_code").ToString
            Productname = dts.Rows(0)("Product_name").ToString
            Tb_tareweight.Text = dts.Rows(0)("Tare_weight")
            tareweight = Convert.ToDouble(dts.Rows(0)("Tare_weight")) 'ค่าน้ำหนัก ภาชนะ
            Tb_wnet.Text = dts.Rows(0)("Weight_net")
            Weightpass = Convert.ToDouble(dts.Rows(0)("Weight_net")) 'ค่าน้ำหนัก ผ่าน
            Tb_amountlet.Text = dts.Rows(0)("Amountperlet")
            Tb_wpass.Text = dts.Rows(0)("Tare_weight") + dts.Rows(0)("Weight_net")
            Get_AutoNumber()
            ConnectModbus()
        Else
            clear()
        End If
    End Sub
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub
    'Private Sub Get_AutoNumber()

    '    Dim regDate As DateTime = DateTime.Now
    '    Dim killdate As DateTime = DateTime.Now.AddDays(-1)
    '    Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US"))
    '    Dim lotDate2 As String = killdate.ToString("ddMMyy", New System.Globalization.CultureInfo("en-US"))
    '    Dim lotDate As String = regDate.ToString("ddMMyy", New System.Globalization.CultureInfo("en-US"))
    '    Dim lottime As String = regDate.ToString("HH:mm", New System.Globalization.CultureInfo("en-US"))
    '    Dim timek1 As String = "19:00" 'ไว้สำหรับดักเวลา lot
    '    Dim lotid As String = lotDate & Productcode
    '    Dim lotid2 As String = lotDate2 & Productcode
    '    Dim letf As String

    '    Select Case lottime
    '        Case <= timek1
    '            letf = lotid2
    '        Case Else
    '            letf = lotid
    '    End Select

    '    SQL = "SELECT MAX(Fwbarcode) as Fwbarcode From Tb_Foodweight WHERE Fwbarcode like '" & letf & "%'"
    '    Dim dts As DataTable = Cmd_DataTable()
    '    If dts.Rows(0).Item("Fwbarcode").ToString = "" Then
    '        Tb_barcode.Text = letf + "0001"
    '        CountFG = "001"
    '    Else
    '        Dim Bid As String = dts.Rows(0).Item("Fwbarcode").ToString
    '        Dim Cid As Integer = Bid.Substring(9, 3) + 1
    '        Tb_barcode.Text = letf & Cid.ToString("0000")
    '        CountFG = Cid.ToString("0000")
    '    End If

    'End Sub

    Private Sub Get_AutoNumber()

        ' กำหนดวันและเวลา
        Dim regDate As DateTime = DateTime.Now
        Dim killdate As DateTime = DateTime.Now.AddDays(-1)
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US"))
        Dim lotDate2 As String = killdate.ToString("ddMMyy", New System.Globalization.CultureInfo("en-US"))
        Dim lotDate As String = regDate.ToString("ddMMyy", New System.Globalization.CultureInfo("en-US"))
        Dim lottime As String = regDate.ToString("HH:mm", New System.Globalization.CultureInfo("en-US"))
        Dim timek1 As String = "07:00" 'ไว้สำหรับดักเวลา lot
        Dim lotid As String = lotDate & Productcode
        Dim lotid2 As String = lotDate2 & Productcode

        ' กำหนด Prefix
        Dim letf As String

        Select Case lottime
            Case <= timek1
                letf = lotid2
            Case Else
                letf = lotid
        End Select

        ' ดึงเลขล่าสุดของ prefix นี้
        SQL = "SELECT MAX(Fwbarcode) AS Fwbarcode " &
            "FROM Tb_Foodweight " &
            "WHERE Fwbarcode LIKE '" & letf & "%'"

        Dim dts As DataTable = Cmd_DataTable()

        ' ถ้ายังไม่มีในวันนั้น → เริ่ม 0001
        If dts.Rows.Count = 0 OrElse IsDBNull(dts.Rows(0)("Fwbarcode")) _
        OrElse dts.Rows(0)("Fwbarcode").ToString = "" Then
            Tb_barcode.Text = letf & "0001"
            CountFG = "0001"
        Else
            ' มีข้อมูลแล้ว → เอา 4 หลักท้าย +1
            Dim lastBarcode As String = dts.Rows(0)("Fwbarcode").ToString

            Dim lastRun As Integer = CInt(Microsoft.VisualBasic.Right(lastBarcode, 4))
            Dim nextRun As Integer = lastRun + 1

            Tb_barcode.Text = letf & nextRun.ToString("0000")
            CountFG = nextRun.ToString("0000")

        End If

    End Sub

    Private Sub Insert_data()

        Dim regDate As DateTime = DateTime.Now 'วันที่ปัจจุบัน
        'Dim killdate As DateTime = DateTime.Now.AddDays(-1)
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US")) 'วันที่ชั่ง
        Dim strTime As String = regDate.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US")) 'เวลาชั่ง

        SQL = "Insert into Tb_Foodweight (Fwbarcode,Lid,Fwdate,Fwtime,Amount,FgWeight,Isstockout,Uid,Pc_name) VALUES (N'" & Tb_barcode.Text & "','" & Lid & "','" & strDate & "','" & strTime & "','" & Tb_amountlet.Text & "','" & Weightnet & "','1','" & FMain.Uid & "','" & PC_name & "')" 'คำสั่ง SQL
        Cmd_Excutequery()

        Get_AutoNumber() 'รันบาร์โค้ด
        ShowResult()

    End Sub

    Private Sub ShowResult()
        DGV1.DataSource = Nothing
        Dim regDate As DateTime = DateTime.Now
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US"))
        SQL = "SELECT TOP 20 FWbarcode,Tb_Product.Product_name,Tb_Productlots.Lots_code,Fgweight,Tb_Foodweight.Fwtime From Tb_Foodweight
                left join Tb_Productlots ON Tb_Foodweight.Lid = Tb_Productlots.Lid
                left join Tb_Product ON Tb_Productlots.Pid = Tb_Product.Pid
                where Tb_Foodweight.Fwdate = '" & strDate & "' 
                order by Tb_Foodweight.Fwtime Desc"
        DGV1.DataSource = Cmd_DataTable()
        With DGV1
            'ชื่อคอลัมที่ต้องการเปลี่ยน
            .Columns(0).HeaderText = "บาร์โค้ด"
            .Columns(1).HeaderText = "ชื่อผลิตภัณฑ์"
            .Columns(2).HeaderText = "เลขล็อต"
            .Columns(3).HeaderText = "น้ำหนัก"
            .Columns(4).HeaderText = "เวลา"
        End With
    End Sub
    Private Sub MainForm_Closing(sender As Object, e As CancelEventArgs) Handles Me.Closing

        If Client2 Is Nothing Then
            clear()
        Else
            clear()
            disconnectmodbus()
        End If
    End Sub

    'Private Sub MainForm_KeyDown(sender As Object, e As KeyEventArgs) Handles Me.KeyDown
    '    'If (e.KeyCode = Keys.F1) Then
    '    '    If CDbl(Tb_Weight.Text) >= CDbl(Tb_wpass.Text) Then
    '    '        PassResult()
    '    '    ElseIf CDbl(Tb_Weight.Text) < CDbl(Tb_wpass.Text) Then
    '    '        NotpassResult()
    '    '    End If
    '    'End If
    'End Sub

End Class

Imports System.IO.Ports
Imports System.Drawing.Drawing2D
Imports System.Threading
Imports System.Globalization
Imports CrystalDecisions.Shared
Imports System.ComponentModel
Imports EasyModbus
Public Class FWeight_Return
    Dim Lid As Integer 'ค่า lotsid
    Dim Fwid As Integer 'ค่า Fwid
    Dim Client2 As ModbusClient
    Dim Productcode As String 'ค่า Productcode 
    Dim Productname As String 'ค่า Productname
    Dim PC_name As String 'ค่า PC_name
    Dim weight As Decimal 'ค่าน้ำหนักจาก loadcell
    'Dim serialPort As SerialPort 'ค่า Serialport
    'Dim Baudratew As Integer 'ค่า Baudrate Serialport
    'Dim Parityw As String 'ค่า Parity Serialport
    'Dim Databit As Integer 'ค่า Databit Serialport
    'Dim Stopbitsw As String 'ค่า Stopbit Serialport
    Dim iploadcell As String 'ค่า ip เครื่อง loadcell
    Dim portloadcell As String 'ค่า port เครื่อง loadcell
    Dim Printername As String 'ค่าชื่อเครื่องปริ้น
    Dim Weightnet As Double 'ค่าน้ำหนัก Net
    Dim threading1 As System.Threading.Thread 'threading
    Dim counttime As Long 'ค่าเวลาชั่งน้ำหนัก

    Dim old_txtnamepro As String
    Dim new_txtnamepro As String

    Private Sub FWeight_Return_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        If My.Settings.iploadcell = "" Or My.Settings.Printername = "" Then
            MessageBox.Show("ไม่พบการตั้งค่า เครื่องชั่งน้ำหนัก หรือ เครื่องปริ้นบาร์โค้ด !!!!", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning)
            Me.Close()
        Else

            counttime = 5000
            iploadcell = My.Settings.iploadcell
            portloadcell = My.Settings.portloadcell
            Tssl_iploadcell.Text = "Ip: " & iploadcell & " "
            Tssl_portloadcell.Text = "Port: " & portloadcell
            Printername = My.Settings.Printername

            'ShowResult()
            ButtonConnect.Enabled = False
            ButtonDisconnect.Enabled = False
            Timer1.Start()
            Tssl_status.Text = "Status : Disconnect"
            Comname()

        End If
    End Sub
    Private Sub Comname()
        Dim strHostName As String
        strHostName = System.Net.Dns.GetHostName()
        PC_name = strHostName
    End Sub

    Private Sub Tb_barcode_KeyDown(sender As Object, e As KeyEventArgs) Handles Tb_barcode.KeyDown
        If e.KeyData = Keys.Enter Then
            old_txtnamepro = Tb_barcode.Text
            new_txtnamepro = change_barcode(old_txtnamepro)
            If IsNumeric(new_txtnamepro) Then
                SQL = "SELECT Fwid,FWbarcode,Tb_Product.Product_code,Tb_Product.Product_name,Tb_Productlots.Lid,Tb_Productlots.Lots_code,Fgweight,Tb_Product.Tare_weight,Tb_Product.Amountperlet From Tb_Foodweight
                left join Tb_Productlots ON Tb_Foodweight.Lid = Tb_Productlots.Lid
                left join Tb_Product ON Tb_Productlots.Pid = Tb_Product.Pid
                where Tb_Foodweight.Fwbarcode = '" & new_txtnamepro & "' and Tb_Foodweight.Isstockout = '0'"
                Dim dts As DataTable = Cmd_DataTable()

                If dts.Rows.Count > 0 Then
                    Lb_product.Text = dts.Rows(0)("Product_code").ToString & " - " & dts.Rows(0)("Product_name").ToString
                    Lb_lotcode.Text = dts.Rows(0)("lots_code").ToString
                    Tb_Fgweight.Text = dts.Rows(0)("Fgweight").ToString
                    Lb_tareweight.Text = dts.Rows(0)("Tare_weight").ToString
                    Tb_amountlet.Text = dts.Rows(0)("Amountperlet").ToString
                    Lb_newbarcode.Text = dts.Rows(0)("FWbarcode").ToString + "X"
                    Productcode = dts.Rows(0)("Product_code").ToString
                    Productname = dts.Rows(0)("Product_name").ToString
                    Fwid = dts.Rows(0)("Fwid").ToString
                    Lid = dts.Rows(0)("Lid").ToString
                    'connectrs232()
                Else

                End If

            End If
        End If
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

        If (CDbl(Tb_Weight.Text) - CDbl(Lb_tareweight.Text)) < CDbl(Tb_Fgweight.Text) Then
            'PassResult()
            Timer2.Start()

        End If
        'If (weight >= Wbucket And weight <= Wbucketmax) And tb_bucketw.Text = 0 Then
        '    If weight > 0 Then
        '        tb_bucketw.Text = weight
        '    End If
        'End If

        'If weight >= Wlow And weight <= Whigh And tb_bucketw.Text > 0 Then
        '    Timer2.Start()
        'Else
        '    Timer2.Stop()
        'End If

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
        Client2.Disconnect()
        Tssl_status.Text = "Status : Disconnect"
        ButtonDisconnect.Enabled = False
        ButtonConnect.Enabled = True
    End Sub

    Private Sub ButtonDisconnect_Click(sender As Object, e As EventArgs) Handles ButtonDisconnect.Click
        disconnectmodbus()
    End Sub

    Private Sub DataReceivedHandler(sender As Object, e As SerialDataReceivedEventArgs)
        '' This event handler is called when data is received on the serial port

        '' Read the received data
        'Dim weightData As String = serialPort.ReadLine()
        'weightData = weightData.Substring(2, 10)

        '' Update the UI on the main thread
        'Me.Invoke(Sub()
        '              Tb_Weight.Text = FormatNumber(CDbl(weightData), 3)
        '              If (CDbl(Tb_Weight.Text) - CDbl(Lb_tareweight.Text)) < CDbl(Tb_Fgweight.Text) Then
        '                  PassResult()
        '              Else
        '                  NotpassResult()
        '              End If
        '          End Sub)
    End Sub
    Private Sub PassResult()
        Tb_Weight.ForeColor = Color.Lime
        Weightnet = CDbl(Tb_Weight.Text) - CDbl(Lb_tareweight.Text)
        Label_Barcode()
        Insert_data()
        Update_Status()
        clear()
        disconnectmodbus()
    End Sub
    Private Sub NotpassResult()
        Tb_Weight.ForeColor = Color.Red
    End Sub
    Private Sub Insert_data()

        Dim regDate As DateTime = DateTime.Now 'วันที่ปัจจุบัน
        'Dim killdate As DateTime = DateTime.Now.AddDays(-1)
        Dim strDate As String = regDate.ToString("MM-dd-yyyy", New System.Globalization.CultureInfo("en-US")) 'วันที่ชั่ง
        Dim strTime As String = regDate.ToString("HH:mm:ss", New System.Globalization.CultureInfo("en-US")) 'เวลาชั่ง

        SQL = "Insert into Tb_foodweight (Fwbarcode,Amount,FgWeight,Lid,Fwdate,Fwtime,Isstockout,Uid,Pc_name) VALUES (N'" & Lb_newbarcode.Text & "','" & Tb_amountlet.Text & "','" & Weightnet & "','" & Lid & "','" & strDate & "','" & strTime & "','1','" & FMain.Uid & "','" & PC_name & "')" 'คำสั่ง SQL
        Cmd_Excutequery()

    End Sub
    Private Sub Update_Status()
        Dim Weight_remain As Double
        Weight_remain = CDbl(Tb_Fgweight.Text) - CDbl(Tb_Weight.Text)

        'SQL = "Select * From Tb_Returnfoodweight where Fwbarcode = '" & Lb_newbarcode.Text & "'"
        'Dim dts As DataTable = Cmd_DataTable()

        SQL = "Update Tb_Foodweight Set FgWeight = '" & Weight_remain & "'  where Fwbarcode = '" & new_txtnamepro & "'"
        Cmd_Excutequery()
    End Sub
    Private Sub Label_Barcode()
        Dim regDate As DateTime = DateTime.Now
        Dim strDate As String = regDate.ToString("dd-MM-yyyy", New System.Globalization.CultureInfo("en-US"))
        Try
            Dim rp1 As New ReportBarcode_return
            rp1.SetParameterValue("Proname", Productname)
            rp1.SetParameterValue("Codepro", Productcode)
            rp1.SetParameterValue("lotcode", Lb_lotcode.Text)
            rp1.SetParameterValue("AmountNum", Tb_amountlet.Text)
            rp1.SetParameterValue("barcode", Lb_newbarcode.Text)
            rp1.SetParameterValue("Tareweight", Lb_tareweight.Text)
            rp1.SetParameterValue("Netweight", Weightnet)
            rp1.PrintOptions.PrinterName = Printername
            rp1.PrintOptions.PaperSize = PaperSize.DefaultPaperSize
            rp1.PrintOptions.PaperOrientation = PaperOrientation.Landscape
            rp1.PrintToPrinter(1, True, 0, 0)
        Catch ex As Exception
            MessageBox.Show(ex.Message, "Error Report", MessageBoxButtons.OK, MessageBoxIcon.Error)
        End Try
    End Sub
    Private Function change_barcode(barcode As String) As String
        Dim result As String = ""
        For Each c As Char In barcode
            Select Case c
                Case "ๅ" : result &= "1"
                Case "/" : result &= "2"
                Case "-" : result &= "3"
                Case "ภ" : result &= "4"
                Case "ถ" : result &= "5"
                Case "ุ" : result &= "6"
                Case "ึ" : result &= "7"
                Case "ค" : result &= "8"
                Case "ต" : result &= "9"
                Case "จ" : result &= "0"
                Case Else : result &= c
            End Select
        Next
        Return result
    End Function

    Private Sub Tb_Weight_DoubleClick(sender As Object, e As EventArgs) Handles Tb_Weight.DoubleClick
        If (CDbl(Tb_Weight.Text) - CDbl(Lb_tareweight.Text)) < CDbl(Tb_Fgweight.Text) Then
            PassResult()
        Else
            NotpassResult()
        End If

    End Sub
    Private Sub clear()
        Tb_barcode.Text = ""
        Lb_newbarcode.Text = ""
        Lb_product.Text = ""
        Lb_lotcode.Text = ""
        Lb_tareweight.Text = ""
        Tb_amountlet.Text = ""
        Tb_Fgweight.Text = ""
        Tb_Weight.Text = "0.00"
    End Sub

    Private Sub FWeight_Return_Closing(sender As Object, e As CancelEventArgs) Handles Me.Closing
        If Client2 Is Nothing Then
            clear()
        Else
            clear()
            disconnectmodbus()
        End If
    End Sub
End Class
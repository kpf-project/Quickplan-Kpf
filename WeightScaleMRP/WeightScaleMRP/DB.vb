Imports System.Data.SqlClient
Imports System.Data.OleDb
Module DB

    'ประกาศตัวแปร
    Friend Cn As New SqlConnection("Data Source=" & My.Settings.ipserver & ";Initial Catalog=" & My.Settings.DBname & ";Persist Security Info=True;User ID=" & My.Settings.Username & ";Password=" & My.Settings.Password & "")
    'Friend Cn As New SqlConnection("Data Source=192.168.210.6;Initial Catalog=Weight_Test;Persist Security Info=True;User ID=sa;Password=KPfood%2023")
    Friend Cmd As New SqlCommand
    Friend Da As New SqlDataAdapter
    Friend Dt As New DataTable
    Friend Ds As New DataSet
    Friend Dr As SqlDataReader
    Friend StrConn As String

    Friend SQL As String

    'เปิดใช้งานฐานข้อมูล
    Friend Sub Connet()


        With Cn
            Try
                Cursor.Current = Cursors.WaitCursor
                If .State = ConnectionState.Open Then
                    .Close()
                    .Open()
                Else
                    .Open()
                End If
            Catch ex As Exception
                MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error)
            Finally
                Cursor.Current = Cursors.Default
            End Try
        End With


    End Sub

    'เพิ่ม/ลบ/แก้ไข  ฐานข้อมูล ตัวแปร sql00
    Friend Function Cmd_Excutequery()

        Connet()
        Cmd = New SqlCommand(SQL, Cn)
        Return Cmd.ExecuteNonQuery

    End Function

    Friend Function Cmd_ExcuteScalar()
        Connet()
        Cmd = New SqlCommand(SQL, Cn)
        Return Cmd.ExecuteScalar()
    End Function
    Friend Function Cmd_ExcuteReader()
        Connet()
        Cmd = New SqlCommand(SQL, Cn)
        Return Cmd.ExecuteReader()
    End Function

    'ดึงข้อมูลมาแสดงใน Datagrid ตัวแปร sql00
    Friend Function Cmd_DataTable()
        Connet()
        Da = New SqlDataAdapter(SQL, Cn)
        Ds = New DataSet
        Da.Fill(Ds, "table")
        Return Ds.Tables("table")
    End Function

    Friend Function Cmd_DataTable2()
        Connet()
        Da = New SqlDataAdapter(SQL, Cn)
        Ds = New DataSet
        Da.Fill(Ds, "table")
        Return Ds
        'Return Ds.Tables("table")
    End Function

    Friend Sub Fill_Combobox(cb As Object)
        Connet()
        Cmd = New SqlCommand(SQL, Cn)
        Dr = Cmd.ExecuteReader
        cb.items.clear()
        While Dr.Read
            cb.items.Add(Dr(0))
        End While
        Dr.Close()
    End Sub

End Module

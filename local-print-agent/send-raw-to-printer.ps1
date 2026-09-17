param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,
  [Parameter(Mandatory = $false)]
  [string]$PayloadBase64,
  [Parameter(Mandatory = $false)]
  [string]$PayloadFile,
  [Parameter(Mandatory = $false)]
  [string]$DocumentName = "KPF Weight Scale Label",
  [Parameter(Mandatory = $false)]
  [switch]$PayloadFromStdin
)

$signature = @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.Drv", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

  [DllImport("winspool.Drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
"@

Add-Type -TypeDefinition $signature | Out-Null

if ($PayloadFromStdin) {
  $stdin = [System.Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($stdin)) {
    throw "Payload from standard input was empty."
  }
  $bytes = [Convert]::FromBase64String($stdin.Trim())
} elseif ($PayloadFile) {
  if (-not (Test-Path -LiteralPath $PayloadFile)) {
    throw "Payload file was not found at '$PayloadFile'."
  }
  $bytes = [System.IO.File]::ReadAllBytes($PayloadFile)
} elseif ($PayloadBase64) {
  $bytes = [Convert]::FromBase64String($PayloadBase64)
} else {
  throw "PayloadBase64, PayloadFile, or PayloadFromStdin is required."
}

$printerHandle = [IntPtr]::Zero

if (-not [RawPrinterHelper]::OpenPrinter($PrinterName, [ref]$printerHandle, [IntPtr]::Zero)) {
  throw "Unable to open printer '$PrinterName'."
}

try {
  $docInfo = New-Object RawPrinterHelper+DOCINFOA
  $docInfo.pDocName = $DocumentName
  $docInfo.pDataType = "RAW"

  if (-not [RawPrinterHelper]::StartDocPrinter($printerHandle, 1, $docInfo)) {
    throw "Unable to start print document."
  }

  try {
    if (-not [RawPrinterHelper]::StartPagePrinter($printerHandle)) {
      throw "Unable to start print page."
    }

    $unmanagedPointer = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
    try {
      [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $unmanagedPointer, $bytes.Length)
      $written = 0
      if (-not [RawPrinterHelper]::WritePrinter($printerHandle, $unmanagedPointer, $bytes.Length, [ref]$written)) {
        throw "Unable to write raw bytes to printer."
      }

      if ($written -ne $bytes.Length) {
        throw "Incomplete raw print write. Wrote $written of $($bytes.Length) bytes."
      }
    }
    finally {
      if ($unmanagedPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeCoTaskMem($unmanagedPointer)
      }
    }

    if (-not [RawPrinterHelper]::EndPagePrinter($printerHandle)) {
      throw "Unable to end print page."
    }
  }
  finally {
    [RawPrinterHelper]::EndDocPrinter($printerHandle) | Out-Null
  }
}
finally {
  [RawPrinterHelper]::ClosePrinter($printerHandle) | Out-Null
}

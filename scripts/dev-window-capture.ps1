param([string]$OutName = "shot.png", [int]$ClickDx = -1, [int]$ClickDy = -1, [string]$TypeText = "", [int]$SettleMs = 900)

# 用法：在仓库根目录执行（截图输出到 ./.screenshots/）
# powershell -ExecutionPolicy Bypass -File scripts/dev-window-capture.ps1 -OutName x.png `
#   [-ClickDx 100 -ClickDy 80] [-TypeText "文本"] [-SettleMs 1200]

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@

$proc = Get-Process -Name browserhub -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO_WINDOW"; exit 1 }
$hwnd = $proc.MainWindowHandle

$r = New-Object W2+RECT
[W2]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$width = $r.Right - $r.Left
$height = $r.Bottom - $r.Top

function Focus-Window([IntPtr]$handle) {
  $foreground = [W2]::GetForegroundWindow()
  $fgPid = 0
  [W2]::GetWindowThreadProcessId($foreground, [ref]$fgPid) | Out-Null
  $fgThread = [W2]::GetWindowThreadProcessId($foreground, [ref]$fgPid)
  $myThread = [W2]::GetCurrentThreadId()
  $targetThread = [W2]::GetWindowThreadProcessId($handle, [ref]$fgPid)
  [W2]::AttachThreadInput($fgThread, $myThread, $true) | Out-Null
  [W2]::AttachThreadInput($targetThread, $myThread, $true) | Out-Null
  [W2]::ShowWindow($handle, 9) | Out-Null
  [W2]::SetForegroundWindow($handle) | Out-Null
  [W2]::AttachThreadInput($fgThread, $myThread, $false) | Out-Null
  [W2]::AttachThreadInput($targetThread, $myThread, $false) | Out-Null
}

if ($ClickDx -ge 0) {
  # move window to a predictable position on screen first
  [W2]::MoveWindow($hwnd, 100, 100, $width, $height, $true) | Out-Null
  Start-Sleep -Milliseconds 400
  [W2]::GetWindowRect($hwnd, [ref]$r) | Out-Null
  Focus-Window $hwnd
  Start-Sleep -Milliseconds 500
  $nowForeground = [W2]::GetForegroundWindow()
  if ($nowForeground -ne $hwnd) {
    Write-Output "WARN: foreground is $nowForeground, expected $hwnd"
  }
  $x = $r.Left + $ClickDx
  $y = $r.Top + $ClickDy
  Write-Output "CLICKING at $x,$y"
  [W2]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 200
  [W2]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 70; [W2]::mouse_event(4,0,0,0,0)
  Start-Sleep -Milliseconds $SettleMs
  if ($TypeText) {
    [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait($TypeText)
    Start-Sleep -Milliseconds 500
  }
}

$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[W2]::PrintWindow($hwnd, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$g.Dispose()
# 输出到项目 .screenshots/（gitignore），与 dev-mock-screenshot.js 保持一致
$dir = "./.screenshots"
New-Item -ItemType Directory -Force -Path $dir | Out-Null | Out-Null
$bmp.Save((Join-Path (Convert-Path $dir) $OutName), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "SAVED $OutName ${width}x${height} rect=$($r.Left),$($r.Top)"

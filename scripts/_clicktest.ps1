param([int]$RelX = 1144, [int]$RelY = 19, [string]$Mode = "click")
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MT2 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@
$p = Get-Process browserhub | Select-Object -First 1
[MT2]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 700
$r = New-Object MT2+RECT
[MT2]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
Write-Output "rect: $($r.Left),$($r.Top) size $($r.Right-$r.Left)x$($r.Bottom-$r.Top) visible=$([MT2]::IsWindowVisible($p.MainWindowHandle))"
$x = $r.Left + $RelX
$y = $r.Top + $RelY
[MT2]::SetCursorPos($x, $y) | Out-Null
Start-Sleep -Milliseconds 300
[MT2]::mouse_event(2,0,0,0,0)
Start-Sleep -Milliseconds 100
[MT2]::mouse_event(4,0,0,0,0)
Start-Sleep -Milliseconds 1200
$alive = $null -ne (Get-Process browserhub -ErrorAction SilentlyContinue)
$vis = if ($alive) { [MT2]::IsWindowVisible($p.MainWindowHandle) } else { $false }
Write-Output "clicked rel($RelX,$RelY) abs($x,$y); visible=$vis; processAlive=$alive"

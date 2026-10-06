# Drives the running game without stealing focus: posts key events to its window and
# saves a PrintWindow capture. Usage: powershell -File tools/shot.ps1 -out x.png -keys "z,right:1500,f12" -waitMs 800
# Keys: z, r, right, left, space, f12 (":ms" = hold time). F12 makes the game save a frame to verification/.
param([string]$out, [int]$waitMs = 0, [string]$keys = "")
Add-Type -AssemblyName System.Drawing
$p = Get-Process belling-cat-comic -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { Write-Output "NO PROCESS"; exit 1 }
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W {
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);
[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
public struct R { public int L, T, Rt, B; }
"@
[W]::SetProcessDPIAware() | Out-Null
$h = $p.MainWindowHandle
$vk = @{ z = 0x5A; r = 0x52; right = 0x27; left = 0x25; space = 0x20; f12 = 0x7B }
foreach ($k in $keys.Split(',', [StringSplitOptions]::RemoveEmptyEntries)) {
  $parts = $k.Split(':'); $name = $parts[0]; $hold = if ($parts.Length -gt 1) { [int]$parts[1] } else { 60 }
  $code = $vk[$name]; $scan = [W]::MapVirtualKey($code, 0)
  $ext = if ($name -in @('right','left')) { 0x01000000 } else { 0 }
  $l = [IntPtr]((1 -bor ($scan -shl 16)) -bor $ext)
  [W]::PostMessage($h, 0x100, [IntPtr]$code, $l) | Out-Null
  Start-Sleep -Milliseconds $hold
  $lu = [IntPtr](((1 -bor ($scan -shl 16)) -bor $ext) -bor 0xC0000000)
  [W]::PostMessage($h, 0x101, [IntPtr]$code, $lu) | Out-Null
  Start-Sleep -Milliseconds 80
}
Start-Sleep -Milliseconds $waitMs
$r = New-Object R; [W]::GetClientRect($h, [ref]$r) | Out-Null
$w = $r.Rt - $r.L; $hh = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc(); [W]::PrintWindow($h, $hdc, 2) | Out-Null; $g.ReleaseHdc($hdc)
$bmp.Save($out); Write-Output "saved $out ${w}x${hh}"

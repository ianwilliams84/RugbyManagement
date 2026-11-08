# Builds runme.exe (project root) from tools\runme-launcher.cs, with a rugby
# ball icon drawn here. Uses the C# compiler that ships with .NET Framework 4.x,
# so nothing extra needs installing.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tools = $PSScriptRoot

# 1. Multi-size .ico (PNG-compressed entries): a white rugby ball on a green disc.
Add-Type -AssemblyName System.Drawing
function New-IconPng([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0x1C, 0x77, 0x32))
    $g.FillEllipse($green, 0, 0, $s - 1, $s - 1)
    $g.TranslateTransform($s / 2, $s / 2)
    $g.RotateTransform(-35)
    $w = $s * 0.66; $h = $s * 0.40
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, $s * 0.07))
    $g.DrawEllipse($pen, -$w / 2, -$h / 2, $w, $h)
    if ($s -ge 24) {
        $thin = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1, $s * 0.045))
        $g.DrawLine($thin, -$w * 0.3, 0, $w * 0.3, 0)
        foreach ($x in -0.15, -0.05, 0.05, 0.15) { $g.DrawLine($thin, $w * $x, -$h * 0.14, $w * $x, $h * 0.14) }
        $thin.Dispose()
    }
    $pen.Dispose(); $green.Dispose(); $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    , $ms.ToArray()
}
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = foreach ($s in $sizes) { New-IconPng $s }
$ico = Join-Path $tools 'app.ico'
$fs = [System.IO.File]::Create($ico)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $d = $pngs[$i]
    $w.Write([byte]($s % 256)); $w.Write([byte]($s % 256))   # 256 is stored as 0
    $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$d.Length); $w.Write([UInt32]$offset)
    $offset += $d.Length
}
foreach ($d in $pngs) { $w.Write($d) }
$w.Close()

# 2. Compile the launcher.
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe", "$env:WINDIR\Microsoft.NET\Framework\v4*\csc.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $csc) { throw 'csc.exe (.NET Framework 4.x) not found.' }
& $csc.FullName /nologo /target:exe /optimize+ "/win32icon:$ico" "/out:$(Join-Path $root 'runme.exe')" (Join-Path $tools 'runme-launcher.cs')
if ($LASTEXITCODE) { throw "csc failed ($LASTEXITCODE)" }
Write-Host "Built $(Join-Path $root 'runme.exe')"

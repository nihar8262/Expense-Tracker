param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $ProjectRoot "public\Glossy-logo.png"
$resRoot = Join-Path $ProjectRoot "android\app\src\main\res"
$source = [System.Drawing.Bitmap]::FromFile($sourcePath)

function New-Canvas([int]$size, [bool]$withBackground, [double]$logoScale, [string]$outputPath) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  if ($withBackground) {
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#03271D"))
    $graphics.FillRectangle($brush, 0, 0, $size, $size)
    $brush.Dispose()
  }

  $targetWidth = [int]($size * $logoScale)
  $targetHeight = [int]($targetWidth * $source.Height / $source.Width)
  $targetX = [int](($size - $targetWidth) / 2)
  $targetY = [int](($size - $targetHeight) / 2)
  $graphics.DrawImage($source, $targetX, $targetY, $targetWidth, $targetHeight)

  $directory = Split-Path -Parent $outputPath
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$densities = @(
  @{ Name = "mdpi"; Legacy = 48; Foreground = 108 },
  @{ Name = "hdpi"; Legacy = 72; Foreground = 162 },
  @{ Name = "xhdpi"; Legacy = 96; Foreground = 216 },
  @{ Name = "xxhdpi"; Legacy = 144; Foreground = 324 },
  @{ Name = "xxxhdpi"; Legacy = 192; Foreground = 432 }
)

foreach ($density in $densities) {
  $folder = Join-Path $resRoot ("mipmap-" + $density.Name)
  New-Canvas $density.Legacy $true 0.88 (Join-Path $folder "ic_launcher.png")
  New-Canvas $density.Legacy $true 0.82 (Join-Path $folder "ic_launcher_round.png")
  New-Canvas $density.Foreground $false 0.66 (Join-Path $folder "ic_launcher_foreground.png")
}

New-Canvas 512 $false 0.78 (Join-Path $resRoot "drawable-nodpi\splash_mark.png")
$source.Dispose()

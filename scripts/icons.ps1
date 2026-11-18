Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public'
function Draw($size, $name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#09090b'))
  $s = $size / 512
  $lime = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#a3e635'))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#fafafa'))
  $g.FillRectangle($lime, 96*$s, 232*$s, 320*$s, 48*$s)
  $g.FillRectangle($lime, 120*$s, 168*$s, 48*$s, 176*$s)
  $g.FillRectangle($lime, 344*$s, 168*$s, 48*$s, 176*$s)
  $g.FillRectangle($white, 72*$s, 200*$s, 36*$s, 112*$s)
  $g.FillRectangle($white, 404*$s, 200*$s, 36*$s, 112*$s)
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Draw 192 'pwa-192.png'
Draw 512 'pwa-512.png'
Draw 180 'apple-touch-icon.png'

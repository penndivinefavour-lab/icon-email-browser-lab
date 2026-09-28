function Get-FreePort {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 3002)
    try { $listener.Stop(); return $true } catch { return $false }
}

if (-not (Get-FreePort)) { Write-Host "Port 3002 busy"; exit 1 }

$cwd = "D:\Hermes Agent\ICON Email Browser Lab"
$env:DATABASE_PATH = "$cwd\data\icon-lab.db"
$proc = Start-Process -FilePath "npx" -ArgumentList "vite","--config","vite.config.ts","--port","3002","--strictPort" -WorkingDirectory $cwd -PassThru -NoNewWindow

Start-Sleep 3
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep 1
    if ($proc.HasExited) { Write-Host "Vite exited $($proc.ExitCode)"; exit 1 }
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3002/" -TimeoutSec 2 -UseBasicParsing
        if ($r.StatusCode -eq 200) { Write-Host "Vite ready on port 3002"; exit 0 }
    } catch {}
}
Write-Host "Not ready"
exit 1

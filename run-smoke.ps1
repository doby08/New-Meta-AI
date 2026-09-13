$ErrorActionPreference = 'Stop'
$p = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory 'c:\Users\Ivy Banua\OneDrive\Desktop\kuya poy\METa AI' -PassThru -NoNewWindow
Start-Sleep -Seconds 5
try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/site' -UseBasicParsing -TimeoutSec 10; Write-Host 'ALIVE: ' $r.Content.Substring(0,200) } catch { Write-Host 'DOWN: ' $_.Exception.Message }
$p.Kill()
Write-Host 'Smoke test complete.'

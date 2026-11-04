# Reverse SSH tunnel: Windows connects OUT to the VPS, so the VPS reaches this API
# at 127.0.0.1:18080 without open ports, and a changed IP does not matter.
# Run once as Administrator on the Windows server:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\install-tunnel.ps1
# Then run the printed command on the VPS.

param(
  [string]$AppDir = "C:\mg-api",
  [string]$Vps = "178.172.138.96",
  [string]$User = "mgtunnel",
  [int]$RemotePort = 18080,
  [int]$LocalPort = 80
)

$ErrorActionPreference = "Stop"
$dir = Join-Path $AppDir "api\data\tunnel"
$key = Join-Path $dir "id_ed25519"
$known = Join-Path $dir "known_hosts"
$loop = Join-Path $dir "tunnel-loop.ps1"
$task = "MG-Tunnel"

$ssh = (Get-Command ssh.exe -ErrorAction SilentlyContinue).Source
if (-not $ssh) { throw "ssh.exe not found. Install the OpenSSH Client Windows feature first." }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

if (-not (Test-Path $key)) {
  Write-Host "==> generating tunnel key"
  & cmd.exe /c "ssh-keygen -q -t ed25519 -N `"`" -C mg-tunnel -f `"$key`""
  if (-not (Test-Path $key)) { throw "ssh-keygen failed" }
}
# OpenSSH refuses a private key other accounts can read.
& icacls $key /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null

$body = @"
while (`$true) {
  & "$ssh" -N -i "$key" -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$known" -R 127.0.0.1:${RemotePort}:127.0.0.1:${LocalPort} $User@$Vps
  Start-Sleep -Seconds 10
}
"@
Set-Content -Path $loop -Value $body -Encoding ASCII

Write-Host "==> scheduled task $task (starts with Windows, restarts the tunnel)"
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
$psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $psExe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$loop`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $task

$pub = (Get-Content "$key.pub" -Raw).Trim()
Write-Host ""
Write-Host "Done on Windows. Now run this on the VPS as root:" -ForegroundColor Green
Write-Host ""
Write-Host "id $User >/dev/null 2>&1 || useradd -r -m -s /usr/sbin/nologin $User; install -d -m 700 -o $User -g $User /home/$User/.ssh; echo 'restrict,port-forwarding,permitlisten=`"127.0.0.1:$RemotePort`" $pub' > /home/$User/.ssh/authorized_keys; chown $User`:$User /home/$User/.ssh/authorized_keys; chmod 600 /home/$User/.ssh/authorized_keys; sleep 15; curl -s -m 15 http://127.0.0.1:$RemotePort/health; echo"

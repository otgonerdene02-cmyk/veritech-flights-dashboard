$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
$env:GCM_INTERACTIVE = "always"
Set-Location "C:\Users\User\veritech-flights-dashboard"
git push -u origin main

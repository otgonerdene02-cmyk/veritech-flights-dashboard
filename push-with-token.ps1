$envFile = Join-Path $PSScriptRoot ".env.local"

function Get-SavedToken {
  if (-not (Test-Path $envFile)) { return $null }
  $line = Get-Content $envFile | Where-Object { $_ -match '^GITHUB_TOKEN=' } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace '^GITHUB_TOKEN=', '').Trim()
}

$Token = $env:GITHUB_TOKEN
if (-not $Token) { $Token = Get-SavedToken }

if (-not $Token) {
  try {
    $Token = Read-Host "Enter GitHub Personal Access Token (asked once, saved to .env.local)"
  } catch {
    $Token = $null
  }
  if (-not $Token) {
    Write-Error "Could not read a token interactively (this shell has no stdin). Create '.env.local' next to this script with one line: GITHUB_TOKEN=your_token_here, then run this script again."
    exit 1
  }
  "GITHUB_TOKEN=$Token" | Out-File -FilePath $envFile -Encoding utf8 -NoNewline
  Write-Host "Token saved to $envFile - won't be asked again next time."
}

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
Set-Location "C:\Users\User\veritech-flights-dashboard"

git remote set-url origin "https://$Token@github.com/otgonerdene02-cmyk/veritech-flights-dashboard.git"
git fetch origin main
git rebase origin/main
$rebaseExit = $LASTEXITCODE
if ($rebaseExit -ne 0) {
  Write-Host "REBASE FAILED with exit code $rebaseExit - resolve conflicts manually"
  git remote set-url origin "https://github.com/otgonerdene02-cmyk/veritech-flights-dashboard.git"
  exit 1
}
git push -u origin main
$pushExit = $LASTEXITCODE

git remote set-url origin "https://github.com/otgonerdene02-cmyk/veritech-flights-dashboard.git"
git remote -v

if ($pushExit -eq 0) {
  Write-Host "PUSH SUCCEEDED"
} else {
  Write-Host "PUSH FAILED with exit code $pushExit"
}

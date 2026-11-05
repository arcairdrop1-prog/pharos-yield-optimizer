$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
$gitSafeProject = $project -replace '\\', '/'
$remote = "https://github.com/shoupeorg/pharos-yield-optimizer.git"
Set-Location $project

& (Join-Path $PSScriptRoot "deploy-cloudflare.ps1")
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deployment failed." }

git -c "safe.directory=$gitSafeProject" add wrangler.jsonc
git -c "safe.directory=$gitSafeProject" diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git -c "safe.directory=$gitSafeProject" commit -m "Configure deployed Cloudflare D1"
  if ($LASTEXITCODE -ne 0) { throw "Git commit failed." }
}

$origin = git -c "safe.directory=$gitSafeProject" remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
  git -c "safe.directory=$gitSafeProject" remote add origin $remote
} elseif ($origin -ne $remote) {
  throw "Existing origin does not match the intended repository: $origin"
}

git -c "safe.directory=$gitSafeProject" push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub publication failed." }

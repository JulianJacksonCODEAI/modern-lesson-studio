# Builds build\team and build\full after running every test. Stops on any failure.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
node --test "test/*.test.mjs" "engine/test/*.test.mjs"
if ($LASTEXITCODE -ne 0) { Write-Error 'Tests failed. Nothing was built.'; exit 1 }
node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { exit 1 }

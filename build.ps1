# Builds Chromium and Firefox editions after running every test. Stops on any failure.
#   build\team, build\full                     Chromium (Chrome, Edge, Brave, Arc, Opera)
#   build\team-firefox, build\full-firefox     Firefox
#   build\lesson-studio-team-<v>.zip           share with the team (Chromium)
#   build\lesson-studio-team-firefox-<v>.zip   Firefox team build (sign on addons.mozilla.org before sharing)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# Formatting and lint (code.org settings). Run `npm install` once first; `npm run format` fixes formatting.
npx.cmd prettier --check "**/*.{js,mjs,css,html}" --log-level warn
if ($LASTEXITCODE -ne 0) { Write-Error 'Formatting differs from Prettier. Run: npm run format'; exit 1 }
npx.cmd eslint .
if ($LASTEXITCODE -ne 0) { Write-Error 'ESLint found problems. Nothing was built.'; exit 1 }
node --test "test/*.test.mjs" "engine/test/*.test.mjs"
if ($LASTEXITCODE -ne 0) { Write-Error 'Tests failed. Nothing was built.'; exit 1 }
node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { exit 1 }

# Mozilla's extension checker. Team build: no errors or warnings. Full build: no errors
# (its older prototype screens use innerHTML with escaped text, which the checker warns about).
foreach ($edition in 'team', 'full') {
  $raw = npx.cmd -y web-ext@8 lint --source-dir "build/$edition-firefox" --output json 2>$null | Out-String
  $start = $raw.IndexOf('{')
  if ($start -lt 0) { Write-Error "web-ext lint did not run for $edition-firefox (is npm online?)."; exit 1 }
  $result = $raw.Substring($start) | ConvertFrom-Json
  $errors = $result.summary.errors; $warnings = $result.summary.warnings
  Write-Host "web-ext lint $edition-firefox: $errors errors, $warnings warnings"
  if ($errors -gt 0 -or ($edition -eq 'team' -and $warnings -gt 0)) {
    foreach ($m in @($result.errors) + @($result.warnings)) { if ($m) { Write-Host "  $($m.code) $($m.file): $($m.message)" } }
    Write-Error "Firefox $edition build failed Mozilla's checks."; exit 1
  }
}

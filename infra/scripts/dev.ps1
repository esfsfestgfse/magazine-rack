[CmdletBinding()]
param(
    [ValidateSet('web', 'api')]
    [string]$Service = 'web'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'apps'))) {
    throw "apps directory not found under $projectRoot"
}

Push-Location $projectRoot
try {
    if ($Service -eq 'web') {
        if (-not (Test-Path -LiteralPath 'apps\web\index.html')) {
            throw 'apps/web/index.html is missing'
        }
        node scripts\serve-web.mjs
    } else {
        if (-not (Test-Path -LiteralPath 'apps\api\wrangler.jsonc')) {
            throw 'apps/api/wrangler.jsonc is missing'
        }
        & npx wrangler dev --config apps/api/wrangler.jsonc --local
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
} finally {
    Pop-Location
}

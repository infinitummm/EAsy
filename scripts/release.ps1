param (
    [string]$Version = "1.0.1"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Lanzamiento de EAsy v$Version" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Comprobar Variable de Entorno
if (-not $env:GH_TOKEN) {
    Write-Warning "AVISO: No se detectó la variable `$env:GH_TOKEN en la sesión actual."
    Write-Warning "Si vas a publicar automáticamente a GitHub, asegúrate de asignarla: `$env:GH_TOKEN='ghp_...'`"
}

# 2. Verificación Estricta de Tipos
Write-Host "`n[1/4] Verificando tipos TypeScript..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en la verificación de tipos TypeScript."
}

# 3. Compilación de Frontend y Backend
Write-Host "`n[2/4] Compilando aplicación con Vite..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en la compilación Vite."
}

# 4. Empaquetado NSIS (Instalador por Usuario)
Write-Host "`n[3/4] Empaquetando instalador NSIS..." -ForegroundColor Yellow
npx electron-builder --win nsis
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en la generación del instalador NSIS."
}

Write-Host "`n✓ Instalador generado en release/EAsy Setup $Version.exe" -ForegroundColor Green

# 5. Publicación en GitHub Releases si GH_TOKEN está presente
if ($env:GH_TOKEN) {
    Write-Host "`n[4/4] Creando release en GitHub..." -ForegroundColor Yellow
    $exePath = "release/EAsy Setup $Version.exe"
    $ymlPath = "release/latest.yml"
    
    if (Test-Path $exePath) {
        gh release create "v$Version" "$exePath" "$ymlPath" `
            --title "EAsy v$Version" `
            --notes "Versión $Version de Itero Local con integración completa OP.GG MCP y LCU sin Riot API requerida." `
            --draft
        Write-Host "✓ Borrador de release v$Version creado con éxito en GitHub." -ForegroundColor Green
    }
} else {
    Write-Host "`n[4/4] Release en GitHub omitido (no se definió GH_TOKEN). Puedes subir release/ manualmente." -ForegroundColor Gray
}

Write-Host "`n¡Proceso de Release completado!" -ForegroundColor Cyan

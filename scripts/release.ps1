param (
    [string]$Version = "1.1.0"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Lanzamiento de EAsy v$Version (Tauri v2)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Comprobar Variable de Entorno
if (-not $env:GH_TOKEN) {
    Write-Warning "AVISO: No se detectó la variable `$env:GH_TOKEN en la sesión actual."
}

# 2. Verificación Estricta de Tipos
Write-Host "`n[1/4] Verificando tipos TypeScript..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en la verificación de tipos TypeScript."
}

# 3. Compilación de Frontend y Backend
Write-Host "`n[2/4] Compilando frontend Vite..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en la compilación Vite."
}

# 4. Compilación Tauri v2 Release
Write-Host "`n[3/4] Compilando instalador nativo Tauri v2 (Rust)..." -ForegroundColor Yellow
npx tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en la compilación de Tauri release."
}

$sourceExe = "src-tauri/target/release/bundle/nsis/EAsy_${Version}_x64-setup.exe"
$destDir = "release"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
if (Test-Path $sourceExe) {
    Copy-Item $sourceExe -Destination "$destDir/EAsy_${Version}_x64-setup.exe" -Force
    Write-Host "`n✓ Instalador generado en release/EAsy_${Version}_x64-setup.exe" -ForegroundColor Green
}

# 5. Publicación en GitHub Releases si GH_TOKEN está presente
if ($env:GH_TOKEN) {
    Write-Host "`n[4/4] Creando release en GitHub..." -ForegroundColor Yellow
    $installerPath = "$destDir/EAsy_${Version}_x64-setup.exe"
    
    if (Test-Path $installerPath) {
        gh release create "v$Version" "$installerPath" `
            --title "EAsy v$Version - Modo Arena, Selector de Hechizos y Validación de APIs" `
            --notes "Versión $Version de EAsy con soporte completo para Modo Arena (overlay de aumentos OP.GG en vivo), selector de hechizos optimizado y validación de claves Riot y Gemini."
        Write-Host "✓ Release v$Version publicado con éxito en GitHub." -ForegroundColor Green
    }
} else {
    Write-Host "`n[4/4] Release en GitHub omitido (no se definió GH_TOKEN). Se puede subir release/ manualmente o via git tag." -ForegroundColor Gray
}

Write-Host "`n¡Proceso de Release completado!" -ForegroundColor Cyan

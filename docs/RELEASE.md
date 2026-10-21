# Guía de Release y Distribución - Itero Local

Procedimiento para compilar, empaquetar y publicar nuevas versiones de **Itero Local** con instalador NSIS y soporte de autoactualización vía GitHub Releases.

---

## 1. Requisitos Previos

1. **Node.js** v20+ y **npm**.
2. **GitHub CLI (`gh`)** instalado y autenticado, o acceso al repositorio en GitHub.
3. **Variable de entorno `GH_TOKEN`**: Tu Personal Access Token (PAT) de GitHub con alcance `repo`.
   > **SEGURIDAD**: NUNCA guardes el token en archivos del repositorio ni lo commitees. Configúralo en tu terminal:
   > ```powershell
   > $env:GH_TOKEN="ghp_tu_token_aqui"
   > ```

---

## 2. Proceso de Empaquetado NSIS

El proyecto está configurado con `electron-builder` en modo por usuario (`perMachine: false`), lo que genera un instalador NSIS que:
- Se instala en `%LOCALAPPDATA%\Programs\Itero Local` sin requerir permisos de Administrador de Windows.
- Crea accesos directos limpios en el Escritorio y Menú Inicio.
- Registra un desinstalador estándar en el Panel de Control.
- Excluye estrictamente bases de datos locales (`itero.db`), claves (`itero.key`) y logs.

### Comando Manual de Compilación
```bash
npm run build
npx electron-builder --win nsis
```
Los archivos de salida se generan en la carpeta `release/`:
- `release/Itero Local Setup 1.0.0.exe` (Instalador principal para tus usuarios).
- `release/latest.yml` (Metadatos para el autoactualizador).

---

## 3. Certificados y Windows SmartScreen

Al ser una aplicación independiente distribuida sin un certificado comercial Extended Validation (EV) de pago (~$300-$500 USD/año), Windows SmartScreen mostrará una advertencia inicial al ejecutar el instalador por primera vez:
> *"Windows protegió su PC"*

Esto es totalmente normal para software open-source independiente. El usuario simplemente debe:
1. Hacer clic en **"Más información"**.
2. Hacer clic en el botón **"Ejecutar de todas formas"**.

Conforme varios usuarios descarguen y ejecuten la app, el filtro SmartScreen de Microsoft incrementa su reputación automáticamente y deja de mostrar la advertencia.

---

## 4. Publicación en GitHub Releases

Para que el autoactualizador (`electron-updater`) detecte la nueva versión, debes subir tanto el instalador `.exe` como el archivo `latest.yml`:

```bash
# Ejemplo con GitHub CLI:
gh release create v1.0.0 ./release/"Itero Local Setup 1.0.0.exe" ./release/latest.yml --title "Itero Local v1.0.0" --notes "Lanzamiento oficial de Itero Local con OP.GG MCP y 100% de datos LCU locales."
```

---

## 5. Script de 1 Comando: `scripts/release.ps1`

Para automatizar todo el flujo de forma segura, ejecuta:

```powershell
.\scripts\release.ps1 -Version "1.0.0"
```
*(El script ejecuta typecheck, Vitest, empaquetado NSIS y genera el borrador de release en GitHub utilizando la variable de entorno `$env:GH_TOKEN`)*.

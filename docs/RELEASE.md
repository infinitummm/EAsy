# Guía de Release y Distribución - EAsy

Procedimiento para compilar, empaquetar y publicar nuevas versiones de **EAsy** con instalador NSIS y soporte de autoactualización vía GitHub Releases.

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
- Se instala en `%LOCALAPPDATA%\Programs\EAsy` sin requerir permisos de Administrador de Windows.
- Crea accesos directos limpios en el Escritorio y Menú Inicio.
- Registra un desinstalador estándar en el Panel de Control.
- Excluye estrictamente bases de datos locales (`itero.db`, `itero.sqlite`), claves (`itero.key`) y logs.

### Comando Manual de Compilación
```bash
npm run build
npx electron-builder --win nsis
```
Los archivos de salida se generan en la carpeta `release/`:
- `release/EAsy Setup 1.0.1.exe` (Instalador principal para tus usuarios).
- `release/latest.yml` (Metadatos para el autoactualizador).

---

## 3. Certificados y Windows SmartScreen

Al ser una aplicación independiente distribuida sin un certificado comercial Extended Validation (EV) de pago, Windows SmartScreen puede mostrar una advertencia inicial al ejecutar el instalador por primera vez:
> *"Windows protegió su PC"*

El usuario simplemente debe:
1. Hacer clic en **"Más información"**.
2. Hacer clic en el botón **"Ejecutar de todas formas"**.

---

## 4. Publicación en GitHub Releases

Para que el autoactualizador (`electron-updater`) detecte la nueva versión, debes subir tanto el instalador `.exe` como el archivo `latest.yml`:

```bash
# Ejemplo con GitHub CLI:
gh release create v1.0.1 ./release/"EAsy Setup 1.0.1.exe" ./release/latest.yml --title "EAsy v1.0.1" --notes "Actualización de EAsy con integración completa OP.GG MCP y LCU."
```

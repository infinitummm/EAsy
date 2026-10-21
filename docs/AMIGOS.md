# Guía Rápida para Amigos - Itero Local

¡Bienvenido a **Itero Local**! Esta guía te explica en 1 minuto cómo instalar la app, qué esperar y qué hacer si encuentras algún problema.

---

## 1. Instalación (Sin Permisos de Administrador)

1. Descarga el archivo de instalación: `Itero Local Setup 1.0.0.exe`.
2. Haz doble clic en el instalador.
3. Se instalará automáticamente en tu carpeta personal (`%LOCALAPPDATA%\Programs\Itero Local`) **sin pedirte permisos de Administrador ni tocar archivos del sistema**.
4. Creará un icono en tu Escritorio y en tu Menú Inicio.

---

## 2. Aviso de Windows SmartScreen ("Windows protegió su PC")

Como Itero Local es una aplicación independiente recién creada y no cuenta con un certificado comercial de pago de miles de dólares, Windows puede mostrar esta ventana azul la primera vez:

```
┌────────────────────────────────────────────────────────┐
│ Windows protegió su PC                                 │
│ Microsoft Defender SmartScreen impidió el inicio de... │
│                                                        │
│ [Más información]                                      │
└────────────────────────────────────────────────────────┘
```

**Cómo continuar:**
1. Haz clic en el enlace azul **"Más información"**.
2. Aparecerá un botón abajo: haz clic en **"Ejecutar de todas formas"**.
3. ¡Listo! Solo te lo preguntará la primera vez.

---

## 3. ¿Cómo Funciona?

- **Abre League of Legends y luego abre Itero Local** (o al revés, no importa el orden).
- Itero Local detectará tu juego automáticamente (verás el estado verde **ONLINE** en la barra lateral).
- **No necesitas ninguna clave de API ni registrarte en ningún sitio**: tu nombre de invocador, nivel, rango y partidas se leen directamente de tu cliente de juego en tu propio ordenador.
- **Auto Pick desactivado por defecto**: por tu seguridad, la app NO bloqueará campeones automáticamente a menos que tú decidas activar esa opción en los Ajustes.
- **Metagame de OP.GG**: en la selección de campeones o en la pestaña "Enfrentamientos", verás las mejores runas, objetos y habilidades del parche actual basadas en miles de partidas de jugadores Esmeralda y superiores. Puedes importar las runas a tu cliente con 1 solo clic.

---

## 4. ¿Algo no funciona? Exporta tu Diagnóstico

Si el cliente no se detecta o experimentas cualquier fallo:
1. Ve a la pestaña **Ajustes & Keys**.
2. Desplázate hasta la sección **"Diagnóstico para Soporte"**.
3. Haz clic en el botón **"Exportar Diagnóstico"**.
4. Se generará un archivo `itero-diagnostic-....json` en tu carpeta de **Descargas**.
5. Envíame ese archivo por Discord o mensaje.

> **100% Privado**: El archivo de diagnóstico redacta automáticamente tu nombre de usuario de Windows (`C:\Users\[USER]`), cualquier contraseña o token, y no envía ninguna telemetría a internet.

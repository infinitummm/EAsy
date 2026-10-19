# Especificación del Proyecto (SPEC.md)

## 1. Visión General
**Itero Local** es una aplicación de escritorio local, monousuario y nativa para Windows, diseñada para jugadores de *League of Legends*. Su propósito es actuar como asistente estratégico inteligente durante la fase de selección de campeón y planificación de partidas, automatizando tareas repetitivas (como el Auto-Accept, selección de runas y hechizos) y proporcionando recomendaciones optimizadas de picks, bans, builds y análisis de enfrentamientos (matchups) mediante Inteligencia Artificial (Google Gemini).

El diseño prioriza la simplicidad, la resiliencia, la ejecución 100% local y el estricto cumplimiento de las políticas de Riot Games.

---

## 2. Principios Rectores y Restricciones Técnicas

1. **100% Local y Sin Servidores Propios:**
   - La aplicación corre exclusivamente en la máquina del usuario final.
   - Base de datos local embebida en **SQLite**.
   - No existen servidores backend, proxies propios ni telemetría externa.
   - Sin modelos de monetización, pagos ni autenticación de usuarios remotos.

2. **Consumo Exclusivo de APIs Gratuitas:**
   - **Google Gemini API (Free Tier):**
     - Motor de inferencia estratégica para matchups, builds situacionales y análisis composicional.
     - Restricciones de cuota gratuitas de Gemini (ej. 15 RPM, 1M TPM, 1,500 RPD en modelos Flash).
     - Requiere cola de peticiones con control de tasa, caché local persistente por versión de parche y reintentos con retroceso exponencial (*exponential backoff*).
   - **Riot Games API (Personal / Development Key):**
     - Endpoints utilizados: `ACCOUNT-V1`, `SUMMONER-V4`, `LEAGUE-V4`, `MATCH-V5`, `CHAMPION-MASTERY-V4`.
     - Límite de tasa de desarrollo: **20 peticiones cada 1 segundo** y **100 peticiones cada 2 minutos**.
     - Manejo estricto de códigos HTTP `429 (Too Many Requests)` y cabecera `Retry-After`.
     - Detección proactiva y notificación al usuario cuando la clave de 24 horas expira (`403 Forbidden`).
   - **Data Dragon & Community Dragon:**
     - Fuentes CDN públicas y gratuitas para campeones, objetos, runas, hechizos, iconos e imágenes.
     - Detección automática del parche actual del juego y almacenamiento local en caché de metadatos e imágenes.

3. **Cumplimiento Estricto con las Políticas de Riot Games:**
   - **Prohibido:**
     - Lectura o escaneo de la memoria RAM del proceso del juego (`League of Legends.exe`).
     - Inyección de DLLs, hooks a DirectX/Vulkan/OpenGL o manipulación de paquetes de red del juego.
     - Automatización de clics, pulsaciones de teclas o macros DENTRO de la partida en curso.
   - **Permitido:**
     - Comunicación exclusiva con el cliente de escritorio mediante la **LCU API** (*League Client Update API*) a través del archivo local `lockfile` y su servidor HTTPS/WSS local (`127.0.0.1`).
     - Operaciones limitadas exclusivamente a la fase previa: Lobby, Búsqueda de partida y Selección de Campeón (*Champ Select*).

4. **Seguridad y Cifrado Local de Credenciales:**
   - Las claves de API (Riot API Key y Gemini API Key) se almacenan localmente cifradas mediante algoritmos simétricos seguros (**AES-256-GCM**) utilizando claves derivadas de credenciales locales de la máquina (DPAPI de Windows o derivación local segura).
   - Nunca se guardan tokens o claves en texto plano.

---

## 3. Módulos y Funcionalidades del Sistema

### 3.1. Conexión LCU (League Client Update)
- **Detección del Proceso y Lockfile:**
  - Monitoreo del proceso oficial de Riot (`LeagueClientUx.exe`).
  - Lectura y decodificación del archivo `lockfile` ubicado en el directorio de instalación de League of Legends:
    `[NombreProceso]:[PID]:[Puerto]:[PasswordAutenticacion]:[Protocolo]`
- **Conexión HTTP Segura:**
  - Comunicación HTTPS con `https://127.0.0.1:[Puerto]` utilizando autenticación Basic Auth (`riot:[PasswordAutenticacion]`).
  - Omisión de la validación del certificado SSL autofirmado de Riot (`rejectUnauthorized: false`).
- **Suscripción WebSocket en Tiempo Real:**
  - Conexión WSS a `wss://127.0.0.1:[Puerto]` con suscripción al evento global de Riot `[5, "OnJsonApiEvent"]`.
  - Escucha de endpoints clave:
    - `/lol-gameflow/v1/gameflow-phase` (Fases: *None, Lobby, Matchmaking, ReadyCheck, ChampSelect, InProgress, WaitingForStats, PreEndOfGame*).
    - `/lol-champ-select/v1/session` (Detalle de la sala de selección).
    - `/lol-summoner/v1/current-summoner` (Invocador activo).
    - `/lol-perks/v1/pages` (Gestión de páginas de runas).
- **Resiliencia:**
  - Reconexión automática cuando el cliente se reinicia o se cierra.
  - Indicador visual claro del estado de conexión en la interfaz (Desconectado, Conectando, Conectado en Lobby, En Selección de Campeón, En Partida).

### 3.2. Auto-Accept (Aceptación Automática de Partidas)
- Detección inmediata del evento `ReadyCheck` (`/lol-matchmaking/v1/ready-check`).
- Interruptor general (Toggle Activar/Desactivar).
- Retardo configurable (*delay*) entre **0 y 8 segundos** antes de enviar la aceptación (`/lol-matchmaking/v1/ready-check/accept`).
- Opción de aleatoriedad humana (ej. fluctuación de ±0.5 segundos) para simular respuesta natural.

### 3.3. Selección de Campeón Inteligente (Champ Select)
- **Detección de Contexto:**
  - Detección automática del rol asignado al jugador: `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`.
  - Identificación de aliados, campeones declarados (*hover*), picks completados y bans realizados.
  - Identificación de campeones enemigos revelados en tiempo real.
- **Auto-Hover & Auto-Pick:**
  - Configuración por rol de listas de prioridad de campeones con lista de alternativas (*fallbacks*) en caso de bloqueo o pick del adversario.
  - Ejecución de preselección (*hover*) y bloqueo final (*pick*) respetando tiempos configurables.
- **Auto-Ban:**
  - Configuración de lista de bans prioritarios por rol.
  - Ban automático en la fase de bloqueo del campeón con mayor prioridad que no haya sido seleccionado para hover por un aliado.
- **Auto-Asignación de Hechizos de Invocador (*Summoner Spells*):**
  - Configuración de combinaciones de hechizos ideales según el rol (ej. Destello + Aplastar para Jungla, Destello + Teleportación para Top) y campeón.
  - Envío automático de la actualización de hechizos a la LCU API.

### 3.4. Sistema de Runas y Builds Optimizadas
- **Inyección Directa de Páginas de Runas:**
  - Creación/sobrescritura automática de una página de runas temporal o dedicada en el cliente oficial mediante `POST /lol-perks/v1/pages` o `PUT /lol-perks/v1/pages/{id}`.
  - Selección exacta de árbol primario, runa clave, 3 runas secundarias mayores, árbol secundario, 2 runas menores y 3 fragmentos de estadísticas (*stat shards*).
- **Esquema de Construcción (Build):**
  - Objetos iniciales recomendados.
  - Orden de construcción central (*Core Build* de 2-3 objetos).
  - Opciones situacionales clasificadas por necesidad (contra armadura/tanques, resistencia mágica, reducción de curaciones, tenacidad, etc.).
  - Orden prioritario de subida de habilidades nivel por nivel (niveles 1 a 18: Q, W, E, R).
- **Generación Basada en Datos y Contexto:**
  - Combinación de datos estadísticos reales de partidas recientes extraídas vía `Match-V5` del parche actual junto a la inferencia analítica de Gemini.

### 3.5. Análisis Táctico de Matchups con Inteligencia Artificial (Gemini)
- **Parámetros de Entrada para la IA:**
  - Campeón del usuario y rol asignado.
  - Campeón adversario directo de línea.
  - Composición completa de aliados y enemigos (campeones seleccionados hasta el momento).
  - Versión del parche de League of Legends actual.
- **Salida Estructurada de la IA (JSON Validado):**
  - Calificación de dificultad del enfrentamiento (escala del 1 al 10).
  - Variaciones recomendadas en runas o fragmentos para el enfrentamiento específico (ej. armadura vs resistencia mágica, tenacidad vs celeridad).
  - Plan de juego en fase temprana (*Early Game*): control de oleadas, nivel de agresión, tradeos en niveles 1-3 y 6, spikes de poder.
  - Amenazas críticas de la composición rival (ej. exceso de daño explosivo AP, cadenas de CC, daño sostenido) y cómo mitigarlas en la build.
- **Caché Multinivel de Enfrentamientos:**
  - Clave de caché: `HASH(campeon_id, rival_id, rol, version_parche)`.
  - Almacenamiento en SQLite para respuestas inmediatas en menos de 50 ms en consultas repetidas sin gastar cuota de Gemini.

### 3.6. Perfil, Estadísticas y Personalización
- **Gestión Multi-Cuenta de Riot ID:**
  - Soporte para agregar múltiples identificadores (`GameName#TagLine`) asociados a su respectiva plataforma/región (ej. `LA1`, `LA2`, `NA1`, `EUW1`, `KR`).
  - Obtención de PUUID, nivel de invocador e historial.
- **Analítica de Historial y Maestría:**
  - Consulta de `Champion-Mastery-V4` para conocer la maestría y puntos del usuario con cada campeón.
  - Descarga y procesamiento de las últimas 20-50 partidas clasificatorias (`Match-V5`).
  - Cálculo de KDA promedio, tasa de victoria (*winrate*), participación en asesinatos (*kill participation*), oro y farm por minuto por campeón y rol.
- **Recomendaciones Basadas en el Historial:**
  - La IA analiza los campeones con mejor rendimiento real del jugador y sugiere picks dentro de su zona de confort que sean eficaces contra el rival.
- **Dashboard Visual:**
  - Visualización del resumen de la cuenta activa, historial reciente, campeones insignia y estadísticas de victoria.

### 3.7. Ajustes, Control de Cuotas y Notificaciones
- Configuración de API Keys con validación en vivo de conectividad.
- Selector de prioridades de campeones, bans y hechizos por rol.
- Ajuste de delays y conmutadores de auto-acciones.
- **Monitor de Cuotas:**
  - Contador estimado de peticiones realizadas a Riot API (1s / 2min) y estado de cola.
  - Contador de consultas realizadas a Gemini API en el día actual.
- **Alerta de Caducidad de Riot Dev Key:**
  - Banner de advertencia prominente cuando una clave de desarrollo está próxima a caducar o ha recibido un código `403 Forbidden`, guiando al usuario a renovarla en el portal de Riot Developer.

---

## 4. Criterios de Aceptación Globales
- La aplicación arranca y funciona sin conexión a ningún servidor externo propietario.
- En caso de caída de internet o falta de API keys, las funciones de LCU (auto-accept, auto-pick, lectura de sesión) continúan operando con datos locales y presets almacenados.
- El sistema no degrada los FPS ni interfiere con la ejecución de *League of Legends*.
- El 100% de los textos, menús y comentarios de código están escritos en español.

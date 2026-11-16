# XONIDU Station — Space Mission Design Game

Sistema profesional de diseño de misiones espaciales con datos reales de clima espacial de la NASA y la NOAA. El jugador diseña una nave, elige órbita y lanzador, selecciona una de nueve misiones y gestiona módulos de estación espacial bajo condiciones reales de clima espacial (tormentas geomagnéticas, llamaradas solares, CME, viento solar, campo magnético, asteroides y red DSN).

---

## Arquitectura del sistema

### Frontend
- **Tecnología:** HTML5, CSS3, JavaScript vanilla (sin frameworks).
- **Menú principal:** `menu/index.html` + `menu/app.js` + `menu/style.css`.
- **Pantallas de módulos:** `module-screen.js` (24 pantallas en zonas A-F).
- **Mapa de estación:** `station-map/index.html` con mapa visual de 6 zonas.

### Backend
- **Tecnología:** Python + Flask.
- **Archivo principal:** `station-backend.py`.
- **Puertos:** HTTP 5000, WebSocket 5001.
- **Configuración persistente:** `game_config.json` (umbrales, scoring, dificultad).
- **Variables de entorno:** `db/.env` (NASA_API_KEY, solo lectura).

### Integración NASA / NOAA (datos reales, no simulados)
El backend consulta APIs reales mediante proxy oculto:

| Fuente | API | Dato |
|--------|-----|------|
| SWPC/NOAA | services.swpc.noaa.gov | Índice Kp geomagnético, alertas de clima espacial |
| DONKI/NASA | ccmc.gsfc.nasa.gov/DONKI-API | CME, llamaradas solares |
| DSCOVR/SWPC | services.swpc.noaa.gov/json/rtsw | Viento solar, campo magnético Bt |
| NASA NeoWs | api.nasa.gov/neo/rest/v1 | Asteroides cercanos a la Tierra |
| NASA DSN | eyes.nasa.gov/dsn/data/dsn.xml | Antenas del espacio profundo |
| ISS | api.wheretheiss.at | Posición de la Estación Espacial Internacional |

**Endpoints del backend:**
- `GET /api/nasa/live` — Todos los valores en vivo en JSON compacto.
- `GET /api/nasa/kp`, `/api/nasa/cme`, `/api/nasa/flr`, `/api/nasa/wind`, `/api/nasa/mag`, `/api/nasa/dsn`, `/api/nasa/neo`, `/api/nasa/alerts`.
- `POST /api/nasa/poll` — Forza actualización manual de datos NASA.
- `GET /api/config`, `POST /api/config` — Lee/escribe configuración en `game_config.json`.

---

## Características principales

### Panel de Datos NASA (menú)
El botón `🔄 Datos NASA` abre un panel con 5 fuentes en vivo:
1. Índice Kp (geomagnetismo) — SWPC/NOAA
2. Velocidad de CME dirigida a la Tierra — DONKI/NASA
3. Última llamarada solar — DONKI/NASA
4. Viento solar (protones) — DSCOVR/SWPC
5. Campo magnético Bt — DSCOVR/SWPC

Cada fuente muestra: **valor actual, hora de la última consulta, estado OK o SIN DATOS**. Si una fuente no responde, nunca se inventan datos.

### Ecuaciones de integración NASA — todas visibles y editables
Desde el panel Métricas se pueden ver y editar todos los umbrales que rigen las reglas de clima espacial:

| Ecuación | Fuente científica | Umbrales editables |
|----------|-------------------|-------------------|
| Radiación Kp | NOAA SWPC (Kp ≥ 5 = tormenta G1) | `kp_warn`, `kp_crit` |
| Llamarada solar | DONKI/NASA (clase M = nivel R1) | `flr_min_class` |
| CME terrestre | DONKI/NASA (solo Earth-directed) | `cme_speed_warn`, `cme_fast_speed` |
| Viento solar | DSCOVR/SWPC (> 600 km/s) | `wind_speed_warn` |
| Campo Bt | DSCOVR/SWPC (> 10 nT) | `mag_bt_warn` |
| Asteroides NeoWs | NASA NeoWs | regla de presencia |
| DSN | NASA DSN | `dsn_min_active` |
| Escalado de fallos | regla interna del juego | `attend_window_sec` |

Cada ecuación muestra su fórmula completa, campos numéricos editables, fuente científica y qué módulos del juego afecta. Los valores se guardan en `game_config.json` y se aplican en el siguiente poll de la NASA (cada 60 s).

### Filtro Earth-direction de CME (sin falsos positivos)
Solo las CME dirigidas a la Tierra se consideran amenaza. El filtro verifica `enlilList[].isEarthGB` e `enlilList[].impactList[].location == "Earth"` en DONKI. Las CME que se alejan se ignoran automáticamente.

### Modo demo (configurable, no automático)
Un toggle en el panel NASA activa/desactiva "umbrales sensibles para mostrar el mecanismo". El operador lo controla desde la interfaz; no se activa por defecto.

### Dificultades y modo simple
- **Fácil:** nave ya diseñada (6/6 sistemas), ocultas métricas/componentes/NASA, menos anomalías.
- **Medio:** 3/6 sistemas listos, umbrales normales.
- **Difícil:** diseñas la nave (0/6), umbrales más estrictos, más anomalías.
- **Modo simple (fácil):** solo misiones, selector de órbita, selector de vehículo e iniciar misión.

---

## Validación del sistema

Existe un validador independiente que:

- Lee `NASA_API_KEY` desde `db/.env` (solo lectura, no modifica nada del juego).
- Consulta las mismas URLs de la NASA que el backend.
- Verifica el filtro Earth-direction de CME.
- Verifica las 9 misiones, 6 zonas, 27 módulos y 24 pantallas HTML.
- Reporta NULL cuando una fuente no responde (nunca "OK" con datos vacíos).

**Resultado: 5/5** — todas las 8 fuentes respondieron con datos reales, sin falsos positivos de CME, estado global correcto.

---

## Despliegue en producción (sin túnel)

- **Servidor:** VPS con IP pública directa.
- **Stack:** Flask + Gunicorn + Nginx + Certbot/Let's Encrypt.
- **Puerto HTTP:** 5000 (detrás de Nginx en 80/443).
- **SSL:** Certbot con renovación automática.
- **No se usa túnel:** acceso directo por IP pública.
- **Firewall:** ufw, solo SSH (22), HTTP (80) y HTTPS (443) abiertos.

---

## Estructura de archivos

```
station_xonidu/
├── menu/
│   ├── index.html      # Pantalla del menú principal
│   ├── app.js          # Lógica del menú, panel NASA, métricas, ecuaciones
│   ├── style.css       # Estilos del menú
│   └── menu.png        # Imagen de fondo del menú
├── station-backend.py  # Backend Flask (HTTP 5000, WebSocket 5001)
├── game_config.json    # Configuración persistente (umbrales, scoring)
├── db/.env             # NASA_API_KEY (solo lectura, no subir a git)
├── module-screen.js    # Lógica de pantallas de módulos (24 pantallas)
├── station-map/
│   ├── index.html      # Mapa visual de la estación
│   └── style.css       # Estilos del mapa
└── zone-*/modulos/*.html  # 24 pantallas de módulos (zonas A-F)
```

---

## Variables de entorno requeridas

| Variable | Descripción | Archivo |
|----------|-------------|---------|
| `NASA_API_KEY` | Clave de API de NASA (para NeoWs) | `db/.env` |

---

## Comandos útiles

- Iniciar backend: `python3 station-backend.py`
- Ejecutar validador: `python3 validar_xonidu_sistema.py`

---

## Modelo de precios (mensual)

| Plan | Precio | Dispositivos | Uso |
|------|--------|--------------|-----|
| Demo | $6–12 | 20–30 | Aula pequeña, demostración |
| Producción | $31–36 | 50–100 | Operación estándar |
| Escala | $50–80 | 100+ | Despliegue masivo |
# XONIDU Station — Space Mission Design Game

Juega ahora: **https://station.xonidu.com**

Xonidu Station es un videojuego de diseño de misiones espaciales. Operas la estación espacial Xonidu: eliges una misión, una órbita y un vehículo de lanzamiento, y gestionas recursos limitados mientras eventos reales amenazan tu misión.

Hecho por el equipo Xonidu para el NASA Space Apps Challenge 2026, reto Space Mission Design Game, evento local de Puerto Vallarta. El equipo recibió una Mención Honorífica en Best Mission Concept.

Proyecto en Space Apps: https://www.spaceappschallenge.org/2026/find-a-team/xonidu/?tab=project

## Cómo se juega

- Elige una de 9 misiones: reparación de satélites, captura de carga con el brazo robótico, caminatas espaciales (EVA), despliegue de CubeSats, ciencia en microgravedad, observación de la Tierra, pruebas de tecnología para la Luna y Marte, extensión de vida de satélites y observación astronómica.
- Elige una órbita: LEO, GEO, polar, heliosíncrona o heliocéntrica.
- Elige un lanzador: Falcon 9, Atlas V o Ariane 5.
- Diseña tu nave con 6 sistemas (nave, instrumentos científicos, energía, comunicaciones, control térmico y propulsión) que mueven MASA, ENERGÍA, PRESUPUESTO, DATOS y COMBUSTIBLE.
- Gestiona la estación: 6 zonas y 27 módulos. Cada módulo es una mini web que se abre en pantalla completa. Cuando un módulo entra en advertencia o en estado crítico, su zona parpadea en el mapa y tienes que atenderlo antes de que empeore.
- Una misión dura de 1 a 30 días en el reloj de la estación, y cada día toma de 1 a 3 minutos reales según la dificultad.
- Dificultad: Fácil (eventos simulados, 2 pasos de reparación, sin penalización), Medio (3 pasos) y Difícil (mecánicas completas, diagnóstico con penalización y secuencia en fallos críticos).

## Datos reales de NASA y NOAA

En modo Medio y Difícil, las anomalías vienen de datos en vivo, no de un guion. En modo Fácil los eventos son simulados.

| Fuente | Dato | Uso en el juego |
|--------|------|-----------------|
| SWPC / NOAA | Índice Kp geomagnético y alertas | Radiación y comunicaciones |
| DONKI / NASA | CME y llamaradas solares | Energía, radiación y comunicaciones |
| DSCOVR / SWPC | Viento solar y campo magnético Bt | Comunicaciones y radiación |
| NASA NeoWs | Asteroides cercanos a la Tierra | Navegación y estructura |
| NASA DSN | Estado de las antenas del espacio profundo | Comunicaciones |
| NASA APOD | Foto astronómica del día | Contenido del juego |

El botón Datos NASA del menú muestra las fuentes en vivo con su valor actual, hora de consulta y estado. Si una fuente no responde, nunca se inventan datos.

Solo las CME dirigidas a la Tierra se consideran amenaza: el filtro verifica `enlilList[].isEarthGB` y la lista de impactos en DONKI. Las CME que se alejan se ignoran.

## Arquitectura

- **Frontend:** HTML5, CSS3, JavaScript vanilla (sin frameworks). Menú principal en `menu/`, mapa de la estación en `station-map/`, 27 módulos en `zone-a/` a `zone-f/`, lógica compartida en `store.js`, `missions.js` y `module-screen.js`.
- **Backend:** Python con `http.server` de la librería estándar + `websockets` (`station-backend.py`). HTTP en el puerto 5000, WebSocket en el 5001.
- El backend es un proxy único para los datos en vivo, con caché de 10 minutos. La clave de NASA vive solo en el backend, nunca en el frontend.
- Si el WebSocket no está disponible, el juego usa HTTP polling (`POST /api/module`) para el estado y las reparaciones.
- **Despliegue:** Render (plan gratuito) en https://station.xonidu.com, con dominio personalizado por CNAME en Cloudflare.

Endpoints del backend:

- `GET /api/nasa/live` — Todos los valores en vivo en JSON compacto.
- `GET /api/nasa/kp`, `/api/nasa/cme`, `/api/nasa/flr`, `/api/nasa/wind`, `/api/nasa/mag`, `/api/nasa/dsn`, `/api/nasa/neo`, `/api/nasa/alerts`.
- `POST /api/nasa/poll` — Fuerza una actualización manual de datos NASA.
- `GET /api/config`, `POST /api/config` — Lee y escribe la configuración (umbrales, puntuación, dificultad).

## Correr en local

```bash
python station-backend.py
```

Abre http://localhost:5000

Opcional: crea `db/.env` con tu clave:

```
NASA_API_KEY=tu_clave_de_api.nasa.gov
```

Solo NeoWs y APOD necesitan la clave. Sin clave, el juego usa `DEMO_KEY` y el resto de las fuentes sigue en vivo. Nunca subas `db/.env` a git.

## Despliegue en Render

- Build Command: `pip install -r requirements.txt`
- Start Command: `python station-backend.py`
- El backend lee el puerto de la variable de entorno `PORT`.
- Dominio personalizado: registro CNAME `station` apuntando a `xonidu-station.onrender.com`, en modo DNS only.

## Estructura

```
station_xonidu/
├── station-backend.py   # Backend (HTTP 5000, WebSocket 5001)
├── requirements.txt     # Dependencias de Python
├── menu/                # Pantalla del menú principal
├── station-map/         # Mapa visual de la estación
├── zone-a/ ... zone-f/  # Zonas y módulos del juego
├── module-screen.js     # Lógica de pantallas de módulos
├── missions.js          # Misiones, órbitas y lanzadores
└── store.js             # Estado compartido del juego
```

`game_config.json` y `db/.env` son archivos locales y no están en el repositorio.

## Equipo

- Darian Alberto Camacho Salas — Team Owner, backend, base de datos, seguridad, despliegue
- Oscar Gutiérrez Plata
- Raul Arteaga Rodriguez
- Oscar Rodolfo Barragán Pérez
- Braulio Mauricio Anaya Mendez
- Wendy Génesis Ashlan Hernández Hernández

## Herramientas de Super Inteligencia

Muse (asistente de Meta AI) y Claude, para código, arquitectura, redacción y revisión.

## Notas

- Los datos de la NASA y la NOAA son gratuitos y públicos. Usarlos no implica respaldo de la NASA.

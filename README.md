# XONIDU Station — Space Mission Design Game

Juego de estación espacial para el hackathon NASA Space Apps 2026. El jugador diseña una misión espacial: elige objetivo, órbita y lanzador, luego atiende módulos de la estación en tiempo real usando datos reales de la NASA (clima espacial, tormenta geomagnética, llamaradas solares, CME, red DSN y asteroides cercanos).

## Estructura del proyecto

```
station_xonidu/
├── station-backend.py      # Servidor HTTP + WebSocket en puerto 5000
├── store.js                # Estado compartido de módulos (localStorage + backend)
├── missions.js             # 9 misiones, órbitas y lanzadores
├── module-screen.js        # Pantalla de detalle de módulos
├── .gitignore              # Ignora .env, db/, __pycache__, *.log, etc.
├── db/                     # Base de datos local para pruebas (ignorada en git)
├── menu/                   # Menú principal (objetivos, órbita, lanzador, idioma)
│   ├── index.html
│   ├── app.js
│   └── style.css
├── station-map/            # Mapa de zonas de la estación
│   └── index.html
├── zone-a/ ... zone-f/     # Zonas de la estación con módulos SVG
│   ├── index.html
│   └── app.js
└── README.md
```

## Cómo ejecutar

### Requisitos
- Python 3
- `pip install -r requirements.txt` (supabase-py, websockets)

### Iniciar el backend
```bash
cd /home/albert/xonidu/station_xonidu
python3 station-backend.py
```

El servidor HTTP sirve en `http://localhost:5000/` y el WebSocket en `ws://localhost:5001/`.

### Abrir el juego
Navega a `http://localhost:5000/menu/index.html`. El juego empieza obligatoriamente en el menú.

## Flujo del juego

1. **Menú**: Elige idioma (Español/Inglés), objetivo de misión (9 disponibles), órbita y lanzador. Configura duración y dificultad.
2. **Mapa de la estación**: Ves las 6 zonas con su estado (ok/warn/crit).
3. **Zonas**: Haz clic en los módulos parpadeantes para atenderlos antes de que escalen a crítico.
4. **Datos NASA en vivo**: El panel de métricas del menú muestra Kp, llamaradas, CME y estaciones DSN en tiempo real. Usa el botón "Actualizar datos NASA" para forzar una consulta manual.

## Endpoints de la NASA (datos reales)

El backend hace proxy a APIs reales de la NASA con llave oculta (lee de `db/.env`, variable `NASA_API_KEY`):

| Endpoint | Fuente | Descripción |
|---|---|---|
| `GET /api/nasa/kp` | SWPC | Índice K planetario (tormentas geomagnéticas) |
| `GET /api/nasa/flr` | DONKI | Llamaradas solares |
| `GET /api/nasa/cme` | DONKI | Eyecciones de masa coronal |
| `GET /api/nasa/dsn` | NASA DSN | Red de espacio profundo |
| `GET /api/nasa/neo` | NeoWs | Asteroides cercanos a la Tierra |
| `GET /api/nasa/alerts` | SWPC | Alertas de clima espacial |
| `GET /api/nasa/live` | Todas | Resumen compacto de todos los datos |
| `GET /api/nasa/poll` | Todas | Forzar procesamiento inmediato de eventos NASA |

El backend hace polling automático cada 60 segundos y aplica los eventos a los módulos de la estación:
- **Kp >= 5**: módulos de radiación a `warn`; **Kp >= 7**: a `crit`
- **Llamaradas M/X**: degradan comunicaciones y salud en EVA
- **CME > umbral**: degradan módulos de energía
- Los módulos en `warn` sin atender escalan a `crit` tras el tiempo de revisión

## Configuración

Desde el menú, botón **Métricas**:
- Umbrales de alerta: Kp warn/crit, velocidad mínima de CME, antigüedad máxima de eventos, tiempo para atender
- Scoring: puntaje base, encaje de órbita y lanzador, penalizaciones, bonus

Los valores se guardan en `game_config.json` (backend) y en `localStorage`.

## Idioma

Botón **Idioma** en la esquina superior izquierda del menú: Español / Inglés. Se recuerda en `localStorage`.

## GitHub

Repositorio: `github.com/XONIDU/station_xonidu.git`

El `.gitignore` ignora `.env`, `db/`, `__pycache__`, `*.log`, `.DS_Store`, `.vscode/`, `.idea/` y `test-appjs.html`. No subir el archivo `.env` (contiene la llave de la NASA).

## Notas para el hackathon

- Datos reales de la NASA, no simulados.
- El juego empieza obligatoriamente en el menú (no acceso directo a zonas).
- Backend en puerto 5000, WebSocket en 5001.
- Tunnel Cloudflare opcional para demo remota.
# XONIDU Station — Space Mission Design Game

Play now: **https://station.xonidu.com**

Xonidu Station is a space mission design video game. You operate the Xonidu space station: you choose a mission, an orbit and a launch vehicle, and you manage limited resources while real events threaten your mission.

Built by Team Xonidu for the NASA Space Apps Challenge 2026, Space Mission Design Game challenge, Puerto Vallarta Local Event. The team received an Honorable Mention in Best Mission Concept.

Space Apps project: https://www.spaceappschallenge.org/2026/find-a-team/xonidu/?tab=project

## How to play

- Pick one of 9 missions: satellite servicing, cargo capture with the robotic arm, EVA spacewalks, CubeSat deployment, microgravity science, Earth observation, Moon and Mars technology tests, satellite life extension, and astronomical observation.
- Pick an orbit: LEO, GEO, polar, Sun-synchronous or heliocentric.
- Pick a launch vehicle: Falcon 9, Atlas V or Ariane 5.
- Design your spacecraft with 6 systems (spacecraft, science instruments, power, communications, thermal control and propulsion) that move MASS, POWER, BUDGET, DATA and FUEL.
- Run the station: 6 zones and 27 modules. Each module is a mini web that opens fullscreen. When a module goes into warning or critical state, its zone blinks on the map and you have to attend it before it gets worse.
- A mission lasts 1 to 30 days on the station clock, and each day takes 1 to 3 real minutes depending on difficulty.
- Difficulty: Easy (simulated events, 2 repair steps, no penalty), Medium (3 steps) and Hard (full mechanics, diagnosis with penalty and sequence on critical failures).

## Live NASA and NOAA data

On Medium and Hard, anomalies come from live data, not from a script. On Easy the events are simulated.

| Source | Data | Used for |
|--------|------|----------|
| SWPC / NOAA | Geomagnetic Kp index and alerts | Radiation and communications |
| DONKI / NASA | CMEs and solar flares | Energy, radiation and communications |
| DSCOVR / SWPC | Solar wind and magnetic field Bt | Communications and radiation |
| NASA NeoWs | Near-Earth asteroids | Navigation and structure |
| NASA DSN | Deep Space Network antenna status | Communications |
| NASA APOD | Astronomy Picture of the Day | In-game content |

The Datos NASA button in the menu shows the live sources with their current value, query time and status. If a source fails, data is never invented.

Only Earth-directed CMEs count as a threat: the filter checks `enlilList[].isEarthGB` and the impact list in DONKI. CMEs heading away are ignored.

## Architecture

- **Frontend:** HTML5, CSS3, vanilla JavaScript (no frameworks). Main menu in `menu/`, station map in `station-map/`, 27 modules in `zone-a/` to `zone-f/`, shared logic in `store.js`, `missions.js` and `module-screen.js`.
- **Backend:** Python with the standard library `http.server` + `websockets` (`station-backend.py`). HTTP on port 5000, WebSocket on port 5001.
- The backend is a single proxy for live data, with a 10-minute cache. The NASA API key lives only in the backend, never in the frontend.
- When the WebSocket is not available, the game uses HTTP polling (`POST /api/module`) for state and repairs.
- **Deployment:** Render (free plan) at https://station.xonidu.com, with a custom domain via CNAME on Cloudflare.

Backend endpoints:

- `GET /api/nasa/live` — All live values in compact JSON.
- `GET /api/nasa/kp`, `/api/nasa/cme`, `/api/nasa/flr`, `/api/nasa/wind`, `/api/nasa/mag`, `/api/nasa/dsn`, `/api/nasa/neo`, `/api/nasa/alerts`.
- `POST /api/nasa/poll` — Forces a manual NASA data refresh.
- `GET /api/config`, `POST /api/config` — Read and write configuration (thresholds, scoring, difficulty).

## Run locally

```bash
python station-backend.py
```

Open http://localhost:5000

Optional: create `db/.env` with your key:

```
NASA_API_KEY=your_key_from_api.nasa.gov
```

Only NeoWs and APOD need the key. Without a key, the game uses `DEMO_KEY` and the other sources stay live. Never commit `db/.env` to git.

## Deploy on Render

- Build Command: `pip install -r requirements.txt`
- Start Command: `python station-backend.py`
- The backend reads the port from the `PORT` environment variable.
- Custom domain: CNAME record `station` pointing to `xonidu-station.onrender.com`, DNS only.

## Structure

```
station_xonidu/
├── station-backend.py   # Backend (HTTP 5000, WebSocket 5001)
├── requirements.txt     # Python dependencies
├── menu/                # Main menu screen
├── station-map/         # Visual station map
├── zone-a/ ... zone-f/  # Game zones and modules
├── module-screen.js     # Module screen logic
├── missions.js          # Missions, orbits and launchers
└── store.js             # Shared game state
```

`game_config.json` and `db/.env` are local files and are not in the repository.

## Team

- Darian Alberto Camacho Salas — Team Owner, backend, database, security, deployment
- Oscar Gutiérrez Plata
- Raul Arteaga Rodriguez
- Oscar Rodolfo Barragán Pérez
- Braulio Mauricio Anaya Mendez
- Wendy Génesis Ashlan Hernández Hernández

## Super Intelligence tools

Muse (Meta AI assistant) and Claude, for code, architecture, writing and review.

## Notes

- NASA and NOAA data is free and public. Using it does not imply NASA endorsement.

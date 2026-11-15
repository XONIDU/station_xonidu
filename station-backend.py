#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Backend de la estacion espacial.

Lanza menu/index.html como servidor web estatico en el puerto 5000 y
expone un WebSocket en el puerto 5001 para sincronizar el estado de zonas y
modulos en tiempo real entre todas las paginas abiertas.

Tambien expone endpoints proxy de la NASA (puerto 5000) con la llave oculta
en .env y caché breve para no saturar las peticiones:
    GET /api/nasa/neo      -> NeoWs asteroides cercanos
    GET /api/nasa/kp       -> SWPC Indice K planetario
    GET /api/nasa/alerts   -> SWPC Alertas de clima espacial
    GET /api/nasa/cme      -> DONKI Eyecciones de Masa Coronal
    GET /api/nasa/flr      -> DONKI Llamaradas solares

Tambien abre un tunel Cloudflare (cloudflared) para exponer el servidor a
internet, igual que hace XONINAS.

Uso:
    python3 station-backend.py

Estado:
    zonas:  { "A": "ok|warn|crit", ... }      -> mapa principal (station-map)
    modulos:{ "b": {"food":"ok",...}, ... }   -> paginas de zona (zone-b, etc.)

Cuando cualquier cliente cambia un estado, el servidor lo aplica y lo reenvia
a todos los clientes conectados para que cada pagina se actualice al instante
(color amarillo = anomalia, rojo parpadeante = critico).

Presiona Ctrl+C para detener.
"""

import asyncio
import http.server
import json
import os
import re
import signal
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

import websockets


def _utcnow():
    """Ahora en UTC (naive, como lo usaba datetime.utcnow(), ya deprecado)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

# ---------------------------------------------------------------------------
# Supabase (opcional: se activa si hay credenciales en el entorno)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
_supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Supabase] Cliente inicializado")
    except Exception as e:
        print(f"[Supabase] No se pudo inicializar: {e}")
        _supabase = None


def supabase_table(table: str):
    if _supabase is None:
        return None
    return _supabase.table(table)

WEB_DIR = Path(__file__).resolve().parent  # /home/albert/xonidu/nasa/
HTTP_PORT = 5000
WS_PORT = 5001

# ---------------------------------------------------------------------------
# Estado compartido de la estacion
# ---------------------------------------------------------------------------
STATE = {
    "zonas": {z: "ok" for z in "ABCDEF"},
    "modulos": {
        "a": {"habitability": "ok", "health": "ok", "eclss": "ok", "fire": "ok", "radiation": "ok"},
        "b": {"food": "ok", "thermal": "ok", "energy": "ok", "fire": "ok"},
        "c": {"eclss": "ok", "energy": "ok", "thermal": "ok", "command": "ok"},
        "d": {"command": "ok", "navigation": "ok", "comms": "ok", "robotics": "ok"},
        "e": {"structure": "ok", "robotics-eva": "ok", "fire": "ok"},
        "f": {"energy": "ok", "thermal": "ok", "comms": "ok", "science": "ok", "structure": "ok", "propulsion": "ok", "radiation": "ok"},
    },
}

VALID_STATUSES = {"ok", "warn", "crit"}

# ---------------------------------------------------------------------------
# Configuracion del juego (metricas, algoritmos, ecuaciones)
# ---------------------------------------------------------------------------
# La config vive en game_config.json (junto a este script) y se puede ver y
# cambiar desde el boton "Metrics" del menu (GET/POST /api/config). Los
# valores por defecto son los del diseno del juego; el menu los edita.
DEFAULT_GAME_CONFIG = {
    # Dificultad de la partida (configuracion inicial del menu)
    "difficulty": "medio",   # facil | medio | dificil
    "mission_days": 5,       # duracion de la mision en dias
    "min_per_day": 2,        # minutos reales por dia de mision
    "flr_min_class": "M",    # clase minima de llamarada que genera alerta (M o C)
    # Umbrales de alerta (datos reales de la NASA)
    "kp_warn": 5,            # Kp >= 5 -> radiacion warn (tormenta geomagnetica)
    "kp_crit": 7,            # Kp >= 7 -> radiacion crit
    "cme_speed_warn": 350,   # km/s: CME mas rapida -> energia warn
    "event_fresh_hours": 96, # antiguedad maxima de un evento FLR/CME para aplicarlo
    "attend_window_min": 5,  # minutos en warn sin atender antes de escalar a crit
    # Scoring de mision (lo calcula el menu)
    "score_base": 100,
    "orbit_fit": 20, "orbit_miss": -15,
    "launcher_fit": 10, "launcher_miss": -10,
    "mass_penalty": -20, "budget_penalty": -10,
    "complete_bonus": 200, "complete_bonus_hard": 300,
    "data_bonus": 40,
}
GAME_CONFIG = dict(DEFAULT_GAME_CONFIG)
CONFIG_PATH = Path(__file__).resolve().parent / "game_config.json"

# Presets de dificultad: 5 dias siempre; a mas dificultad, mas minutos por dia
# (la partida dura mas) y umbrales mas sensibles -> aparecen MAS fallos reales
# de la NASA (Kp mas bajo, CME mas lenta, llamaradas clase C tambien alertan)
# y menos tiempo para atenderlas antes de que escalen a crit.
DIFFICULTY_PRESETS = {
    "facil":   {"mission_days": 5, "min_per_day": 1, "kp_warn": 5, "kp_crit": 7,
                "cme_speed_warn": 350, "flr_min_class": "M", "attend_window_min": 10,
                "event_fresh_hours": 24},
    "medio":   {"mission_days": 5, "min_per_day": 2, "kp_warn": 5, "kp_crit": 7,
                "cme_speed_warn": 350, "flr_min_class": "M", "attend_window_min": 5,
                "event_fresh_hours": 96},
    "dificil": {"mission_days": 5, "min_per_day": 3, "kp_warn": 4, "kp_crit": 6,
                "cme_speed_warn": 300, "flr_min_class": "C", "attend_window_min": 2,
                "event_fresh_hours": 120},
}


def apply_difficulty(name):
    """Aplica un preset de dificultad a GAME_CONFIG y lo guarda. Devuelve True/False."""
    preset = DIFFICULTY_PRESETS.get(name)
    if not preset:
        return False
    GAME_CONFIG["difficulty"] = name
    GAME_CONFIG.update(preset)
    save_game_config()
    return True


# ---------------------------------------------------------------------------
# Reloj de mision: la partida dura mission_days dias; cada dia son
# min_per_day minutos reales. Arranca con START MISSION (POST /api/mission/start).
# ---------------------------------------------------------------------------
MISSION = {"active": False, "start": None, "difficulty": "medio",
           "days": 5, "min_per_day": 2, "objetivo": None, "orbita": None,
           "lanzador": None}


def mission_status():
    """Estado del reloj de mision: dia actual, minutos restantes, si termino."""
    if not MISSION["active"] or not MISSION["start"]:
        return {"active": False, "difficulty": MISSION["difficulty"],
                "day": 0, "days_total": MISSION["days"],
                "min_per_day": MISSION["min_per_day"],
                "minutes_elapsed": 0,
                "minutes_total": MISSION["days"] * MISSION["min_per_day"],
                "minutes_left": MISSION["days"] * MISSION["min_per_day"],
                "finished": False, "objetivo": MISSION["objetivo"],
                "orbita": MISSION["orbita"], "lanzador": MISSION["lanzador"]}
    total = MISSION["days"] * MISSION["min_per_day"]
    elapsed = (_utcnow() - MISSION["start"]).total_seconds() / 60.0
    day = int(elapsed // MISSION["min_per_day"]) + 1
    finished = day > MISSION["days"]
    return {"active": True, "difficulty": MISSION["difficulty"],
            "day": min(day, MISSION["days"]), "days_total": MISSION["days"],
            "min_per_day": MISSION["min_per_day"],
            "minutes_elapsed": round(elapsed, 1), "minutes_total": total,
            "minutes_left": round(max(0.0, total - elapsed), 1),
            "finished": finished, "objetivo": MISSION["objetivo"],
            "orbita": MISSION["orbita"], "lanzador": MISSION["lanzador"]}


def load_game_config():
    """Lee game_config.json si existe (el menu lo escribe con POST /api/config)."""
    global GAME_CONFIG
    try:
        if CONFIG_PATH.exists():
            saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                for k, v in saved.items():
                    if k in DEFAULT_GAME_CONFIG and isinstance(v, (int, float, str)):
                        GAME_CONFIG[k] = v
                print(f"[config] game_config.json cargado ({len(saved)} valores)")
    except Exception as e:
        print(f"[config] no se pudo leer game_config.json: {e}")


def save_game_config():
    try:
        CONFIG_PATH.write_text(json.dumps(GAME_CONFIG, indent=2), encoding="utf-8")
        return True
    except Exception as e:
        print(f"[config] no se pudo guardar game_config.json: {e}")
        return False


# ---------------------------------------------------------------------------
# Estado de eventos NASA en vivo (juego real, sin simulaciones)
# ---------------------------------------------------------------------------
# EVENT_STATE: event_id -> {"modules": [(zona, slug)], "level": "warn"}
#   Eventos discretos (FLR/CME) que estan vigentes ahora mismo.
# KP_EPISODE: time_tag de la lectura Kp que inicio la tormenta actual (o None).
# ATTENDED: claves "zona.slug" que el jugador ya atendio (clic en el modulo)
#   durante el evento/episodio vigente; el poll no las vuelve a subir.
# WARN_SINCE: "zona.slug" -> datetime en que el modulo paso a warn (escalado).
EVENT_STATE = {}
KP_EPISODE = None
ATTENDED = set()
WARN_SINCE = {}

RANK = {"ok": 0, "warn": 1, "crit": 2}


def _set_module_state(zona, slug, nivel):
    """Aplica un nivel a un modulo y mantiene WARN_SINCE. Devuelve True si cambio."""
    mods = STATE["modulos"].get(zona, {})
    if slug not in mods:
        return False
    cur = mods[slug]
    if cur == nivel:
        return False
    mods[slug] = nivel
    key = f"{zona}.{slug}"
    if nivel == "warn":
        WARN_SINCE.setdefault(key, _utcnow())
    elif nivel == "ok":
        WARN_SINCE.pop(key, None)
    return True


def _parse_nasa_time(s):
    """Parsea una fecha ISO de la NASA (con Z o sin) a datetime UTC naive."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _is_fresh(ts, hours):
    t = _parse_nasa_time(ts)
    if not t:
        return False
    return (_utcnow() - t).total_seconds() <= hours * 3600


def _escalate_unattended():
    """Un modulo en warn que nadie atiende (clic) en attend_window_min pasa a crit."""
    window = GAME_CONFIG.get("attend_window_min", 5)
    now = _utcnow()
    for zona, mods in STATE["modulos"].items():
        for slug, nivel in mods.items():
            if nivel != "warn":
                continue
            since = WARN_SINCE.get(f"{zona}.{slug}")
            if since and (now - since).total_seconds() >= window * 60:
                _set_module_state(zona, slug, "crit")
                print(f"[NASA] Escalado {zona}.{slug} warn -> crit (sin atender {window} min)")

# ---------------------------------------------------------------------------
# Proxy de APIs de la NASA (llave oculta, caché breve)
# ---------------------------------------------------------------------------
NASA_ENV_FILE = Path(__file__).resolve().parent / "db" / ".env"
NASA_API_KEY = None
if NASA_ENV_FILE.exists():
    for _line in NASA_ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            if _k.strip() == "NASA_API_KEY":
                NASA_API_KEY = _v.strip()

# Caché: {url: (data, expiry_timestamp)}
NASA_CACHE = {}
NASA_CACHE_TTL_SECONDS = 600  # 10 minutos


def nasa_fetch(url: str, timeout: int = 20):
    """Consulta una API de la NASA con la llave oculta y caché breve."""
    now = time.time()
    if url in NASA_CACHE:
        data, expiry = NASA_CACHE[url]
        if now < expiry:
            return data
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "XONIDU-Backend/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[NASA] Error consultando {url}: {e}")
        return None
    NASA_CACHE[url] = (data, now + NASA_CACHE_TTL_SECONDS)
    return data


def nasa_url(path: str) -> str:
    """Construye URL completa con la llave de la NASA si es necesario."""
    if "api.nasa.gov" in path and "api_key=" not in path:
        sep = "&" if "?" in path else "?"
        return path + sep + f"api_key={NASA_API_KEY}" if NASA_API_KEY else path
    return path


def nasa_neo():
    hoy = _utcnow().date()
    inicio = hoy - timedelta(days=7)
    url = (
        "https://api.nasa.gov/neo/rest/v1/feed"
        f"?start_date={inicio}&end_date={hoy}"
    )
    return nasa_fetch(nasa_url(url))


def nasa_kp():
    return nasa_fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json")


def nasa_alerts():
    return nasa_fetch("https://services.swpc.noaa.gov/products/alerts.json")


def nasa_cme():
    hoy = _utcnow().date()
    inicio = hoy - timedelta(days=7)
    url = (
        "https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME"
        f"?startDate={inicio}&endDate={hoy}"
    )
    return nasa_fetch(nasa_url(url))


def nasa_flr():
    hoy = _utcnow().date()
    inicio = hoy - timedelta(days=7)
    url = (
        "https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR"
        f"?startDate={inicio}&endDate={hoy}"
    )
    return nasa_fetch(nasa_url(url))


def nasa_wind():
    """Viento solar en vivo (DSCOVR via SWPC RTSW), sin llave."""
    return nasa_fetch("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json")


def nasa_mag():
    """Campo magnetico en vivo (DSCOVR via SWPC RTSW), sin llave."""
    return nasa_fetch("https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json")


def nasa_dsn():
    """Estado en vivo de la red DSN (antenas, naves, tasas de datos), sin llave.
    Lee el feed XML que usa la propia pagina de DSN Now y lo devuelve como JSON."""
    try:
        req = urllib.request.Request(
            "https://eyes.nasa.gov/dsn/data/dsn.xml",
            headers={"User-Agent": "XONIDU-Backend/1.0"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
    except Exception as e:
        print(f"[NASA] Error consultando DSN: {e}")
        return None
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(raw)
        stations = []
        for st in root.findall("station"):
            dishes = []
            for dish in st.findall("dish"):
                target = dish.find("target")
                down = dish.find("downSignal")
                dishes.append({
                    "name": dish.get("name"),
                    "activity": dish.get("activity"),
                    "azimuth": dish.get("azimuthAngle"),
                    "elevation": dish.get("elevationAngle"),
                    "spacecraft": target.get("name") if target is not None else None,
                    "dataRate": down.get("dataRate") if down is not None else None,
                    "band": down.get("band") if down is not None else None,
                })
            stations.append({
                "name": st.get("name"),
                "friendlyName": st.get("friendlyName"),
                "dishes": dishes,
            })
        return {"stations": stations}
    except Exception as e:
        print(f"[NASA] Error parseando DSN XML: {e}")
        return None


def nasa_live():
    """Valores REALES en vivo de la NASA, en un solo JSON compacto.

    Lo usan las mini-webs de los modulos para mostrar metricas con valores
    reales (reto 13: el juego se apega a la realidad, nada simulado).
    Cada valor trae su fuente. Si una fuente falla, ese campo queda en
    null: no se inventa ningun numero. Usa las mismas funciones con cache
    de 10 min que el resto del backend, salvo la posicion de la ISS, que
    se consulta directa (5 s de timeout) para que no salga desactualizada.
    """
    out = {
        "kp": None, "kp_time": None,
        "cme_speed": None, "cme_time": None,
        "flare": None, "flare_time": None,
        "solar_wind": None, "wind_time": None,
        "mag_bt": None, "mag_time": None,
        "dsn_stations": None, "dsn_dishes": None,
        "neo_count": None, "alerts": None,
        "iss_lat": None, "iss_lon": None, "iss_alt": None,
    }
    try:
        kp_data = nasa_kp()
        if kp_data and isinstance(kp_data, list) and kp_data:
            u = kp_data[-1]
            out["kp"] = float(u.get("Kp", 0) or 0)
            out["kp_time"] = u.get("time_tag")
    except Exception:
        pass
    try:
        cme_data = nasa_cme()
        if cme_data and isinstance(cme_data, list):
            for ev in sorted(cme_data, key=lambda e: str(e.get("startTime", "")), reverse=True):
                analyses = ev.get("cmeAnalyses") or []
                if analyses and analyses[0].get("speed") is not None:
                    out["cme_speed"] = float(analyses[0]["speed"])
                    out["cme_time"] = ev.get("startTime")
                    break
    except Exception:
        pass
    try:
        flr_data = nasa_flr()
        if flr_data and isinstance(flr_data, list):
            flr_sorted = sorted(flr_data, key=lambda e: str(e.get("peakTime", "")), reverse=True)
            if flr_sorted:
                out["flare"] = flr_sorted[0].get("classType")
                out["flare_time"] = flr_sorted[0].get("peakTime")
    except Exception:
        pass
    try:
        wind_data = nasa_wind()
        if wind_data and isinstance(wind_data, list) and wind_data:
            # El campo es "proton_speed" (no "speed"); tomar la lectura
            # activa mas reciente (las inactivas pueden ser datos viejos).
            u = None
            for cand in reversed(wind_data):
                if cand.get("active") and cand.get("proton_speed") is not None:
                    u = cand
                    break
            if u is None:
                u = wind_data[-1]
            if u.get("proton_speed") is not None:
                out["solar_wind"] = float(u["proton_speed"])
            out["wind_time"] = u.get("time_tag")
    except Exception:
        pass
    try:
        mag_data = nasa_mag()
        if mag_data and isinstance(mag_data, list) and mag_data:
            u = mag_data[-1]
            if u.get("bt") is not None:
                out["mag_bt"] = float(u["bt"])
            out["mag_time"] = u.get("time_tag")
    except Exception:
        pass
    try:
        dsn_data = nasa_dsn()
        if dsn_data and isinstance(dsn_data, dict):
            sts = dsn_data.get("stations") or []
            out["dsn_stations"] = len(sts)
            out["dsn_dishes"] = sum(len(s.get("dishes") or []) for s in sts)
    except Exception:
        pass
    try:
        neo_data = nasa_neo()
        if neo_data and isinstance(neo_data, dict):
            out["neo_count"] = neo_data.get("element_count")
    except Exception:
        pass
    try:
        al_data = nasa_alerts()
        if al_data and isinstance(al_data, list):
            out["alerts"] = len(al_data)
    except Exception:
        pass
    try:
        req = urllib.request.Request(
            "https://api.wheretheiss.at/v1/satellites/25544",
            headers={"User-Agent": "XONIDU-Backend/1.0"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            iss = json.loads(resp.read().decode("utf-8"))
        if isinstance(iss, dict):
            out["iss_lat"] = iss.get("latitude")
            out["iss_lon"] = iss.get("longitude")
            out["iss_alt"] = iss.get("altitude")
    except Exception:
        pass
    return out


NASA_ENDPOINTS = {
    "neo": nasa_neo,
    "kp": nasa_kp,
    "alerts": nasa_alerts,
    "cme": nasa_cme,
    "flr": nasa_flr,
    "wind": nasa_wind,
    "mag": nasa_mag,
    "dsn": nasa_dsn,
    "live": nasa_live,
}

# ---------------------------------------------------------------------------
# Sincronizacion con Supabase (fuente de verdad compartida)
# ---------------------------------------------------------------------------
def supabase_sync_modulos():
    """Sube el estado local de modulos a Supabase y trae cambios remotos."""
    if _supabase is None:
        return
    try:
        # Subir estados locales
        rows = []
        for zona, mods in STATE["modulos"].items():
            for slug, st in mods.items():
                rows.append({
                    "id": f"mod-{zona}-{slug}",
                    "zona": zona,
                    "slug": slug,
                    "estado": st,
                    "ultima_actualizacion": _utcnow().isoformat() + "Z",
                    "fuente": "backend"
                })
        if rows:
            _supabase.table("modulos").upsert(rows).execute()
        # Traer estado remoto (fuente de verdad)
        res = _supabase.table("modulos").select("*").execute()
        if res.data:
            for row in res.data:
                zona = row["zona"]
                slug = row["slug"]
                st = row["estado"]
                if zona in STATE["modulos"] and slug in STATE["modulos"][zona]:
                    if STATE["modulos"][zona][slug] != st:
                        STATE["modulos"][zona][slug] = st
                        print(f"[Supabase] Modulo {zona}.{slug} <- {st}")
                        broadcast_state()
    except Exception as e:
        print(f"[Supabase] Error sincronizando modulos: {e}")


def supabase_guardar_evento_nasa(api, tipo, severidad, fecha_evento, datos, modulos_afectados):
    """Guarda un evento detectado por una API de la NASA en Supabase."""
    if _supabase is None:
        return
    try:
        _supabase.table("eventos_nasa").insert({
            "api": api,
            "tipo": tipo,
            "severidad": severidad,
            "fecha_evento": fecha_evento,
            "datos": datos,
            "modulos_afectados": modulos_afectados,
            "procesado": False
        }).execute()
    except Exception as e:
        print(f"[Supabase] Error guardando evento NASA: {e}")


# ---------------------------------------------------------------------------
# Procesamiento de eventos NASA -> cambios de estado de modulos
# ---------------------------------------------------------------------------
def procesar_eventos_nasa():
    """Consulta las 5 APIs de la NASA, detecta eventos y actualiza estados.

    JUEGO REAL (sin simulaciones):
    - Solo se aplican eventos RECIENTES (peak/start dentro de
      event_fresh_hours). Un evento viejo ya no es una amenaza vigente.
    - Un evento discreto (FLR/CME) se aplica UNA vez: si el jugador atiende
      el modulo (clic), el poll no lo vuelve a subir mientras el evento
      siga vigente. Cuando el evento caduca, el modulo se recupera solo.
    - Kp es una condicion continua: mientras Kp >= warn, radiacion esta en
      alerta; si el jugador la atiende, no se vuelve a subir hasta que
      llegue una lectura Kp nueva (nuevo episodio).
    - Un modulo en warn sin atender durante attend_window_min escala a crit.
    """
    global KP_EPISODE
    resultados = {}
    fresh_hours = GAME_CONFIG.get("event_fresh_hours", 24)

    # --- SWPC K-index -> Radiacion (zonas A y F), condicion continua ---
    kp_data = nasa_kp()
    kp_level = "ok"
    kp_episode = None
    if kp_data and isinstance(kp_data, list) and len(kp_data) > 0:
        ultimo = kp_data[-1]
        kp = float(ultimo.get("Kp", 0) or 0)
        resultados["kp"] = kp
        kp_episode = str(ultimo.get("time_tag", ""))
        if kp >= GAME_CONFIG.get("kp_crit", 7):
            kp_level = "crit"
        elif kp >= GAME_CONFIG.get("kp_warn", 5):
            kp_level = "warn"
        mod_af = ["mod-a-radiation", "mod-f-radiation"]
        supabase_guardar_evento_nasa("kp", "tormenta_solar",
            "alta" if kp_level == "crit" else "media",
            _utcnow().isoformat() + "Z",
            {"kp": kp}, mod_af)
    # Episodio nuevo (lectura Kp nueva): la atencion anterior ya no cuenta.
    if kp_episode != KP_EPISODE:
        KP_EPISODE = kp_episode
        ATTENDED.discard("a.radiation")
        ATTENDED.discard("f.radiation")
    for zona in ["a", "f"]:
        key = f"{zona}.radiation"
        cur = STATE["modulos"].get(zona, {}).get("radiation")
        if kp_level == "ok":
            # Tormenta pasada: el modulo se recupera (si no lo afecta otro evento).
            if cur in ("warn", "crit") and not any(
                key in (f"{z}.{s}" for z, s in ev["modules"]) for ev in EVENT_STATE.values()
            ):
                _set_module_state(zona, "radiation", "ok")
        elif key not in ATTENDED and RANK[kp_level] > RANK.get(cur, 0):
            _set_module_state(zona, "radiation", kp_level)

    # --- SWPC Alertas -> solo registro (no cambia estados por si solas) ---
    alerts_data = nasa_alerts()
    if alerts_data and isinstance(alerts_data, list):
        resultados["alertas"] = len(alerts_data)
        for al in alerts_data[-5:]:
            supabase_guardar_evento_nasa("alerts", "alerta_clima_espacial",
                "media", al.get("issue_datetime", ""), al, ["mod-d-comms", "mod-f-comms"])

    # --- Eventos discretos (FLR/CME): solo los recientes, aplicados una vez ---
    current_ids = set()
    # Clase minima de llamarada que genera alerta: "M" (medio/facil) o "C"
    # (dificil: las llamaradas C son mucho mas frecuentes -> mas fallos).
    flr_min = str(GAME_CONFIG.get("flr_min_class", "M")).upper()
    flr_data = nasa_flr()
    if flr_data and isinstance(flr_data, list):
        for ev in flr_data[-10:]:
            clase = str(ev.get("classType", ""))
            if flr_min == "C":
                if not (clase.startswith("C") or clase.startswith("M") or clase.startswith("X")):
                    continue
            elif not (clase.startswith("M") or clase.startswith("X")):
                continue
            peak = ev.get("peakTime", "")
            if not _is_fresh(peak, fresh_hours):
                continue
            ev_id = "flr:" + str(ev.get("flrID", peak))
            current_ids.add(ev_id)
            if ev_id in EVENT_STATE:
                continue
            mods = [("a", "radiation"), ("f", "radiation"),
                    ("c", "comms"), ("d", "comms"), ("f", "comms")]
            EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
            for zona, slug in mods:
                # Evento nuevo: la atencion de un evento anterior ya no cuenta.
                ATTENDED.discard(f"{zona}.{slug}")
                if STATE["modulos"].get(zona, {}).get(slug) == "ok":
                    _set_module_state(zona, slug, "warn")
            print(f"[NASA] Llamarada {clase} ({peak}) -> radiacion/comms warn")
            supabase_guardar_evento_nasa("flr", "llamarada_solar",
                "critica" if clase.startswith("X") else "alta",
                peak, ev, ["mod-a-radiation", "mod-d-comms", "mod-f-comms"])

    cme_data = nasa_cme()
    if cme_data and isinstance(cme_data, list):
        resultados["cme"] = len(cme_data)
        for ev in cme_data[-10:]:
            analyses = ev.get("cmeAnalyses") or [{}]
            speed = float((analyses[0] or {}).get("speed", 0) or 0)
            if speed <= GAME_CONFIG.get("cme_speed_warn", 500):
                continue
            start = ev.get("startTime", "")
            if not _is_fresh(start, fresh_hours):
                continue
            ev_id = "cme:" + str(ev.get("activityID", start))
            current_ids.add(ev_id)
            if ev_id in EVENT_STATE:
                continue
            mods = [("c", "energy"), ("f", "energy")]
            EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
            for zona, slug in mods:
                # Evento nuevo: la atencion de un evento anterior ya no cuenta.
                ATTENDED.discard(f"{zona}.{slug}")
                if STATE["modulos"].get(zona, {}).get(slug) == "ok":
                    _set_module_state(zona, slug, "warn")
            print(f"[NASA] CME {speed} km/s ({start}) -> energia warn")
            supabase_guardar_evento_nasa("cme", "eyeccion_masa_coronal",
                "alta", start, ev, ["mod-c-energy", "mod-f-energy"])

    # --- Eventos caducados: se retiran y sus modulos se recuperan ---
    for ev_id in list(EVENT_STATE.keys()):
        if ev_id in current_ids:
            continue
        ev = EVENT_STATE.pop(ev_id)
        for zona, slug in ev["modules"]:
            key = f"{zona}.{slug}"
            ATTENDED.discard(key)
            # Solo se recupera si ningun otro evento vigente lo afecta
            # y Kp esta en calma (para radiacion).
            still = any(
                key in (f"{z}.{s}" for z, s in other["modules"])
                for other in EVENT_STATE.values()
            )
            if not still and slug == "radiation" and kp_level != "ok":
                still = True
            if not still and STATE["modulos"].get(zona, {}).get(slug) == "warn":
                _set_module_state(zona, slug, "ok")

    # --- NeoWs -> solo registro (debris cercano, no cambia estados por si solo) ---
    neo_data = nasa_neo()
    if neo_data:
        count = neo_data.get("element_count", 0) if isinstance(neo_data, dict) else 0
        resultados["neo"] = count
        supabase_guardar_evento_nasa("neo", "asteroides_cercanos",
            "media" if count > 0 else "baja",
            _utcnow().isoformat() + "Z",
            {"count": count}, ["mod-d-navigation", "mod-f-structure"])

    # --- Escalado por no atender ---
    _escalate_unattended()

    broadcast_state()
    supabase_sync_modulos()
    return resultados


# ---------------------------------------------------------------------------
# Polling periodico de APIs de la NASA
# ---------------------------------------------------------------------------
NASA_POLLING_ACTIVE = False
NASA_POLLING_THREAD = None


def nasa_polling_loop(interval_seconds: int = 60):
    """Consulta las APIs de la NASA periodicamente y actualiza estados."""
    global NASA_POLLING_ACTIVE
    while NASA_POLLING_ACTIVE:
        try:
            procesar_eventos_nasa()
        except Exception as e:
            print(f"[NASA Polling] Error: {e}")
        time.sleep(interval_seconds)


def iniciar_nasa_polling(interval_seconds: int = 60):
    global NASA_POLLING_ACTIVE, NASA_POLLING_THREAD
    if NASA_POLLING_ACTIVE:
        return
    NASA_POLLING_ACTIVE = True
    NASA_POLLING_THREAD = threading.Thread(
        target=nasa_polling_loop, args=(interval_seconds,), daemon=True
    )
    NASA_POLLING_THREAD.start()
    print(f"[NASA Polling] Iniciado (intervalo: {interval_seconds}s)")


def detener_nasa_polling():
    global NASA_POLLING_ACTIVE
    NASA_POLLING_ACTIVE = False


# Clientes WebSocket conectados
WS_CLIENTS = set()
WS_CLIENTS_LOCK = threading.Lock()


def liberar_puerto(puerto: int):
    """Cierra cualquier servidor anterior que use el puerto dado."""
    try:
        subprocess.run(
            ["fuser", "-k", f"{puerto}/tcp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass
    try:
        resultado = subprocess.run(
            ["lsof", "-ti", f":{puerto}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
            text=True,
        )
        for pid in resultado.stdout.split():
            try:
                os.kill(int(pid), 9)
            except (ProcessLookupError, PermissionError, Exception):
                pass
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass


def broadcast_state():
    """Envia el estado actual a todos los clientes WebSocket conectados."""
    mensaje = json.dumps({"type": "state", "data": STATE})
    with WS_CLIENTS_LOCK:
        clientes = list(WS_CLIENTS)
    if not clientes:
        return
    try:
        loop = WS_LOOP
    except NameError:
        return
    asyncio.run_coroutine_threadsafe(
        _broadcast_async(clientes, mensaje), loop
    )


async def _broadcast_async(clientes, mensaje):
    for ws in clientes:
        try:
            await ws.send(mensaje)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Servidor HTTP estatico (puerto 5000)
# ---------------------------------------------------------------------------
class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = self.path.split("?", 1)[0]
        # SIEMPRE al entrar a la URL: ir al menu. Redirect 302 para que la
        # barra muestre /menu/index.html y las rutas relativas del menu
        # (app.js, style.css, menu.png) resuelvan siempre a /menu/.
        if parsed.rstrip("/") in ("", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/menu/index.html")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            return
        if parsed.startswith("/api/nasa/"):
            api = parsed[len("/api/nasa/"):]
            if api in NASA_ENDPOINTS:
                data = NASA_ENDPOINTS[api]()
                body = json.dumps({"ok": data is not None, "data": data, "api": api}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif api in ("events", "poll"):
                # Disparador manual del procesamiento de eventos NASA.
                # (Las ramas exactas de abajo son inalcanzables: el prefijo
                # /api/nasa/ las captura primero, por eso van aqui.)
                try:
                    resultados = procesar_eventos_nasa()
                    body = json.dumps({"ok": True, "resultados": resultados}).encode()
                    self.send_response(200)
                except Exception as e:
                    print(f"[NASA] Error procesando eventos: {e}")
                    body = json.dumps({"ok": False, "error": str(e)}).encode()
                    self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                body = json.dumps({"ok": False, "error": f"API NASA desconocida: {api}"}).encode()
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        if parsed == "/api/state":
            body = json.dumps({"ok": True, "data": STATE}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/nasa/events":
            resultados = procesar_eventos_nasa()
            body = json.dumps({"ok": True, "resultados": resultados}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/nasa/poll":
            # Forzar un poll inmediato de las APIs de la NASA
            resultados = procesar_eventos_nasa()
            body = json.dumps({"ok": True, "resultados": resultados}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/config":
            body = json.dumps({"ok": True, "config": GAME_CONFIG,
                               "defaults": DEFAULT_GAME_CONFIG}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/mission":
            body = json.dumps({"ok": True, "mission": mission_status()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def _json_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = {}
        return data if isinstance(data, dict) else {}

    def do_POST(self):
        """POST /api/config, /api/difficulty y /api/mission/start."""
        parsed = self.path.split("?", 1)[0]
        if parsed == "/api/config":
            data = self._json_body()
            changed = {}
            for k, v in data.items():
                if k in DEFAULT_GAME_CONFIG and isinstance(v, (int, float, str)):
                    GAME_CONFIG[k] = v
                    changed[k] = v
            save_game_config()
            body = json.dumps({"ok": True, "config": GAME_CONFIG,
                               "changed": changed}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/difficulty":
            data = self._json_body()
            name = str(data.get("difficulty", "")).lower()
            if not apply_difficulty(name):
                body = json.dumps({"ok": False, "error": "dificultad desconocida",
                                   "validas": list(DIFFICULTY_PRESETS)}).encode()
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            body = json.dumps({"ok": True, "config": GAME_CONFIG}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/mission/start":
            data = self._json_body()
            days = int(data.get("days") or GAME_CONFIG.get("mission_days", 5))
            min_per_day = int(data.get("min_per_day") or GAME_CONFIG.get("min_per_day", 2))
            days = max(1, min(30, days))
            min_per_day = max(1, min(60, min_per_day))
            MISSION.update({"active": True, "start": _utcnow(),
                            "difficulty": str(data.get("difficulty") or GAME_CONFIG.get("difficulty", "medio")),
                            "days": days, "min_per_day": min_per_day,
                            "objetivo": data.get("objetivo"), "orbita": data.get("orbita"),
                            "lanzador": data.get("lanzador")})
            # Reiniciar la partida: limpiar el estado del juego para empezar
            # de cero (dia 1, modulos en ok). Los eventos NASA que sigan
            # activos se aplican DE INMEDIATO (en un hilo, para no bloquear
            # la respuesta): si no, la partida empieza vacia y aburrida,
            # porque el poll solo corre cada 60 s y en facil la mision dura
            # 5 minutos.
            global KP_EPISODE
            ATTENDED.clear()
            EVENT_STATE.clear()
            WARN_SINCE.clear()
            KP_EPISODE = None
            for zona_mods in STATE["modulos"].values():
                for slug in zona_mods:
                    zona_mods[slug] = "ok"
            print(f"[mision] START: {MISSION['objetivo']} · {days} dias · {min_per_day} min/dia · {MISSION['difficulty']}")
            def _aplicar_eventos_inicio():
                try:
                    procesar_eventos_nasa()
                except Exception as e:
                    print(f"[mision] Error aplicando eventos al iniciar: {e}")
                try:
                    broadcast_state()
                except Exception:
                    pass
            threading.Thread(target=_aplicar_eventos_inicio, daemon=True).start()
            body = json.dumps({"ok": True, "mission": mission_status()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        body = json.dumps({"ok": False, "error": "ruta desconocida"}).encode()
        self.send_response(404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        path, _, _ = path.partition("?")
        path, _, _ = path.partition("#")
        import posixpath, urllib.parse
        path = posixpath.normpath(urllib.parse.unquote(path))
        if path.rstrip("/") in ("", "/"):
            return str(WEB_DIR / "menu" / "index.html")
        words = [w for w in path.split("/") if w]
        result = WEB_DIR
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                continue
            result = result / word
        # Si no existe bajo WEB_DIR, probar bajo WEB_DIR/station-map/ (css, js, imagenes del mapa)
        if not os.path.exists(result):
            alt = WEB_DIR / "station-map"
            for word in words:
                alt = alt / word
            if os.path.exists(alt):
                result = alt
        return str(result)


def start_http_server():
    liberar_puerto(HTTP_PORT)
    os.chdir(WEB_DIR)
    with ReusableTCPServer(("", HTTP_PORT), Handler) as httpd:
        print(f"HTTP estatico en http://localhost:{HTTP_PORT}/")
        httpd.serve_forever()


# ---------------------------------------------------------------------------
# Servidor WebSocket (puerto 5001)
# ---------------------------------------------------------------------------
async def ws_handler(websocket):
    path = getattr(websocket, "request_path", None) or getattr(websocket, "path", "/")
    with WS_CLIENTS_LOCK:
        WS_CLIENTS.add(websocket)
    try:
        await websocket.send(json.dumps({"type": "state", "data": STATE}))
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await handle_ws_message(msg, websocket)
    finally:
        with WS_CLIENTS_LOCK:
            WS_CLIENTS.discard(websocket)


async def handle_ws_message(msg, sender):
    """Procesa un mensaje entrante y propaga el cambio a todos los clientes."""
    mtype = msg.get("type")
    if mtype == "set_zone":
        zona = msg.get("zona", "").upper()
        status = msg.get("status", "").lower()
        if zona in STATE["zonas"] and status in VALID_STATUSES:
            STATE["zonas"][zona] = status
            print(f"[WS] Zona {zona} -> {status}")
            broadcast_state()
    elif mtype == "set_module":
        zona = msg.get("zona", "").lower()
        modulo = msg.get("modulo", "").lower()
        status = msg.get("status", "").lower()
        if (
            zona in STATE["modulos"]
            and modulo in STATE["modulos"][zona]
            and status in VALID_STATUSES
        ):
            _set_module_state(zona, modulo, status)
            key = f"{zona}.{modulo}"
            if status == "ok":
                # El jugador atendio el modulo (clic): el poll no lo vuelve
                # a subir mientras el evento/episodio vigente siga activo.
                ATTENDED.add(key)
            else:
                ATTENDED.discard(key)
            print(f"[WS] Modulo {zona}.{modulo} -> {status}")
            broadcast_state()
    elif mtype == "get_state":
        await sender.send(json.dumps({"type": "state", "data": STATE}))


async def ws_main():
    global WS_LOOP
    WS_LOOP = asyncio.get_running_loop()
    liberar_puerto(WS_PORT)
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        print(f"WebSocket en ws://localhost:{WS_PORT}")
        await asyncio.Future()  # correr para siempre


def start_ws_server():
    asyncio.run(ws_main())


# ---------------------------------------------------------------------------
# Tunel Cloudflare (igual que XONINAS)
# ---------------------------------------------------------------------------
class Tunnel:
    """Abre un tunel cloudflared hacia el servidor local y captura su URL publica."""

    def __init__(self, port):
        self.port = port
        self.proc = None
        self.url = None

    @property
    def alive(self):
        return self.proc is not None and self.proc.poll() is None

    def start(self):
        self.stop()
        exe = shutil_which("cloudflared")
        if not exe:
            print("cloudflared no encontrado. Instalalo con: sudo pacman -S cloudflared")
            return False
        self.url = None
        print("Abriendo tunel Cloudflare...")
        self.proc = subprocess.Popen(
            [exe, "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://localhost:{self.port}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        threading.Thread(target=self._reader, args=(self.proc,), daemon=True).start()
        return True

    def _reader(self, proc):
        """Lee la salida de cloudflared para extraer la URL del tunel."""
        for line in proc.stdout:
            m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if m and not self.url:
                self.url = m.group(0)
                print(f"\n=== TUNEL CLOUDFLARE ===")
                print(f"URL publica: {self.url}")
                print(f"========================\n", flush=True)

    def stop(self):
        p, self.proc, self.url = self.proc, None, None
        if p and p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                p.kill()


def shutil_which(cmd):
    """Wrapper para shutil.which que no requiere importar shutil si no se usa."""
    import shutil
    return shutil.which(cmd)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if not WEB_DIR.exists():
        print(f"ERROR: no se encontro la carpeta {WEB_DIR}")
        sys.exit(1)
    if not (WEB_DIR / "menu" / "index.html").exists():
        print(f"ERROR: no se encontro menu/index.html dentro de {WEB_DIR}")
        sys.exit(1)
    if not (WEB_DIR / "station-map" / "index.html").exists():
        print(f"ERROR: no se encontro station-map/index.html dentro de {WEB_DIR}")
        sys.exit(1)

    # Configuracion del juego (metricas, umbrales, scoring) desde game_config.json
    load_game_config()

    # Cerrar servidores previos en ambos puertos
    liberar_puerto(HTTP_PORT)
    liberar_puerto(WS_PORT)

    # Hilo para HTTP estatico
    t_http = threading.Thread(target=start_http_server, daemon=True)
    t_http.start()

    # Hilo para WebSocket
    t_ws = threading.Thread(target=start_ws_server, daemon=True)
    t_ws.start()

    # Hilo de polling periodico de APIs de la NASA
    iniciar_nasa_polling(interval_seconds=60)

    # Esperar un poco a que ambos servidores esten listos antes de abrir el tunel
    time.sleep(1)

    # Abrir tunel Cloudflare hacia el puerto HTTP
    tunnel = Tunnel(HTTP_PORT)
    tunnel.start()

    url = f"http://localhost:{HTTP_PORT}/"
    print(f"Backend lanzado en {url}")
    print(f"Sirviendo archivos desde: {WEB_DIR}")
    print("Presiona Ctrl+C para detener el servidor.")

    # Mantener vivo el hilo principal
    try:
        while True:
            signal.pause()
    except AttributeError:
        import time as _time
        while True:
            _time.sleep(3600)


if __name__ == "__main__":
    main()

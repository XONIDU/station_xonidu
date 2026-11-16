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
HTTP_PORT = int(os.environ.get("PORT", 5000))
WS_PORT = 5001

# ---------------------------------------------------------------------------
# Estado compartido de la estacion
# ---------------------------------------------------------------------------
STATE = {
    # v19: "reinforced" = modulos reforzados (lista "zona.slug") y
    # "warn_since" = cuando paso cada modulo a warn (ISO). El frontend
    # los usa para mostrar el escudo 🛡 y la cuenta atras de escalado.
    "reinforced": [],
    "pending_anomalies": 0,
    "warn_since": {},
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

VALID_STATUSES = {"ok", "warn", "crit", "pre"}

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
    "attend_window_sec": 80,  # v19.4: SEGUNDOS en warn sin atender antes de escalar a crit (Darian pidio bajar la dificultad a la mitad: facil 120, medio 80, dificil 60)
    "max_anomalies": 2,       # v19.3: maximo de anomalias (warn/crit) a la vez; las demas quedan en cola y salen solas
    # Scoring de mision (lo calcula el menu)
    "score_base": 100,
    "orbit_fit": 20, "orbit_miss": -15,
    "launcher_fit": 10, "launcher_miss": -10,
    "mass_penalty": -20, "budget_penalty": -10,
    "complete_bonus": 200, "complete_bonus_hard": 300,
    "data_bonus": 40,
    # v16: nuevos fallos reales (DSN, viento solar, campo magnetico, CME rapida).
    "dsn_min_active": 1,      # una estacion con 0 antenas activas -> comms warn
    "wind_speed_warn": 600,   # viento solar > 600 km/s -> comms warn
    "mag_bt_warn": 10,        # campo magnetico Bt > 10 nT -> radiacion warn
    "cme_fast_speed": 600,    # CME > 600 km/s -> ademas radiacion + comms warn
}
GAME_CONFIG = dict(DEFAULT_GAME_CONFIG)
CONFIG_PATH = Path(__file__).resolve().parent / "game_config.json"

# Presets de dificultad: 5 dias siempre; a mas dificultad, mas minutos por dia
# (la partida dura mas) y umbrales mas sensibles -> aparecen MAS fallos reales
# de la NASA (Kp mas bajo, CME mas lenta, llamaradas clase C tambien alertan)
# y menos tiempo para atenderlas antes de que escalen a crit.
DIFFICULTY_PRESETS = {
    "facil":   {"mission_days": 5, "min_per_day": 1, "kp_warn": 6, "kp_crit": 8,
                "cme_speed_warn": 500, "flr_min_class": "M", "attend_window_sec": 120,
                "event_fresh_hours": 24, "max_anomalies": 2},
    "medio":   {"mission_days": 5, "min_per_day": 2, "kp_warn": 6, "kp_crit": 8,
                "cme_speed_warn": 500, "flr_min_class": "M", "attend_window_sec": 80,
                "event_fresh_hours": 96, "max_anomalies": 2},
    "dificil": {"mission_days": 5, "min_per_day": 3, "kp_warn": 5, "kp_crit": 7,
                "cme_speed_warn": 450, "flr_min_class": "M", "attend_window_sec": 60,
                "event_fresh_hours": 120, "max_anomalies": 2},
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
           "lanzador": None, "fit_score": 0, "components": {},
           "fuel_capacity": 0, "fuel_burn": 0}
# Estadisticas de la partida para el score final (v13): reparaciones
# completadas (el jugador atendio un modulo en warn/crit) y modulos que
# llegaron a crit. Se reinician en cada POST /api/mission/start.
MISSION_STATS = {"repairs": 0, "crits": 0, "penalties": 0, "drain": 0}
# Mission Integrity: 100 al inicio. Cada modulo en crit sin atender la baja
# (1 punto por segundo, aplicado en cada tick del orquestador). En 0, la
# mision fracasa (condicion de derrota).
MISSION_INTEGRITY = 100
# Modulos reforzados (v15): un modulo reforzado tarda el DOBLE en escalar
# de warn a crit (el jugador se preparo para la falla).
REINFORCED = set()
# Combustible por sistema de propulsion (v14, valores de juego, iguales
# que en el menu): (capacidad del tanque en kg, gasto por dia en kg/dia).
PROPULSION_FUEL = {"NONE": (0, 0), "CHEMICAL": (200, 10), "ELECTRIC": (50, 2)}
# Misiones que generan DATA (bonus +40 al completar): 4, 5, 6 y 9.
DATA_MISSIONS = {"CUBESAT DEPLOY", "MICROGRAVITY SCIENCE",
                 "EARTH OBSERVATION", "ASTRONOMY"}


def _as_str(v):
    """Normaliza un valor del menu a string: el objetivo/orbita/lanzador
    llegan como string ("CARGO CAPTURE"), pero un localStorage viejo los
    puede traer como objeto {id, title}. Sin esto, .upper() revienta y
    el /api/mission/start (reiniciar) devuelve 500 y no reinicia."""
    if isinstance(v, dict):
        return str(v.get("id") or v.get("title") or v.get("name") or "")
    return str(v or "")


def mission_score():
    """Score de la mision (v13): desglose por decision y por fallas.
    fit = puntaje de diseno (orbita + lanzador) que manda el menu;
    complete = bonus al terminar (200, 300 en la mision 7);
    repairs = +50 por cada modulo reparado; crits = -50 por cada modulo
    que llego a crit; data = +40 si la mision genera DATA. El bonus de
    completar y el de DATA solo cuentan cuando la mision termino."""
    obj = _as_str(MISSION.get("objetivo")).upper()
    finished = False
    if MISSION["active"] and MISSION["start"]:
        total = MISSION["days"] * MISSION["min_per_day"]
        elapsed = (_utcnow() - MISSION["start"]).total_seconds() / 60.0
        finished = (int(elapsed // MISSION["min_per_day"]) + 1) > MISSION["days"]
    complete = 0
    data = 0
    if finished:
        complete = 300 if obj == "MOON & MARS TECH" else 200
        data = 40 if obj in DATA_MISSIONS else 0
    fit = int(MISSION.get("fit_score") or 0)
    repairs = 50 * int(MISSION_STATS.get("repairs", 0))
    crits = -50 * int(MISSION_STATS.get("crits", 0))
    # Penalizaciones (v15): -10 por cada opcion mal elegida en el
    # diagnostico. Cuentan siempre, no solo al terminar.
    penalties = -10 * int(MISSION_STATS.get("penalties", 0))
    # Drenaje (v19): mientras un modulo esta en crit sin atender, el
    # score baja 5 pts por modulo y por minuto (cada poll). Es la
    # consecuencia de dejar una falla critica sin atender.
    drain = -2 * int(MISSION_STATS.get("drain", 0))
    # Combustible (v14): si la mision necesitaba combustible y se agoto
    # antes de terminar, -20. Solo cuenta cuando la mision termino.
    fuel = 0
    if finished:
        cap = float(MISSION.get("fuel_capacity") or 0)
        burn = float(MISSION.get("fuel_burn") or 0)
        total_min = MISSION["days"] * MISSION["min_per_day"]
        if burn > 0 and cap > 0 and cap - burn * (total_min / max(1, MISSION["min_per_day"])) <= 0:
            fuel = -20
    return {"fit": fit, "complete": complete, "repairs": repairs,
            "crits": crits, "data": data, "fuel": fuel,
            "penalties": penalties, "drain": drain,
            "total": fit + complete + repairs + crits + data + fuel + penalties + drain,
            "n_repairs": int(MISSION_STATS.get("repairs", 0)),
            "n_crits": int(MISSION_STATS.get("crits", 0)),
            "n_penalties": int(MISSION_STATS.get("penalties", 0)),
            "n_drain": int(MISSION_STATS.get("drain", 0))}


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
                "orbita": MISSION["orbita"], "lanzador": MISSION["lanzador"],
                "score": mission_score()}
    total = MISSION["days"] * MISSION["min_per_day"]
    elapsed = (_utcnow() - MISSION["start"]).total_seconds() / 60.0
    day = int(elapsed // MISSION["min_per_day"]) + 1
    finished = day > MISSION["days"]
    # v19: MISION FALLIDA (game over) — si 6 o mas modulos estan en crit
    # a la vez, la estacion es inoperable; o si el score llego a 0 o menos
    # (el drenaje de las criticas lo agoto). La mision termina antes de
    # tiempo y la pantalla de fin muestra "Misión fallida".
    failed = False
    if MISSION["active"] and not finished:
        n_crit = sum(1 for mods in STATE["modulos"].values() for v in mods.values() if v == "crit")
        if n_crit >= 6:
            failed = True
            MISSION["failed"] = True
            print(f"[mision] FALLIDA: {n_crit} modulos en crit (estacion inoperable)")
        elif MISSION_INTEGRITY <= 0:
            failed = True
            MISSION["failed"] = True
            print("[mision] FALLIDA: Mission Integrity llego a 0")
        elif mission_score()["total"] <= 0 and (MISSION.get("fit_score") or 0) > 0:
            failed = True
            MISSION["failed"] = True
            print("[mision] FALLIDA: el score llego a 0 (drenaje de criticas)")
    if MISSION.get("failed"):
        failed = True
        finished = True
    # Combustible restante (v14): se gasta con los dias de mision.
    # (dias transcurridos = minutos / minutos por dia, sin tope: el
    # combustible solo baja, nunca sube al cambiar de dia.)
    cap = float(MISSION.get("fuel_capacity") or 0)
    burn = float(MISSION.get("fuel_burn") or 0)
    days_elapsed = elapsed / max(1, MISSION["min_per_day"])
    fuel_remaining = max(0.0, cap - burn * days_elapsed)
    return {"active": True, "difficulty": MISSION["difficulty"],
            "day": min(day, MISSION["days"]), "days_total": MISSION["days"],
            "min_per_day": MISSION["min_per_day"],
            "minutes_elapsed": round(elapsed, 1), "minutes_total": total,
            "minutes_left": round(max(0.0, total - elapsed), 1),
            "finished": finished, "failed": failed, "objetivo": _as_str(MISSION["objetivo"]),
            "orbita": _as_str(MISSION["orbita"]), "lanzador": _as_str(MISSION["lanzador"]),
            "fuel": {"capacity": cap, "burn_per_day": burn,
                     "remaining": round(fuel_remaining, 1),
                     "needed": burn * MISSION["days"]},
            "integrity": round(MISSION_INTEGRITY, 1),
            "score": mission_score()}


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


# v19.3: TOPE de anomalias simultaneas (facil 2, medio 2, dificil 3).
# Cuando la NASA trae mas fallos de los que caben a la vez, los demas
# quedan en cola (PENDING_ANOMALIES) y salen SOLOS durante la mision en
# cuanto se libera un hueco (al reparar un modulo o al recuperarse).
PENDING_ANOMALIES = []  # [{zona, slug, nivel, reason}]

# v21: modo fácil — anomalías tipo FNAF, sin datos reales de la NASA.
# 1 anomalía por noche (por ciclo de día), máximo 2 activas a la vez,
# pseudo-aleatoria, sin saturar al jugador.
FACIL_LAST_DAY = None

# v19.4: marca de tiempo de la ultima reparacion (un modulo paso a ok).
# Mientras no hayan pasado 60 s desde la reparacion,
# _drain_pending_anomalies no suelta la siguiente anomalia de la cola, para
# no disparar dos anomalias seguidas justo al reparar.
LAST_REPAIR_TS = None


def _count_anomalies():
    return sum(1 for mods in STATE["modulos"].values()
               for v in mods.values() if v in ("warn", "crit"))


def _max_anomalies():
    try:
        return max(1, int(GAME_CONFIG.get("max_anomalies", 2)))
    except Exception:
        return 2


def _sync_pending_state():
    STATE["pending_anomalies"] = len(PENDING_ANOMALIES)


def _is_cme_earth_directed(ev: dict) -> bool:
    """Detecta si una CME esta dirigida a la Tierra segun los datos de DONKI.
    Revisa enlilList[].isEarthGB y enlilList[].impactList[].location == 'Earth'.
    Si no hay informacion de direccion, asume que NO es dirigida a la Tierra
    (evita falsos positivos)."""
    enlil_list = ev.get("enlilList") or []
    for run in enlil_list:
        if run.get("isEarthGB") is True:
            return True
        for hit in run.get("impactList") or []:
            if str(hit.get("location", "")).strip().lower() == "earth":
                return True
    return False


def _apply_nasa_anomaly(zona, slug, nivel, reason=""):
    """Aplica una anomalia de la NASA respetando el tope y el freno de 30 s.
    Si no hay hueco o si se reparo hace menos de 30 s, la deja en cola para
    que salga sola cuando se libere uno. Devuelve True si se aplico,
    False si quedo en cola."""
    global LAST_REPAIR_TS
    cur = STATE["modulos"].get(zona, {}).get(slug)
    if cur in ("warn", "crit"):
        return True  # ya es una anomalia activa, no suma al tope
    if cur not in ("ok", "pre"):
        return False
    # v19.4: freno de 60 s (1 minuto) tras reparar. Mientras no pasen los 60 s,
    # ninguna anomalia nueva de la NASA se aplica al instante: queda en cola.
    if LAST_REPAIR_TS is not None and (_utcnow() - LAST_REPAIR_TS).total_seconds() < 60:
        if not any(x["zona"] == zona and x["slug"] == slug for x in PENDING_ANOMALIES):
            PENDING_ANOMALIES.append({"zona": zona, "slug": slug,
                                      "nivel": nivel, "reason": reason})
            _sync_pending_state()
            print(f"[NASA] Anomalia bloqueada por freno (60s): {zona}.{slug} "
                  f"-> {nivel} (en cola)")
        return False
    if _count_anomalies() >= _max_anomalies():
        if not any(x["zona"] == zona and x["slug"] == slug for x in PENDING_ANOMALIES):
            PENDING_ANOMALIES.append({"zona": zona, "slug": slug,
                                      "nivel": nivel, "reason": reason})
            _sync_pending_state()
            print(f"[NASA] Anomalia en cola ({reason}): {zona}.{slug} -> {nivel} "
                  f"(tope {_max_anomalies()} activas)")
        return False
    return _set_module_state(zona, slug, nivel)


def _drain_pending_anomalies():
    """Saca anomalias de la cola mientras haya hueco (al reparar un modulo
    y en cada poll de la NASA). Freno: tras reparar un modulo, espera 60 s
    antes de soltar la siguiente anomalia en cola."""
    global LAST_REPAIR_TS
    if LAST_REPAIR_TS is not None and (_utcnow() - LAST_REPAIR_TS).total_seconds() < 60:
        return
    while PENDING_ANOMALIES and _count_anomalies() < _max_anomalies():
        nxt = PENDING_ANOMALIES.pop(0)
        _sync_pending_state()
        if STATE["modulos"].get(nxt["zona"], {}).get(nxt["slug"]) in ("ok", "pre"):
            _set_module_state(nxt["zona"], nxt["slug"], nxt["nivel"])
            print(f"[NASA] Anomalia en cola sale ahora: {nxt['zona']}.{nxt['slug']} "
                  f"-> {nxt['nivel']} ({nxt.get('reason', '')})")


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
    if nivel == "crit" and cur != "crit":
        # Un modulo que llega a crit resta en el score final.
        try:
            MISSION_STATS["crits"] = int(MISSION_STATS.get("crits", 0)) + 1
        except Exception:
            pass
    if nivel == "warn":
        WARN_SINCE.setdefault(key, _utcnow())
        STATE["warn_since"][key] = WARN_SINCE[key].isoformat()
    elif nivel == "ok":
        WARN_SINCE.pop(key, None)
        STATE["warn_since"].pop(key, None)
        # v20: si el jugador reparo este modulo antes de que saliera la
        # anomalia pendiente, la cancelamos para que no dispare ahora.
        PENDING_ANOMALIES[:] = [x for x in PENDING_ANOMALIES
                                if not (x["zona"] == zona and x["slug"] == slug)]
        _sync_pending_state()
        # Contamos la reparacion para el score final (+50 pts cada una).
        try:
            MISSION_STATS["repairs"] = int(MISSION_STATS.get("repairs", 0)) + 1
        except Exception:
            pass
        # Al reparar, el refuerzo se gasta (hay que volver a reforzar).
        REINFORCED.discard(key)
        STATE["reinforced"] = sorted(REINFORCED)
        # Anotamos la reparacion para el freno de 60 s del drenaje.
        LAST_REPAIR_TS = _utcnow()
        # v19.3: se libero un hueco -> que salga la siguiente anomalia en cola
        # (respectando el freno de 60 s, asi que no sale de inmediato).
        _drain_pending_anomalies()
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
    """Un modulo en warn que nadie atiende en attend_window_sec pasa a crit.
    v19: la ventana es de SEGUNDOS (facil 30, medio 20, dificil 15) — si
    pasa ese tiempo sin atender, la falla escala a crit, parpadea en rojo
    y empieza a drenar puntos. Si el modulo esta REFORZADO (v15), tarda
    el DOBLE: el jugador se preparo."""
    window = GAME_CONFIG.get("attend_window_sec", GAME_CONFIG.get("attend_window_min", 5) * 60)
    now = _utcnow()
    for zona, mods in STATE["modulos"].items():
        for slug, nivel in mods.items():
            if nivel != "warn":
                continue
            key = f"{zona}.{slug}"
            w = window * 2 if key in REINFORCED else window
            since = WARN_SINCE.get(key)
            if since and (now - since).total_seconds() >= w:
                _set_module_state(zona, slug, "crit")
                print(f"[NASA] Escalado {zona}.{slug} warn -> crit (sin atender {w} s)")

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
        # v16 (BUG CORREGIDO): en el XML las <dish> son HERMANAS de las
        # <station>, no hijas. Antes st.findall("dish") siempre devolvia
        # vacio y dsn_dishes era 0. Ahora se agrupan por la estacion que
        # las precede en el documento.
        stations = []
        cur = None
        for child in root:
            if child.tag == "station":
                cur = {"name": child.get("name"),
                       "friendlyName": child.get("friendlyName"),
                       "dishes": []}
                stations.append(cur)
            elif child.tag == "dish" and cur is not None:
                target = child.find("target")
                down = child.find("downSignal")
                cur["dishes"].append({
                    "name": child.get("name"),
                    "activity": child.get("activity"),
                    "azimuth": child.get("azimuthAngle"),
                    "elevation": child.get("elevationAngle"),
                    "spacecraft": target.get("name") if target is not None else None,
                    "dataRate": down.get("dataRate") if down is not None else None,
                    "band": down.get("band") if down is not None else None,
                    "down_active": down.get("active") if down is not None else None,
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
                    # Solo reportar CMEs dirigidas a la Tierra.
                    # Una CME que se aleja no es una amenaza para la estacion.
                    if not _is_cme_earth_directed(ev):
                        continue
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
            # v16: antenas con senal de bajada ACTIVA y estaciones caidas
            # (0 antenas activas) — es lo que genera el fallo de comms.
            out["dsn_active"] = sum(
                1 for s in sts for d in (s.get("dishes") or [])
                if d.get("down_active") == "true")
            out["dsn_down_stations"] = sum(
                1 for s in sts
                if not any(d.get("down_active") == "true"
                           for d in (s.get("dishes") or [])))
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
def _aplicar_senales_tempranas(kp, cme_speed, flr_rank):
    """Senal temprana (v15): un modulo en 'pre' avisa de que una falla se
    acerca, ANTES de que ocurra. kp = ultimo Kp; cme_speed = CME mas rapido
    (km/s); flr_rank = rango de la llamarada mas fuerte (B=0, C=1, M=2, X=3).
    Un modulo 'pre' no necesita reparacion: es un aviso para prepararse
    (reforzar) o vigilar los valores en vivo."""
    pre = set()
    cme_warn = float(GAME_CONFIG.get("cme_speed_warn", 350))
    kp_warn = float(GAME_CONFIG.get("kp_warn", 5))
    flr_min = str(GAME_CONFIG.get("flr_min_class", "M")).upper()
    flr_min_rank = {"B": 0, "C": 1, "M": 2, "X": 3}.get(flr_min, 2)
    # CME acercandose al umbral (70% o mas, sin cruzarlo).
    if cme_speed and cme_speed >= cme_warn * 0.7 and cme_speed < cme_warn:
        pre.add("c.energy")
        pre.add("f.energy")
    # Kp acercandose al umbral (a 1 punto o menos).
    if kp and kp >= kp_warn - 1 and kp < kp_warn:
        pre.add("a.radiation")
        pre.add("f.radiation")
    # Llamarada una clase por debajo del minimo (C cuando el minimo es M).
    if flr_rank >= 0 and flr_rank == flr_min_rank - 1:
        pre.add("a.radiation")
        pre.add("f.radiation")
        pre.add("d.comms")
        pre.add("f.comms")
    for zona, mods in STATE["modulos"].items():
        for slug, nivel in mods.items():
            key = f"{zona}.{slug}"
            if key in pre and nivel == "ok":
                _set_module_state(zona, slug, "pre")
                print(f"[NASA] Senal temprana {key} (pre)")
            elif key not in pre and nivel == "pre":
                _set_module_state(zona, slug, "ok")


# v21: MODO FÁCIL — anomalías tipo FNAF, sin datos reales de la NASA.
# 1 anomalía por noche (por ciclo de día), máximo 2 activas a la vez,
# pseudo-aleatoria, sin saturar al jugador.
FACIL_MODULES = [
    ("a", "habitability"), ("a", "health"), ("a", "eclss"), ("a", "fire"), ("a", "radiation"),
    ("b", "food"), ("b", "thermal"), ("b", "energy"), ("b", "fire"),
    ("c", "eclss"), ("c", "energy"), ("c", "thermal"), ("c", "command"),
    ("d", "command"), ("d", "navigation"), ("d", "comms"), ("d", "robotics"),
    ("e", "structure"), ("e", "robotics-eva"), ("e", "fire"),
    ("f", "energy"), ("f", "thermal"), ("f", "comms"), ("f", "science"),
    ("f", "structure"), ("f", "propulsion"), ("f", "radiation"),
]


def _facil_poll():
    """Modo fácil: genera 1 anomalía pseudo-aleatoria por noche (por ciclo
    de día), máximo 2 activas a la vez. No consulta la NASA."""
    global FACIL_LAST_DAY

    if not MISSION["active"] or not MISSION["start"]:
        return

    # Día actual de la misión (1 minuto real = 1 día en modo fácil).
    total = MISSION["days"] * MISSION["min_per_day"]
    elapsed = (_utcnow() - MISSION["start"]).total_seconds() / 60.0
    day = int(elapsed // MISSION["min_per_day"]) + 1

    # Solo generar si es un día nuevo y no hemos generado para este día.
    if FACIL_LAST_DAY == day:
        return
    FACIL_LAST_DAY = day

    # Si ya hay el máximo de anomalías activas, no generar más.
    if _count_anomalies() >= _max_anomalies():
        return

    # Elegir un módulo aleatorio que esté en "ok".
    modulos_ok = [(z, s) for z, mods in STATE["modulos"].items()
                  for s, niv in mods.items() if niv == "ok"]

    if not modulos_ok:
        return

    # Pseudo-aleatorio basado en el día (reproducible, no satura).
    import random
    rng = random.Random(1000 + day)
    zona, slug = rng.choice(modulos_ok)

    _apply_nasa_anomaly(zona, slug, "warn", f"falla nocturna día {day}")
    print(f"[FACIL] Anomalía aleatoria día {day}: {zona}.{slug} -> warn")


def procesar_eventos_nasa():
    """Consulta las 5 APIs de la NASA, detecta eventos y actualiza estados.

    En modo fácil no consulta la NASA: genera 1 anomalía pseudo-aleatoria
    por noche (tipo FNAF), máximo 2 activas a la vez.
    """
    # v21: modo fácil — sin datos reales de la NASA.
    if GAME_CONFIG.get("difficulty") == "facil":
        _facil_poll()
        return
    global KP_EPISODE
    resultados = {}
    fresh_hours = GAME_CONFIG.get("event_fresh_hours", 24)
    # Valores para las senales tempranas (v15): se llenan abajo.
    kp = 0.0
    cme_max_speed = 0.0
    flr_max_rank = -1  # B=0, C=1, M=2, X=3

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

    # Eventos discretos vigentes en este poll (para retirar los caducados).
    # Se define ANTES de las alertas porque el handler de alertas ya lo usa.
    current_ids = set()

    # --- SWPC Alertas -> fallos reales (v13) ---
    # Antes solo se registraban en Supabase y no hacian nada, aunque son
    # 70+ alertas reales. Ahora una alerta RECIENTE (dentro de
    # event_fresh_hours) pone en warn sus modulos: el clima espacial
    # degrada las comunicaciones y, si habla de electrones/protones o de
    # tormenta geomagnetica, tambien la radiacion. Evento discreto: se
    # aplica una vez por alerta (product_id + fecha de emision).
    alerts_data = nasa_alerts()
    if alerts_data and isinstance(alerts_data, list):
        resultados["alertas"] = len(alerts_data)
        # OJO: alerts.json viene ordenado de MAS RECIENTE a mas viejo
        # (al reves que DONKI), asi que se toman los PRIMEROS 10, no los
        # ultimos: con [-10:] solo se veian alertas viejas de octubre.
        for al in alerts_data[:10]:
            issue = al.get("issue_datetime", "")
            supabase_guardar_evento_nasa("alerts", "alerta_clima_espacial",
                "media", issue, al, ["mod-d-comms", "mod-f-comms"])
            if not _is_fresh(issue, fresh_hours):
                continue
            msg = str(al.get("message", "")).lower()
            ev_id = "alert:" + str(al.get("product_id", "")) + ":" + str(issue)
            current_ids.add(ev_id)
            if ev_id in EVENT_STATE:
                continue
            mods = [("d", "comms"), ("f", "comms")]
            if any(k in msg for k in ("electron", "proton", "geomagnetic", "storm")):
                mods += [("a", "radiation"), ("f", "radiation")]
            EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
            for zona, slug in mods:
                ATTENDED.discard(f"{zona}.{slug}")
                if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                    _apply_nasa_anomaly(zona, slug, "warn", "alerta SWPC")
            print(f"[NASA] Alerta SWPC ({al.get('product_id', '')}, {issue}) -> comms/radiacion warn")

    # --- Eventos discretos (FLR/CME): solo los recientes, aplicados una vez ---
    # Clase minima de llamarada que genera alerta: "M" (medio/facil) o "C"
    # (dificil: las llamaradas C son mucho mas frecuentes -> mas fallos).
    flr_min = str(GAME_CONFIG.get("flr_min_class", "M")).upper()
    flr_data = nasa_flr()
    if flr_data and isinstance(flr_data, list):
        for ev in flr_data[-10:]:
            clase = str(ev.get("classType", ""))
            peak = ev.get("peakTime", "")
            if not _is_fresh(peak, fresh_hours):
                continue
            # Rango de la llamarada para la senal temprana (v15): solo las
            # FRESCAS cuentan (una llamarada vieja no es una amenaza).
            if clase.startswith("B"):
                flr_max_rank = max(flr_max_rank, 0)
            elif clase.startswith("C"):
                flr_max_rank = max(flr_max_rank, 1)
            elif clase.startswith("M"):
                flr_max_rank = max(flr_max_rank, 2)
            elif clase.startswith("X"):
                flr_max_rank = max(flr_max_rank, 3)
            if flr_min == "C":
                if not (clase.startswith("C") or clase.startswith("M") or clase.startswith("X")):
                    continue
            elif not (clase.startswith("M") or clase.startswith("X")):
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
                if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                    _apply_nasa_anomaly(zona, slug, "warn", "llamarada solar")
            print(f"[NASA] Llamarada {clase} ({peak}) -> radiacion/comms warn")
            supabase_guardar_evento_nasa("flr", "llamarada_solar",
                "critica" if clase.startswith("X") else "alta",
                peak, ev, ["mod-a-radiation", "mod-d-comms", "mod-f-comms"])

    cme_data = nasa_cme()
    if cme_data and isinstance(cme_data, list):
        resultados["cme"] = len(cme_data)
        cme_max_speed = 0.0  # solo CMEs dirigidas a la Tierra
        for ev in cme_data[-10:]:
            analyses = ev.get("cmeAnalyses") or [{}]
            speed = float((analyses[0] or {}).get("speed", 0) or 0)
            start = ev.get("startTime", "")
            if not _is_fresh(start, fresh_hours):
                continue
            # SOLO aplicar si la CME viene dirigida a la Tierra.
            # Una CME rapida que se aleje de la Tierra no es una amenaza.
            if not _is_cme_earth_directed(ev):
                print(f"[NASA] CME {speed} km/s ({start}) NO dirigida a la Tierra: se ignora")
                continue
            # v15: registrar la CME mas rapida dirigida a la Tierra
            # (la senal temprana PRE la necesita para avisar antes).
            if speed > cme_max_speed:
                cme_max_speed = speed
            if speed <= GAME_CONFIG.get("cme_speed_warn", 500):
                continue
            ev_id = "cme:" + str(ev.get("activityID", start))
            current_ids.add(ev_id)
            if ev_id in EVENT_STATE:
                continue
            mods = [("c", "energy"), ("f", "energy")]
            # v16: una CME MUY rapida (> cme_fast_speed) es un evento grande:
            # ademas de la energia, trae radiacion (particulas) y afecta a
            # las comunicaciones (apagon de radio).
            if speed > float(GAME_CONFIG.get("cme_fast_speed", 600)):
                mods = mods + [("a", "radiation"), ("f", "radiation"),
                               ("d", "comms"), ("f", "comms")]
            EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
            for zona, slug in mods:
                # Evento nuevo: la atencion de un evento anterior ya no cuenta.
                ATTENDED.discard(f"{zona}.{slug}")
                if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                    _apply_nasa_anomaly(zona, slug, "warn", "CME")
            print(f"[NASA] CME {speed} km/s ({start}) -> energia warn (Tierra)")
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

    # --- NeoWs -> asteroides peligrosos (v13) ---
    # Antes solo se registraba el conteo. Ahora, si en el feed de hoy hay
    # un asteroide potencialmente peligroso, navegacion (D) y estructura
    # (F) pasan a warn: hay debris real que esquivar. Evento discreto
    # por fecha (una vez al dia).
    neo_data = nasa_neo()
    if neo_data:
        count = neo_data.get("element_count", 0) if isinstance(neo_data, dict) else 0
        resultados["neo"] = count
        supabase_guardar_evento_nasa("neo", "asteroides_cercanos",
            "media" if count > 0 else "baja",
            _utcnow().isoformat() + "Z",
            {"count": count}, ["mod-d-navigation", "mod-f-structure"])
        hazardous = []
        try:
            neos = neo_data.get("near_earth_objects", {}) if isinstance(neo_data, dict) else {}
            for day, lst in (neos.items() if isinstance(neos, dict) else []):
                for obj in (lst or []):
                    if isinstance(obj, dict) and obj.get("is_potentially_hazardous_asteroid"):
                        hazardous.append((day, obj.get("name", "?")))
        except Exception:
            hazardous = []
        if hazardous:
            day = hazardous[0][0]
            ev_id = "neo:hazardous:" + str(day)
            current_ids.add(ev_id)
            if ev_id not in EVENT_STATE:
                mods = [("d", "navigation"), ("f", "structure")]
                EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
                for zona, slug in mods:
                    ATTENDED.discard(f"{zona}.{slug}")
                    if STATE["modulos"].get(zona, {}).get(slug) == "ok":
                        _apply_nasa_anomaly(zona, slug, "warn", "asteroide peligroso")
                print(f"[NASA] Asteroide peligroso {hazardous[0][1]} ({day}) -> navegacion/estructura warn")

    # --- Senales tempranas (v15): la falla se puede PREVER ---
    # Si un valor real se ACERCA al umbral pero aun no lo cruza, el modulo
    # pasa a "pre" (amarillo suave): el jugador ve venir la falla y puede
    # reforzar el modulo ANTES de que falle. Si el valor baja, vuelve a ok.
    _aplicar_senales_tempranas(kp, cme_max_speed, flr_max_rank)

    # --- Nuevos fallos reales (v16): DSN, viento solar, campo magnetico ---
    # Son eventos discretos por dia: si la condicion se cumple hoy, el fallo
    # se aplica; si deja de cumplirse, caduca y el modulo se recupera solo.
    _today = _utcnow().strftime("%Y-%m-%d")
    try:
        dsn_data = nasa_dsn()
        if dsn_data and isinstance(dsn_data, dict):
            sts = dsn_data.get("stations") or []
            active = sum(1 for s in sts for d in (s.get("dishes") or [])
                         if d.get("down_active") == "true")
            down_st = [s.get("friendlyName") or s.get("name") for s in sts
                       if not any(d.get("down_active") == "true"
                                  for d in (s.get("dishes") or []))]
            if down_st or active <= 0:
                ev_id = "dsn:down:" + _today
                current_ids.add(ev_id)
                if ev_id not in EVENT_STATE:
                    mods = [("d", "comms"), ("f", "comms")]
                    EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
                    for zona, slug in mods:
                        ATTENDED.discard(f"{zona}.{slug}")
                        if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                            _apply_nasa_anomaly(zona, slug, "warn", "DSN")
                    print(f"[NASA] DSN: estacion caida {down_st} (activas: {active}) -> comms warn")
    except Exception as e:
        print(f"[NASA] Error DSN: {e}")
    # Viento solar rapido (> wind_speed_warn) -> comms (degrada la radio).
    try:
        wind = nasa_wind()
        if wind and isinstance(wind, list):
            act = [x for x in wind if x.get("active")]
            if act:
                ws = float((act[-1] or {}).get("proton_speed") or 0)
                resultados["solar_wind"] = ws
                if ws > float(GAME_CONFIG.get("wind_speed_warn", 600)):
                    ev_id = "wind:fast:" + _today
                    current_ids.add(ev_id)
                    if ev_id not in EVENT_STATE:
                        mods = [("d", "comms"), ("f", "comms")]
                        EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
                        for zona, slug in mods:
                            ATTENDED.discard(f"{zona}.{slug}")
                            if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                                _apply_nasa_anomaly(zona, slug, "warn", "viento solar")
                        print(f"[NASA] Viento solar {ws} km/s -> comms warn")
    except Exception as e:
        print(f"[NASA] Error viento solar: {e}")
    # Campo magnetico fuerte (Bt > mag_bt_warn) -> radiacion.
    try:
        mag = nasa_mag()
        if mag and isinstance(mag, list):
            act = [x for x in mag if x.get("active")]
            if act:
                bt = float((act[-1] or {}).get("bt") or 0)
                resultados["mag_bt"] = bt
                if bt > float(GAME_CONFIG.get("mag_bt_warn", 10)):
                    ev_id = "mag:strong:" + _today
                    current_ids.add(ev_id)
                    if ev_id not in EVENT_STATE:
                        mods = [("a", "radiation"), ("f", "radiation")]
                        EVENT_STATE[ev_id] = {"modules": mods, "level": "warn"}
                        for zona, slug in mods:
                            ATTENDED.discard(f"{zona}.{slug}")
                            if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                                _apply_nasa_anomaly(zona, slug, "warn", "campo magnetico")
                        print(f"[NASA] Campo magnetico Bt {bt} nT -> radiacion warn")
    except Exception as e:
        print(f"[NASA] Error campo magnetico: {e}")

    # --- Escalado por no atender ---
    _escalate_unattended()
    # v19.3: si se libero un hueco (evento caducado/modulo recuperado),
    # que salga la siguiente anomalia en cola.
    _drain_pending_anomalies()
    # v19: drenaje — cada modulo en crit sin atender resta 5 pts por minuto
    # (cada poll). Es la consecuencia de dejar una falla critica.
    try:
        n_crit = sum(1 for mods in STATE["modulos"].values() for v in mods.values() if v == "crit")
        if n_crit and MISSION.get("active"):
            MISSION_STATS["drain"] = int(MISSION_STATS.get("drain", 0)) + n_crit
            if n_crit:
                print(f"[NASA] Drenaje: {n_crit} modulo(s) en crit -> -{5 * n_crit} pts/min")
    except Exception:
        pass

    broadcast_state()
    supabase_sync_modulos()
    return resultados


# ---------------------------------------------------------------------------
# v20: Eventos reales de la ISS (catálogo, no datos NASA en vivo).
# Se aplican al iniciar una mision segun la amenaza de cada mision (mecanicas
# §2 y §7). Son eventos discretos: se aplican una vez y sus modulos se
# recuperan cuando el evento caduca (o al reiniciar la partida).
ISS_EVENTS = {
    # Nauka 29 jul 2021: actitud de la estacion. Amenaza misiones 1 y 2.
    "nauka_2021": {"modules": [("d", "navigation"), ("f", "propulsion")],
                   "level": "warn", "reason": "Nauka 2021 (actitud)"},
    # Soyuz MS-22 dic 2022: fuga de refrigerante. Amenaza misiones 5 y 8.
    "soyuz_ms22_2022": {"modules": [("c", "thermal")],
                        "level": "warn", "reason": "Soyuz MS-22 2022 (refrigerante)"},
    # Fuga de aire Zvezda ago 2020: estructura + ECLSS. Amenaza misiones 2 y 3.
    "zvezda_2020": {"modules": [("e", "structure"), ("c", "eclss")],
                    "level": "warn", "reason": "Fuga de aire Zvezda 2020"},
    # ASAT 2021: debris en navegacion. Amenaza misiones 1 y 4.
    "asat_2021": {"modules": [("d", "navigation"), ("e", "structure")],
                  "level": "warn", "reason": "ASAT 2021 (debris)"},
}
# Mapa mision (id en mayusculas) -> lista de claves ISS_EVENTS que la amenazan.
ISS_BY_MISSION = {
    "SATELLITE REPAIR": ["nauka_2021", "asat_2021"],
    "CARGO CAPTURE": ["nauka_2021", "zvezda_2020"],
    "SPACEWALK (EVA)": ["zvezda_2020"],
    "CUBESAT DEPLOY": ["asat_2021"],
    "MICROGRAVITY SCIENCE": ["soyuz_ms22_2022"],
    "SATELLITE LIFE EXTENSION": ["soyuz_ms22_2022"],
}


def aplicar_eventos_iss(objetivo):
    """Aplica los eventos ISS que amenazan a la mision dada. Se llama al
    iniciar la partida (POST /api/mission/start)."""
    obj = _as_str(objetivo).upper()
    claves = ISS_BY_MISSION.get(obj, [])
    hoy = _utcnow().strftime("%Y-%m-%d")
    for clave in claves:
        ev = ISS_EVENTS.get(clave)
        if not ev:
            continue
        ev_id = "iss:" + clave + ":" + hoy
        if ev_id in EVENT_STATE:
            continue
        EVENT_STATE[ev_id] = {"modules": ev["modules"], "level": ev["level"]}
        for zona, slug in ev["modules"]:
            ATTENDED.discard(f"{zona}.{slug}")
            if STATE["modulos"].get(zona, {}).get(slug) in ("ok", "pre"):
                _apply_nasa_anomaly(zona, slug, ev["level"], ev["reason"])
        print(f"[ISS] Evento {clave} ({ev['reason']}) -> {ev['modules']}")


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


# v19: hilo de escalado cada 5 s — el escalado es de 15-30 s y no puede
# esperar al poll de la NASA (60 s), o la cuenta atras que ve el jugador
# mentiria (el modulo seguiria en warn mucho mas de 15 s). El drenaje
# (-5 pts por modulo en crit por minuto) vive en el poll de 60 s, no aqui.
ESCALATION_ACTIVE = False
ESCALATION_THREAD = None


def escalation_loop():
    global ESCALATION_ACTIVE, MISSION_INTEGRITY
    while ESCALATION_ACTIVE:
        try:
            _escalate_unattended()
            # v19.4: drena la cola cada 5 s para que la siguiente anomalia
            # salga a los ~30 s de la reparacion (el freno de 30 s vive en
            # _drain_pending_anomalies) y no hasta el proximo poll de la
            # NASA (60 s).
            _drain_pending_anomalies()
            # v20: Mission Integrity — cada modulo en crit sin atender resta
            # 1 punto por segundo (0.2 pts cada 5 s). En 0, la mision falla.
            if MISSION["active"] and MISSION["start"]:
                n_crit = sum(1 for mods in STATE["modulos"].values()
                             for v in mods.values() if v == "crit")
                if n_crit > 0:
                    MISSION_INTEGRITY = max(0, MISSION_INTEGRITY - n_crit * 0.2)
        except Exception as e:
            print(f"[Escalation] Error: {e}")
        time.sleep(5)


def iniciar_escalation():
    global ESCALATION_ACTIVE, ESCALATION_THREAD
    if ESCALATION_ACTIVE:
        return
    ESCALATION_ACTIVE = True
    ESCALATION_THREAD = threading.Thread(target=escalation_loop, daemon=True)
    ESCALATION_THREAD.start()
    print("[Escalation] Iniciado (cada 5 s)")


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
            comps = data.get("components") or {}
            if not isinstance(comps, dict):
                comps = {}
            prop_id = str(comps.get("propulsion") or "NONE").upper()
            fuel_cap, fuel_burn = PROPULSION_FUEL.get(prop_id, (0, 0))
            MISSION["failed"] = False
            MISSION.update({"active": True, "start": _utcnow(),
                            "difficulty": str(data.get("difficulty") or GAME_CONFIG.get("difficulty", "medio")),
                            "days": days, "min_per_day": min_per_day,
                            "objetivo": _as_str(data.get("objetivo")), "orbita": _as_str(data.get("orbita")),
                            "lanzador": _as_str(data.get("lanzador")),
                            "fit_score": int(data.get("fit_score") or 0),
                            "components": comps,
                            "fuel_capacity": fuel_cap, "fuel_burn": fuel_burn})
            MISSION_STATS["repairs"] = 0
            MISSION_STATS["crits"] = 0
            MISSION_STATS["penalties"] = 0
            MISSION_STATS["drain"] = 0
            global MISSION_INTEGRITY
            MISSION_INTEGRITY = 100
            REINFORCED.clear()
            # Reiniciar la partida: limpiar el estado del juego para empezar
            # de cero (dia 1, modulos en ok). Los eventos NASA que sigan
            # activos se aplican DE INMEDIATO (en un hilo, para no bloquear
            # la respuesta): si no, la partida empieza vacia y aburrida,
            # porque el poll solo corre cada 60 s y en facil la mision dura
            # 5 minutos.
            global KP_EPISODE
            ATTENDED.clear()
            EVENT_STATE.clear()
            PENDING_ANOMALIES.clear()
            _sync_pending_state()
            WARN_SINCE.clear()
            REINFORCED.clear()
            STATE["reinforced"] = []
            STATE["warn_since"] = {}
            KP_EPISODE = None
            global FACIL_LAST_DAY
            FACIL_LAST_DAY = None
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
                    aplicar_eventos_iss(MISSION.get("objetivo"))
                except Exception as e:
                    print(f"[mision] Error aplicando eventos ISS al iniciar: {e}")
                try:
                    broadcast_state()
                except Exception:
                    pass
                # v20: avisar a TODOS los clientes que la partida se reinicio,
                # para que limpien su cache local y muestren la notificacion.
                try:
                    asyncio.run_coroutine_threadsafe(
                        _broadcast_async(list(WS_CLIENTS), json.dumps({
                            "type": "mission_reset",
                            "data": {
                                "objetivo": MISSION.get("objetivo"),
                                "difficulty": MISSION.get("difficulty"),
                                "days": MISSION.get("days"),
                                "min_per_day": MISSION.get("min_per_day"),
                            }
                        })), WS_LOOP
                    )
                except Exception as e:
                    print(f"[mision] No se pudo broadcast mission_reset: {e}")
            threading.Thread(target=_aplicar_eventos_inicio, daemon=True).start()
            body = json.dumps({"ok": True, "mission": mission_status()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/nasa/poll":
            # Forzar un poll inmediato de las APIs de la NASA (v15: boton
            # "Datos NASA" del menu; tambien existe en GET).
            resultados = procesar_eventos_nasa()
            body = json.dumps({"ok": True, "resultados": resultados}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/module":
            # Cambiar el estado de un modulo por HTTP (v17: lo mismo que
            # el mensaje WS set_module; lo usa el store cuando no hay WS,
            # por ejemplo al entrar por el tunel de Cloudflare, que no
            # pasa el puerto 5001 del WebSocket).
            data = self._json_body()
            zona = str(data.get("zona", "")).lower()
            modulo = str(data.get("modulo", "")).lower()
            status = str(data.get("status", "")).lower()
            if (zona in STATE["modulos"]
                    and modulo in STATE["modulos"][zona]
                    and status in VALID_STATUSES):
                prev = STATE["modulos"][zona][modulo]
                _set_module_state(zona, modulo, status)
                key = f"{zona}.{modulo}"
                if status == "ok" and prev in ("warn", "crit"):
                    try:
                        MISSION_STATS["repairs"] = int(MISSION_STATS.get("repairs", 0)) + 1
                    except Exception:
                        pass
                if status == "ok":
                    ATTENDED.add(key)
                broadcast_state()
                body = json.dumps({"ok": True, "zona": zona, "modulo": modulo,
                                   "status": status}).encode()
            else:
                body = json.dumps({"ok": False, "error": "modulo o estado invalido"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed == "/api/mission/penalty":
            # Penalizacion por opcion mal elegida (v15): -10 por cada una.
            # Es POST (lo llama la mini-web al fallar el diagnostico).
            data = self._json_body()
            pts = int(data.get("points") or 10)
            if pts < 1:
                pts = 10
            if pts > 50:
                pts = 50
            try:
                MISSION_STATS["penalties"] = int(MISSION_STATS.get("penalties", 0)) + 1
            except Exception:
                pass
            body = json.dumps({"ok": True, "penalties": MISSION_STATS.get("penalties", 0),
                               "points_lost": -10 * int(MISSION_STATS.get("penalties", 0)),
                               "score": mission_score()}).encode()
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
            prev = STATE["modulos"][zona][modulo]
            _set_module_state(zona, modulo, status)
            key = f"{zona}.{modulo}"
            if status == "ok" and prev in ("warn", "crit"):
                # El jugador reparo el modulo: +50 en el score final.
                try:
                    MISSION_STATS["repairs"] = int(MISSION_STATS.get("repairs", 0)) + 1
                except Exception:
                    pass
            if status == "ok":
                # El jugador atendio el modulo (clic): el poll no lo vuelve
                # a subir mientras el evento/episodio vigente siga activo.
                ATTENDED.add(key)
            else:
                ATTENDED.discard(key)
            print(f"[WS] Modulo {zona}.{modulo} -> {status}")
            broadcast_state()
    elif mtype == "reinforce":
        # Reforzar un modulo (v15): tarda el DOBLE en escalar a crit.
        zona = msg.get("zona", "").lower()
        modulo = msg.get("modulo", "").lower()
        if zona in STATE["modulos"] and modulo in STATE["modulos"][zona]:
            REINFORCED.add(f"{zona}.{modulo}")
            STATE["reinforced"] = sorted(REINFORCED)
            print(f"[WS] Modulo {zona}.{modulo} reforzado (doble tiempo)")
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
    iniciar_escalation()

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

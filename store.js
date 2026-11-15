/* ============ TIENDA COMPARTIDA DE ESTADO DE MODULOS ============
   Un unico objeto de estado para toda la estacion espacial.
   Las paginas de zona y el mapa lo leen; window.setModuleStatus(id, estado)
   sirve para forzar estados desde la consola y depurar alertas.
   El estado se guarda en localStorage para que sobreviva cambios de pagina.
   Soporta sincronizacion con el backend (fetch + WebSocket) para datos
   reales de la NASA y estado compartido entre jugadores.
   No hay datos de simulacion: solo el nivel de alerta (ok / warn / crit).
*/
const STORE_KEY = "station-module-status-v1";
const ALERT_KEY = "station-alert-v1";
const STATUS_RANK = { ok: 0, pre: 1, warn: 2, crit: 3 };

// Backend: si está disponible, se usa como fuente de verdad compartida.
// v17 (tunel): MISMO ORIGEN, sin localhost. Antes BACKEND_URL era
// "http://localhost:5000": en tu maquina funcionaba, pero para quien
// entra por el tunel de Cloudflare, "localhost" es SU maquina (ahi no
// hay juego) y las anomalias no cargaban. Con window.location.origin
// las llamadas van por la misma direccion de la pagina (tunel o local).
let BACKEND_URL = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "http://localhost:5000";
let USE_BACKEND = false;
let WS = null;
let WS_RECONNECT_TIMER = null;

// Modulos por zona: slugs en ingles, minusculas, con guiones.
// El ID completo de un modulo es mod-<zona>-<slug>, por ejemplo mod-c-eclss.
const ZONE_MODULES = {
  a: [
    { id: "habitability", name: "Module: Habitability" },
    { id: "health", name: "Module: Health" },
    { id: "eclss", name: "Module: ECLSS" },
    { id: "fire", name: "Module: Fire" },
    { id: "radiation", name: "Module: Radiation" }
  ],
  b: [
    { id: "food", name: "Module: Food" },
    { id: "thermal", name: "Module: Thermal" },
    { id: "energy", name: "Module: Energy" },
    { id: "fire", name: "Module: Fire" }
  ],
  c: [
    { id: "eclss", name: "Module: ECLSS" },
    { id: "energy", name: "Module: Energy" },
    { id: "thermal", name: "Module: Thermal" },
    { id: "command", name: "Module: Command" }
  ],
  d: [
    { id: "command", name: "Module: Command" },
    { id: "navigation", name: "Module: Navigation" },
    { id: "comms", name: "Module: Comms" },
    { id: "robotics", name: "Module: Robotics" }
  ],
  e: [
    { id: "structure", name: "Module: Structure" },
    { id: "robotics-eva", name: "Module: Robotics/EVA" },
    { id: "fire", name: "Module: Fire" }
  ],
  f: [
    { id: "energy", name: "Module: Energy" },
    { id: "thermal", name: "Module: Thermal" },
    { id: "comms", name: "Module: Comms" },
    { id: "science", name: "Module: Science" },
    { id: "structure", name: "Module: Structure" },
    { id: "propulsion", name: "Module: Propulsion" },
    { id: "radiation", name: "Module: Radiation" }
  ]
};

function fullId(zone, slug) { return `mod-${zone}-${slug}`; }

function allModules() {
  const out = [];
  Object.keys(ZONE_MODULES).forEach(zone =>
    ZONE_MODULES[zone].forEach(m => out.push({ zone, moduleId: fullId(zone, m.id), name: m.name }))
  );
  return out;
}

function zoneOf(moduleId) {
  const z = Object.keys(ZONE_MODULES).find(zone => moduleId.startsWith(`mod-${zone}-`));
  return z || null;
}

// Unico objeto de estado: moduleId -> 'ok' | 'warn' | 'crit'
let status = {};

function loadStatus() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) status = parsed;
    }
  } catch (e) {
    console.warn("store: no se pudo leer localStorage", e);
  }
  const clean = {};
  allModules().forEach(m => {
    const v = status[m.moduleId];
    clean[m.moduleId] = STATUS_RANK[v] !== undefined ? v : "ok";
  });
  status = clean;
  saveStatus();
}

function saveStatus() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(status)); } catch (e) {
    console.warn("store: no se pudo escribir localStorage", e);
  }
}

/* ============ SINCRONIZACION CON BACKEND ============ */

function backendPath(p) { return BACKEND_URL + p; }

async function fetchFromBackend(path) {
  if (!USE_BACKEND) return null;
  try {
    const res = await fetch(backendPath(path), { credentials: "include" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("store: backend no disponible", path, e);
    return null;
  }
}

// v19: modulos reforzados (escudo 🛡) y cuando paso cada uno a warn,
// segun el backend. Las zonas los usan para mostrar el escudo y la
// cuenta atras de escalado (15-30 s sin atender -> crit).
let REINFORCED_SET = new Set();
let WARN_SINCE_MAP = {};
function isReinforced(moduleId) {
  const zone = zoneOf(moduleId);
  const slug = moduleId.replace(/^mod-[a-f]-/, "");
  return REINFORCED_SET.has(zone + "." + slug);
}
function getWarnSince(moduleId) {
  const zone = zoneOf(moduleId);
  const slug = moduleId.replace(/^mod-[a-f]-/, "");
  return WARN_SINCE_MAP[zone + "." + slug] || null;
}
async function syncWithBackend() {
  const data = await fetchFromBackend("/api/state");
  if (!data || !data.data) return;
  const s = data.data;
  // v19: el backend manda los reforzados y los warn_since.
  if (Array.isArray(s.reinforced)) REINFORCED_SET = new Set(s.reinforced);
  if (s.warn_since && typeof s.warn_since === "object") WARN_SINCE_MAP = s.warn_since;
  // Aplicar estados de zonas al store local
  if (s.modulos && typeof s.modulos === "object") {
    Object.keys(s.modulos).forEach(zone => {
      const mods = s.modulos[zone];
      if (mods && typeof mods === "object") {
        Object.keys(mods).forEach(slug => {
          const st = mods[slug];
          if (STATUS_RANK[st] !== undefined) {
            const full = fullId(zone, slug);
            if (full in status) status[full] = st;
          }
        });
      }
    });
    saveStatus();
    window.dispatchEvent(new CustomEvent("station:modulestatuschange", {
      detail: { moduleId: null, zone: null, status: null, prev: null, zoneStatus: null }
    }));
  }
  USE_BACKEND = true;
}

function wsUrlFromLocation() {
  // v17 (tunel): el WS se deriva de la pagina. En localhost el WS esta
  // en el puerto 5001; en el tunel (https) se intenta el mismo host
  // (wss://host). El tunel solo pasa el puerto 5000, asi que ahi el WS
  // no conecta y el juego se actualiza por el polling de 30 s (y las
  // reparaciones van por POST /api/module). Sin permiso de Firefox.
  if (typeof window === "undefined" || !window.location) return "ws://localhost:5001";
  const proto = window.location.protocol === "https:" ? "wss://" : "ws://";
  const host = window.location.hostname || "localhost";
  if (host === "localhost" || host === "127.0.0.1") return proto + host + ":5001";
  return proto + window.location.host;
}
function connectWebSocket() {
  if (!USE_BACKEND) return;
  const wsUrl = wsUrlFromLocation();
  try {
    WS = new WebSocket(wsUrl);
    WS.onopen = () => {
      WS.send(JSON.stringify({ type: "get_state" }));
    };
    WS.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // v20: otro jugador (o el propio) reinicio la partida. Limpiar cache
        // local (estados, alertas, zonas vistas) y avisar a las paginas para
        // que muestren la notificacion y recarguen si hace falta.
        if (msg.type === "mission_reset") {
          try {
            localStorage.removeItem(STORE_KEY);
            localStorage.removeItem(ALERT_KEY);
            localStorage.removeItem("station-zones-seen-v1");
          } catch (e) {
            console.warn("store: no se pudo limpiar cache al resetear", e);
          }
          status = {};
          loadStatus();
          saveStatus();
          window.dispatchEvent(new CustomEvent("station:missionreset", {
            detail: msg.data || {}
          }));
          return;
        }
        if (msg.type === "state" && msg.data) {
          const s = msg.data;
          if (s.modulos && typeof s.modulos === "object") {
            Object.keys(s.modulos).forEach(zone => {
              const mods = s.modulos[zone];
              if (mods && typeof mods === "object") {
                Object.keys(mods).forEach(slug => {
                  const st = mods[slug];
                  if (STATUS_RANK[st] !== undefined) {
                    const full = fullId(zone, slug);
                    if (full in status && status[full] !== st) {
                      const prev = status[full];
                      status[full] = st;
                      const zoneId = zone;
                      saveStatus();
                      window.dispatchEvent(new CustomEvent("station:modulestatuschange", {
                        detail: { moduleId: full, zone: zoneId, status: st, prev, zoneStatus: getZoneStatus(zoneId) }
                      }));
                    }
                  }
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn("store: error procesando mensaje WS", e);
      }
    };
    WS.onclose = () => {
      WS = null;
      if (USE_BACKEND) {
        WS_RECONNECT_TIMER = setTimeout(connectWebSocket, 3000);
      }
    };
    WS.onerror = () => {
      if (WS) { WS.close(); WS = null; }
    };
  } catch (e) {
    console.warn("store: no se pudo conectar WebSocket", e);
    if (USE_BACKEND) WS_RECONNECT_TIMER = setTimeout(connectWebSocket, 3000);
  }
}

function disconnectWebSocket() {
  if (WS_RECONNECT_TIMER) { clearTimeout(WS_RECONNECT_TIMER); WS_RECONNECT_TIMER = null; }
  if (WS) { WS.close(); WS = null; }
}

function setBackend(url, enabled) {
  BACKEND_URL = url || BACKEND_URL;
  USE_BACKEND = enabled === undefined ? true : enabled;
  if (USE_BACKEND) {
    syncWithBackend();
    connectWebSocket();
  } else {
    disconnectWebSocket();
  }
}

window.setBackend = setBackend;

function saveAlert(zoneId, level) {
  try {
    localStorage.setItem(ALERT_KEY, JSON.stringify({ zone: zoneId, level: level, at: Date.now() }));
  } catch (e) {}
}

function readAlert() {
  try { return JSON.parse(localStorage.getItem(ALERT_KEY) || "null"); } catch (e) { return null; }
}

function getModuleStatus(id) { return status[id] !== undefined ? status[id] : "ok"; }

async function sendSetModule(moduleId, statusValue) {
  // Propaga el cambio al backend (fuente de verdad compartida) para que
  // todas las paginas/clientes lo vean.
  // v17 (tunel): si no hay WebSocket (el tunel no pasa el puerto 5001),
  // se usa POST /api/module, que hace exactamente lo mismo. Sin esto, la
  // reparacion quedaba solo en local y el siguiente polling la reverted.
  const zone = zoneOf(moduleId);
  if (!zone || !USE_BACKEND) return;
  const slug = moduleId.replace(/^mod-[a-f]-/, "");
  if (WS && WS.readyState === 1) {
    try {
      WS.send(JSON.stringify({ type: "set_module", zona: zone, modulo: slug, status: statusValue }));
      return;
    } catch (e) {
      console.warn("store: no se pudo enviar set_module por WS, uso POST", e);
    }
  }
  try {
    await fetch(backendPath("/api/module"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zona: zone, modulo: slug, status: statusValue }),
    });
  } catch (e) {
    console.warn("store: no se pudo enviar set_module por POST", e);
  }
}

function setModuleStatus(id, statusValue) {
  if (STATUS_RANK[statusValue] === undefined) return false;
  if (!(id in status)) return false;
  const prev = status[id];
  status[id] = statusValue;
  saveStatus();
  // Atender un modulo (clic) se propaga al backend: asi el estado compartido
  // queda en ok y el poll de la NASA no lo vuelve a subir mientras el
  // evento vigente siga activo.
  if (prev !== statusValue) sendSetModule(id, statusValue);
  const zone = zoneOf(id);
  // Cuando se resuelve un modulo a "ok", limpiar la alerta guardada para esa zona
  // para que el boton MAP del mapa deje de parpadear aunque quede estado viejo en localStorage.
  if (statusValue === "ok" && zone) {
    try {
      const saved = readAlert();
      if (saved && String(saved.zone).toUpperCase() === String(zone).toUpperCase()) {
        localStorage.removeItem(ALERT_KEY);
      }
    } catch (e) {}
  }
  // Nueva alerta: la zona deja de estar "vista" para que parpadee de nuevo en el mapa.
  // Como localStorage se comparte entre paginas, esto funciona aunque el cambio se haga en otra pagina.
  if (statusValue !== "ok" && zone) {
    try {
      const SEEN_KEY = "station-zones-seen-v1";
      const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
      seen.delete(zone.toUpperCase());
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch (e) {}
  }
  window.dispatchEvent(new CustomEvent("station:modulestatuschange", {
    detail: { moduleId: id, zone, status: statusValue, prev, zoneStatus: getZoneStatus(zone) }
  }));
  return true;
}

function getZoneStatus(zoneId) {
  let worst = "ok";
  ZONE_MODULES[zoneId].forEach(m => {
    const s = getModuleStatus(fullId(zoneId, m.id));
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  });
  return worst;
}

function getAnyAlertStatus() {
  let worst = "ok";
  Object.keys(ZONE_MODULES).forEach(zone => {
    const zs = getZoneStatus(zone);
    if (STATUS_RANK[zs] > STATUS_RANK[worst]) worst = zs;
  });
  return worst;
}

function setZoneStatus(zoneId, statusValue) {
  if (STATUS_RANK[statusValue] === undefined) return false;
  const mods = ZONE_MODULES[zoneId];
  if (!mods) return false;
  mods.forEach(m => setModuleStatus(fullId(zoneId, m.id), statusValue));
  return true;
}

function getZoneModules(zoneId) {
  return ZONE_MODULES[zoneId].map(m => ({
    moduleId: fullId(zoneId, m.id), name: m.name, status: getModuleStatus(fullId(zoneId, m.id))
  }));
}

loadStatus();

// Intenta conectar con el backend si esta disponible (no bloquea si no lo está)
setTimeout(() => {
  try { setBackend(BACKEND_URL, true); } catch (e) { console.warn("store: no se pudo iniciar backend", e); }
}, 500);
// Re-sincronizacion periodica (red de seguridad): si el WebSocket se cae,
// el estado del backend se vuelve a leer cada 30 s para que la pagina no
// se quede con estados viejos.
setInterval(() => { try { if (USE_BACKEND) syncWithBackend(); } catch (e) {} }, 30000);

// ---- Datos en vivo de la NASA (v12) ----
// El store lee /api/nasa/live cada 60 s y guarda los valores reales.
// Cada monitor muestra el valor que afecta a su modulo (su "actividad"),
// para que no se vea vacio aunque este en OK. Cuando llega un dato nuevo,
// se avisa con "station:livechange" y las zonas vuelven a dibujar.
let liveData = null;
const LIVE_LABELS = {
  "energy": d => d.cme_speed != null ? "CME " + Math.round(d.cme_speed) + " km/s" : (d.solar_wind != null ? "VIENTO " + Math.round(d.solar_wind) + " km/s" : null),
  "radiation": d => d.kp != null ? "Kp " + d.kp : null,
  "comms": d => d.dsn_stations != null ? "DSN " + d.dsn_stations : null,
  "navigation": d => d.neo_count != null ? "NEO " + d.neo_count : null,
  "thermal": d => d.solar_wind != null ? "VIENTO " + Math.round(d.solar_wind) + " km/s" : null,
  "eclss": d => d.kp != null ? "Kp " + d.kp : null,
  "command": d => d.dsn_stations != null ? "DSN " + d.dsn_stations : null,
  "robotics": d => d.neo_count != null ? "NEO " + d.neo_count : null,
  "robotics-eva": d => d.kp != null ? "Kp " + d.kp : null,
  "structure": d => d.neo_count != null ? "NEO " + d.neo_count : null,
  "science": d => d.iss_lat != null ? "ISS " + Number(d.iss_lat).toFixed(1) + "°" : null,
  "propulsion": d => d.iss_alt != null ? "ISS " + Math.round(d.iss_alt) + " km" : null,
  "fire": d => d.kp != null ? "Kp " + d.kp : null,
  "health": d => d.kp != null ? "Kp " + d.kp : null,
  "habitability": d => d.kp != null ? "Kp " + d.kp : null,
  "food": d => d.iss_lat != null ? "ISS " + Number(d.iss_lat).toFixed(1) + "°" : null
};
function getModuleLiveLabel(moduleId) {
  if (!liveData) return "";
  const slug = String(moduleId).replace(/^mod-[a-f]-/, "");
  const fn = LIVE_LABELS[slug];
  if (!fn) return "";
  try { return fn(liveData) || ""; } catch (e) { return ""; }
}
function fetchLiveData() {
  if (!USE_BACKEND || typeof fetch !== "function") return;
  fetch(BACKEND_URL + "/api/nasa/live").then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.data) {
      liveData = d.data;
      window.dispatchEvent(new CustomEvent("station:livechange", { detail: { live: liveData } }));
    }
  }).catch(() => {});
}
setInterval(() => { try { fetchLiveData(); } catch (e) {} }, 60000);
setTimeout(() => { try { fetchLiveData(); } catch (e) {} }, 1500);

/* Sincronizar cambios entre pestañas: si el mapa (u otra pagina) cambia un estado
   en localStorage, esta pagina se entera y vuelve a renderizar para que el boton
   MAP parpadee sin importar donde estes. */
window.addEventListener("storage", e => {
  if (e.key !== STORE_KEY && e.key !== ALERT_KEY) return;
  try {
    if (e.key === STORE_KEY && e.newValue) {
      const parsed = JSON.parse(e.newValue);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) status = parsed;
    }
    window.dispatchEvent(new CustomEvent("station:modulestatuschange", {
      detail: { moduleId: null, zone: null, status: null, prev: null, zoneStatus: null }
    }));
  } catch (err) {}
});

// v15: penalizacion por opcion mal (-10) y reforzar un modulo.
function addPenalty(points) {
  if (!USE_BACKEND) return Promise.resolve(null);
  return fetch(BACKEND_URL + "/api/mission/penalty", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points: points || 10 })
  }).then(r => r.ok ? r.json() : null).catch(() => null);
}
function reinforceModule(moduleId) {
  const parts = moduleId.split("-");
  const zone = parts[1];
  const slug = parts.slice(2).join("-");
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "reinforce", zona: zone, modulo: slug }));
  }
}

window.stationStore = {
  getModuleStatus, setModuleStatus, getZoneStatus, setZoneStatus, getAnyAlertStatus, getZoneModules,
  saveAlert, readAlert, fullId, allModules, setBackend, getModuleLiveLabel,
  addPenalty, reinforce: reinforceModule, isReinforced, getWarnSince
};
// Funcion de depuracion global: window.setModuleStatus('mod-c-eclss', 'warn' | 'crit' | 'ok')
window.setModuleStatus = setModuleStatus;

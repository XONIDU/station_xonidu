/* ============ CONFIGURACIÓN ============ */
const ZONE = "a";
const CONFIG = {
  storageKey: "zona-a-shapes-v1",
  backUrl: "../station-map/index.html",                        // a dónde manda el botón MAP
  mapButton: { x:38.4, y:86.6, w:22.4, h:10.4 }    // zona clicable sobre el MAP de la imagen (%)
};

// pts = esquinas [x, y] en % de la imagen: arriba-izq, arriba-der, abajo-der, abajo-izq.
const MODULES = [
  { id:"habitability", name:"Module: Habitability", status:"ok", pts:[[3.7,38.4],[19.9,38.4],[19.9,69.3],[3.8,71.0]] },
  { id:"health",       name:"Module: Health",       status:"ok", pts:[[23.4,38.3],[37.6,38.3],[37.3,70.9],[23.3,70.9]] },
  { id:"eclss",        name:"Module: ECLSS",        status:"ok", pts:[[40.8,38.4],[54.6,38.4],[54.6,71.1],[40.7,70.7]] },
  { id:"fire",         name:"Module: Fire",         status:"ok", pts:[[58.1,38.8],[70.8,38.8],[71.2,71.1],[57.5,71.3]] },
  { id:"radiation",    name:"Module: Radiation",    status:"ok", pts:[[74.4,38.9],[87.4,38.7],[87.3,70.8],[74.0,71.4]] }
];

/* ============ ESTADO ============ */
const $ = (s) => document.querySelector(s);
const stage = $("#stage"), svg = $("#shapes");
const STATUS_TEXT = { ok:"OK", warn:"WARNING", crit:"CRITICAL" };
const STATUS_SHORT = { ok:"OK", pre:"PRE", warn:"WARN", crit:"CRIT" };
const NS = "http://www.w3.org/2000/svg";
let selected = null;

try {
  const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "null");
  if (saved) saved.forEach(s => { const m = MODULES.find(m => m.id === s.id); if (m) m.pts = s.pts; });
} catch (e) {}

function localFullId(slug) { return `mod-${ZONE}-${slug}`; }

/* Sincronizar el color y el parpadeo de cada poligono con la tienda compartida.
   Sin esto los poligonos se quedaban siempre en verde aunque el store dijera
   warn/crit: el estado local (m.status) nunca se actualizaba desde la tienda. */
function syncModuleStatus() {
  MODULES.forEach(m => { m.status = stationStore.getModuleStatus(localFullId(m.id)); });
}

/* ============ IMAGEN ============ */
const bg = $("#bg");
bg.onerror = () => stage.classList.add("no-bg");   // sin imagen: fondo oscuro 16:9

/* ============ RENDER ============ */
const pointsAttr = (pts) => pts.map(p => p.join(",")).join(" ");

function render() {
  svg.innerHTML = "";
  MODULES.forEach(m => {
    const p = document.createElementNS(NS, "polygon");
    p.setAttribute("points", pointsAttr(m.pts));
    p.setAttribute("class", `poly ${m.status}` + (selected === m.id ? " sel" : ""));
    p.dataset.id = m.id;
    p.dataset.moduleId = localFullId(m.id);
    p.setAttribute("tabindex", "0");
    p.setAttribute("role", "button");
    p.setAttribute("aria-label", `${m.name}. Estado: ${STATUS_TEXT[m.status]}`);
    svg.appendChild(p);
    // Etiqueta de estado en vivo sobre el monitor: cada monitor muestra su
    // propio estado (OK / WARN / CRIT). Es la interfaz del modulo: se ve de
    // un vistazo cual falla, y al tocarlo se abre su mini-web (y se atiende).
    const cx = m.pts.reduce((a, pt) => a + pt[0], 0) / m.pts.length;
    const cy = m.pts.reduce((a, pt) => a + pt[1], 0) / m.pts.length;
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", cy);
    // v19: clase shielded (azul) si el modulo esta reforzado; urgent
    // (parpadea en rojo) si la cuenta atras de escalado es <= 5 s.
    let _lblCls = "poly-label " + m.status;
    const _fullId2 = localFullId(m.id);
    const _sh2 = (typeof stationStore !== "undefined" && stationStore.isReinforced) ? stationStore.isReinforced(_fullId2) : false;
    if (m.status === "pre" && _sh2) _lblCls += " shielded";
    if (m.status === "warn" && typeof stationStore !== "undefined" && stationStore.getWarnSince) {
      const _s2 = stationStore.getWarnSince(_fullId2);
      if (_s2) {
        let _d2 = "medio";
        try { const _dd = localStorage.getItem("xonidu-difficulty-v1"); if (_dd === "facil" || _dd === "medio" || _dd === "dificil") _d2 = _dd; } catch (e) {}
        let _w2 = _d2 === "facil" ? 30 : (_d2 === "medio" ? 20 : 15);
        if (_sh2) _w2 *= 2;
        if (_w2 - (Date.now() - new Date(_s2).getTime()) / 1000 <= 5) _lblCls += " urgent";
      }
    }
    label.setAttribute("class", _lblCls);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    const nameLine = document.createElementNS(NS, "tspan");
    nameLine.setAttribute("x", cx);
    nameLine.setAttribute("dy", "-3.2");
    nameLine.setAttribute("class", "poly-label-name");
    nameLine.textContent = m.name.replace(/^Module:\s*/, "").toUpperCase();
    // Tercera linea: la actividad en vivo del modulo (valor real de la
    // NASA que lo afecta). Si no hay dato todavia, no se dibuja la linea.
    const liveText = (typeof stationStore !== "undefined" && stationStore.getModuleLiveLabel)
      ? stationStore.getModuleLiveLabel(localFullId(m.id)) : "";
    let liveLine = null;
    if (liveText) {
      liveLine = document.createElementNS(NS, "tspan");
      liveLine.setAttribute("x", cx);
      liveLine.setAttribute("dy", "2.6");
      liveLine.setAttribute("class", "poly-label-live");
      liveLine.textContent = liveText;
    }
    const statusLine = document.createElementNS(NS, "tspan");
    statusLine.setAttribute("x", cx);
    statusLine.setAttribute("dy", "2.6");
    statusLine.setAttribute("class", "poly-label-status");
    // v19: si el modulo esta REFORZADO se ve el escudo (azul 🛡) en vez
    // de seguir en amarillo; y si esta en warn, la cuenta atras de
    // escalado (15-30 s sin atender -> crit, parpadea en rojo).
    const _full = localFullId(m.id);
    const _shielded = (typeof stationStore !== "undefined" && stationStore.isReinforced) ? stationStore.isReinforced(_full) : false;
    let _st = STATUS_SHORT[m.status];
    if (m.status === "pre" && _shielded) _st = "🛡 PRE";
    if (m.status === "warn" && typeof stationStore !== "undefined" && stationStore.getWarnSince) {
      const _since = stationStore.getWarnSince(_full);
      if (_since) {
        let _diff = "medio";
        try { const _d = localStorage.getItem("xonidu-difficulty-v1"); if (_d === "facil" || _d === "medio" || _d === "dificil") _diff = _d; } catch (e) {}
        let _win = _diff === "facil" ? 30 : (_diff === "medio" ? 20 : 15);
        if (_shielded) _win *= 2;
        const _left = Math.max(0, Math.ceil(_win - (Date.now() - new Date(_since).getTime()) / 1000));
        _st = "WARN " + _left + "s";
      }
    }
    statusLine.textContent = _st;
    label.appendChild(nameLine);
    if (liveLine) label.appendChild(liveLine);
    label.appendChild(statusLine);
    svg.appendChild(label);
  });
  renderPanel();
}

function renderPanel() {
  const m = MODULES.find(m => m.id === selected);
  $("#hint").hidden = !!m;
  $("#info").hidden = !m;
  if (!m) return;
  $("#mTitle").textContent = m.name;
}


/* ============ PANTALLA EXPANDIDA DEL MODULO (overlay) ============ */
const screen = $("#moduleScreen"), screenExit = $("#moduleExit");
const screenTitle = $("#moduleTitle"), screenId = $("#moduleId"), screenStatus = $("#moduleStatus");
const frame = $("#moduleFrame");
let activeModule = null;

function openModule(moduleId) {
  const m = MODULES.find(m => localFullId(m.id) === moduleId);
  if (!m) return;
  // Clic en CUALQUIER modulo abre su pantalla expandida, este normal o con falla.
  activeModule = moduleId;
  screenTitle.textContent = m.name;
  screenId.textContent = moduleId;
  const st = stationStore.getModuleStatus(moduleId);
  screenStatus.textContent = STATUS_TEXT[st];
  screenStatus.className = "module-status " + st;
  if (st !== "ok") screenStatus.classList.add("blink-" + st);
  frame.src = "modulos/" + m.id + ".html";
  screen.hidden = false;
  screen.removeAttribute("aria-hidden");
  screenExit.focus();
}

function closeModule() {
  if (!activeModule) return;
  activeModule = null;
  screenTitle.textContent = "";
  screenId.textContent = "";
  screenStatus.textContent = "";
  screenStatus.className = "module-status";
  frame.src = "about:blank";
  screen.hidden = true;
  screen.setAttribute("aria-hidden", "true");
}

screenExit.addEventListener("click", closeModule);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !screen.hidden) closeModule(); });

/* sincronizar con la tienda compartida mientras la pantalla esta abierta */
window.addEventListener("station:modulestatuschange", e => {
  if (activeModule && e.detail.moduleId === activeModule) {
    screenStatus.textContent = STATUS_TEXT[e.detail.status] || STATUS_TEXT.ok;
    screenStatus.className = "module-status " + (e.detail.status || "ok");
  }
  syncModuleStatus();
  render();
  updateMapBlink();
});
// Cuando llega un dato en vivo nuevo (CME, Kp, DSN...), re-dibujar los
// monitores para que la linea de actividad se actualice.
window.addEventListener("station:livechange", () => { syncModuleStatus(); render(); updateMapBlink(); });

/* ============ SELECCION Y ESTADO ============ */
function select(id) { selected = id; render(); }
svg.addEventListener("click", e => {
  const target = e.target.closest("[data-module-id]");
  if (target && target.dataset.moduleId) {
    const id = target.dataset.moduleId;
    // El clic SOLO abre la pantalla del modulo: la falla se resuelve
    // completando la tarea de reparacion dentro de la mini-web (v9).
    openModule(id); return;
  }
  if (target && target.dataset.id) select(target.dataset.id);
});
svg.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset.id) { e.preventDefault(); select(e.target.dataset.id); }
});

const setLocalModuleStatus = (id, status) => {            // usa ids cortos locales; delega a la tienda compartida
  stationStore.setModuleStatus(localFullId(id), status);
}

/* Alerta en el boton MAP: cuando hay una falla en CUALQUIER zona, solo el
   boton MAP parpadea con el peor estado de la estacion (aviso para ir al
   mapa). Los monitores NO parpadean en global: cada poligono solo se
   enciende con SU propio estado (.poly.warn/.poly.crit), asi que en la zona
   solo se enciende el monitor/modulo que falla, no todos. */
function updateMapBlink() {
  const level = stationStore.getAnyAlertStatus();
  const btn = $("#mapBtn"), hot = $("#mapHot");
  btn.classList.toggle("alert-warn", level === "warn");
  btn.classList.toggle("alert-crit", level === "crit");
  hot.classList.toggle("alert-warn", level === "warn");
  hot.classList.toggle("alert-crit", level === "crit");
}

syncModuleStatus();
updateMapBlink();

// Abrir automaticamente el modulo que llega desde el mapa (parametro ?mod=X)
const urlParams = new URLSearchParams(location.search);
const modFromUrl = urlParams.get("mod");
// Apertura automatica del modulo desactivada: el jugador abre el modulo
// haciendo clic en el mapa de la zona. El modulo sigue parpadeando si tiene
// una falla activa.
if (false && modFromUrl) {
  setTimeout(() => openModule(localFullId(modFromUrl)), 200);
}

/* ============ WEBSOCKET: estado en tiempo real ============ */
let ws;
function conectarWS() {
  try {
    // v17 (tunel): el WS se deriva de la pagina, no de localhost.
    const _proto = (typeof window !== "undefined" && window.location.protocol === "https:") ? "wss://" : "ws://";
    const _host = (typeof window !== "undefined" && window.location.hostname) ? window.location.hostname : "localhost";
    const _wsUrl = (_host === "localhost" || _host === "127.0.0.1") ? _proto + _host + ":5001" : _proto + window.location.host;
    ws = new WebSocket(_wsUrl);
  } catch (e) {
    console.warn("No se pudo conectar al WebSocket:", e);
    return;
  }
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "get_state" }));
  };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "state" && msg.data && msg.data.modulos && msg.data.modulos.a) {
        Object.entries(msg.data.modulos.a).forEach(([id, st]) => stationStore.setModuleStatus(localFullId(id), st));
      }
    } catch (e) { console.warn("Mensaje WS invalido:", e); }
  };
  ws.onclose = () => { ws = null; setTimeout(conectarWS, 2000); };
  ws.onerror = () => { ws = null; };
}
conectarWS();

function enviarEstadoModulo(id, status) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_module", zona: "a", modulo: id, status }));
  }
}

/* ============ BOTÓN MAP ============ */
const goBack = () => {
  const level = stationStore.getZoneStatus(ZONE);
  let url = CONFIG.backUrl;
  if (level !== "ok") {
    url += (url.includes("?") ? "&" : "?") + `alert=${ZONE.toUpperCase()}&level=${level}`;
    stationStore.saveAlert(ZONE, level);
  }
  location.href = url;
};
$("#mapBtn").addEventListener("click", goBack);
const hot = $("#mapHot"), mb = CONFIG.mapButton;
Object.assign(hot.style, { left:mb.x+"%", top:mb.y+"%", width:mb.w+"%", height:mb.h+"%" });
hot.addEventListener("click", goBack);

render();

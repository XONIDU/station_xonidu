/* ============ CONFIGURACIÓN ============ */
const ZONE = "f";
const CONFIG = {
  storageKey: "zona-f-shapes-v1",
  backUrl: "../station-map/index.html",                        // a dónde manda el botón MAP
  mapButton: { x:38.2, y:87.4, w:23.3, h:11.3 }    // zona clicable sobre el MAP de la imagen (%)
};

function localFullId(slug) { return `mod-${ZONE}-${slug}`; }

/* Cada pantalla de la Zona F agrupa varios modulos del store:
   la pantalla parpadea con el peor estado de sus modulos. */
const GROUP_STORE_MODULES = {
  energy_propulsion: ["energy", "propulsion"],
  thermal: ["thermal"],
  comms_science: ["comms", "science"],
  structure_radiation: ["structure", "radiation"]
};
const STATUS_RANK_F = { ok: 0, pre: 1, warn: 2, crit: 3 };

/* Sincronizar el color y el parpadeo de cada pantalla con la tienda compartida. */
function syncFromStore() {
  MODULES.forEach(m => {
    const slugs = GROUP_STORE_MODULES[m.id] || [];
    let worst = "ok";
    slugs.forEach(s => {
      const st = stationStore.getModuleStatus(localFullId(s));
      if (STATUS_RANK_F[st] > STATUS_RANK_F[worst]) worst = st;
    });
    m.status = worst;
  });
}

// pts = esquinas [x, y] en % de la imagen, en el orden: arriba-izq, arriba-der, abajo-der, abajo-izq.
// Pueden ser más de 4 puntos para formas más complejas.
const MODULES = [
  { id:"energy_propulsion",   name:"Module: Energy + Propulsion",   status:"ok", pts:[[8.7,67.4],[26.1,66.8],[26.3,82.8],[7.9,82.6]] },
  { id:"thermal",             name:"Module: Thermal",               status:"ok", pts:[[30.9,66.0],[46.8,66.0],[47.2,82.2],[30.8,82.2]] },
  { id:"comms_science",       name:"Module: Comms + Science",       status:"ok", pts:[[52.2,66.2],[68.8,66.0],[69.2,81.7],[52.4,82.1]] },
  { id:"structure_radiation", name:"Module: Structure + Radiation", status:"ok", pts:[[73.8,65.4],[90.0,65.4],[91.0,82.6],[73.7,82.3]] }
];

/* ============ ESTADO ============ */
const $ = (s) => document.querySelector(s);
const stage = $("#stage"), svg = $("#shapes");
const STATUS_LABEL = { ok:"Normal", warn:"Anomalía", crit:"Crítico" };
const STATUS_SHORT = { ok:"OK", pre:"PRE", warn:"WARN", crit:"CRIT" };
const NS = "http://www.w3.org/2000/svg";
let selected = null;

try {
  const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "null");
  if (saved) saved.forEach(s => { const m = MODULES.find(m => m.id === s.id); if (m) m.pts = s.pts; });
} catch (e) {}

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
    p.setAttribute("tabindex", "0");
    p.setAttribute("role", "button");
    p.setAttribute("aria-label", `${m.name}. Estado: ${STATUS_LABEL[m.status]}`);
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


/* ============ SELECCIÓN Y ESTADO ============ */
function select(id) { selected = id; render(); }
svg.addEventListener("click", e => {
  if (e.target.dataset.id) {
    const m = MODULES.find(m => m.id === e.target.dataset.id);
    // El clic SOLO abre la pantalla del modulo: la falla se resuelve
    // completando la tarea de reparacion dentro de la mini-web (v9).
    select(e.target.dataset.id);
    openModule(e.target.dataset.id);
  }
});
svg.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset.id) { e.preventDefault(); select(e.target.dataset.id); }
});

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

/* ============ PANTALLA EXPANDIDA DEL MODULO (overlay) ============ */
const screen = $("#moduleScreen"), screenExit = $("#moduleExit");
const screenTitle = $("#moduleTitle"), screenId = $("#moduleId"), screenStatus = $("#moduleStatus");
const frame = $("#moduleFrame");
let activeModule = null;

function openModule(groupId) {
  const m = MODULES.find(m => m.id === groupId);
  if (!m) return;
  // Clic en CUALQUIER modulo abre su pantalla expandida, este normal o con falla.
  activeModule = groupId;
  screenTitle.textContent = m.name;
  screenId.textContent = localFullId(groupId);
  const st = m.status;
  screenStatus.textContent = STATUS_LABEL[st];
  screenStatus.className = "module-status " + st;
  if (st !== "ok") screenStatus.classList.add("blink-" + st);
  frame.src = "modulos/" + groupId + ".html";
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

/* sincronizar la pantalla abierta con la tienda compartida */
window.addEventListener("station:modulestatuschange", () => {
  // Sincronizar SIEMPRE (no solo con la pantalla abierta): si no, los
  // monitores nunca se actualizan con el estado del backend.
  syncFromStore();
  render();
  updateMapBlink();
  if (!activeModule) return;
  const m = MODULES.find(m => m.id === activeModule);
  if (m) {
    screenStatus.textContent = STATUS_LABEL[m.status];
    screenStatus.className = "module-status " + m.status;
    if (m.status !== "ok") screenStatus.classList.add("blink-" + m.status);
  }
});
// Cuando llega un dato en vivo nuevo (CME, Kp, DSN...), re-dibujar los
// monitores para que la linea de actividad se actualice.
window.addEventListener("station:livechange", () => { syncFromStore(); render(); updateMapBlink(); });

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
      if (msg.type === "state" && msg.data && msg.data.modulos && msg.data.modulos.f) {
        Object.entries(msg.data.modulos.f).forEach(([id, st]) => stationStore.setModuleStatus(localFullId(id), st));
      }
    } catch (e) { console.warn("Mensaje WS invalido:", e); }
  };
  ws.onclose = () => { ws = null; setTimeout(conectarWS, 2000); };
  ws.onerror = () => { ws = null; };
}
conectarWS();

function enviarEstadoModulo(id, status) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_module", zona: "f", modulo: id, status }));
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

syncFromStore();
render();

// Alerta del boton MAP y apertura automatica del modulo desde el mapa (?mod=X)
updateMapBlink();
const urlParams = new URLSearchParams(location.search);
const modFromUrl = urlParams.get("mod");
// Apertura automatica del modulo desactivada: el jugador abre el modulo
// haciendo clic en el mapa de la zona. El modulo sigue parpadeando si tiene
// una falla activa.
if (false && modFromUrl) {
  setTimeout(() => openModule(localFullId(modFromUrl)), 200);
}

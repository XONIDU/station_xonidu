/* ============ CONFIGURACIÓN ============ */
const ZONE = "d";
const CONFIG = {
  storageKey: "zona-d-shapes-v1",
  backUrl: "../station-map/index.html",                        // a dónde manda el botón MAP
  mapButton: { x:41.7, y:84.2, w:16.1, h:12.5 }    // zona clicable sobre el MAP de la imagen (%)
};

// pts = esquinas [x, y] en % de la imagen, en el orden: arriba-izq, arriba-der, abajo-der, abajo-izq.
// Pueden ser más de 4 puntos para formas más complejas.
const MODULES = [
  { id:"command",    name:"Module: Command",    status:"ok", pts:[[4.0,37.8],[24.3,37.8],[24.5,68.1],[4.1,69.8]] },
  { id:"navigation", name:"Module: Navigation", status:"ok", pts:[[29.3,37.4],[47.0,37.6],[46.9,69.3],[29.1,69.3]] },
  { id:"comms",      name:"Module: Comms",      status:"ok", pts:[[51.7,37.8],[69.8,37.5],[70.0,69.2],[51.7,69.3]] },
  { id:"robotics",   name:"Module: Robotics",   status:"ok", pts:[[75.3,38.0],[95.9,37.7],[95.9,69.4],[75.2,68.1]] }
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
    label.setAttribute("class", "poly-label " + m.status);
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
    statusLine.textContent = STATUS_SHORT[m.status];
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
    ws = new WebSocket(`ws://localhost:${5001}`);
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
      if (msg.type === "state" && msg.data && msg.data.modulos && msg.data.modulos.d) {
        Object.entries(msg.data.modulos.d).forEach(([id, st]) => setLocalModuleStatus(id, st));
      }
    } catch (e) { console.warn("Mensaje WS invalido:", e); }
  };
  ws.onclose = () => { ws = null; setTimeout(conectarWS, 2000); };
  ws.onerror = () => { ws = null; };
}
conectarWS();

function enviarEstadoModulo(id, status) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_module", zona: "d", modulo: id, status }));
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

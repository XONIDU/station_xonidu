/* ============ CONFIGURACIÓN (edita aquí) ============ */
const CONFIG = {
  image: "station.png",          // pon tu imagen en esta misma carpeta
  storageKey: "station-zones-v3", // para recordar coordenadas editadas
  showLabels: false,              // la imagen ya trae letras y nombres; ponlo en true si usas otro fondo
  mapButton: { x:39.38, y:84.05, w:21.25, h:14.07 } // zona clicable sobre el botón MAP de la imagen (%)
};

// x, y, w, h en % de la imagen (0–100).
// url: si pones una página (p. ej. "zona-a.html") el botón MAP navega ahí; si es null usa la vista interna.
const ZONES = [
  { id:"A", name:"Habitat & Services",       mods:["Habitabilidad","Salud","ECLSS","Incendios","Radiación"],                       x:8.00, y:31.33, w:12.75, h:36.40, status:"ok", url:"../zone-a/index.html" },
  { id:"B", name:"Laboratory & Crops",       mods:["Alimentos","Térmico","Energía","Incendios"],                                       x:22.31, y:31.33, w:12.75, h:36.40, status:"ok", url:"../zone-b/index.html" },
  { id:"C", name:"Technical Compartment",    mods:["ECLSS","Energía","Térmico","Comando"],                                         x:36.56, y:31.33, w:12.75, h:36.40, status:"ok", url:"../zone-c/index.html" },
  { id:"D", name:"Control & Observation",    mods:["Comando","Navegación","Comms","Robótica"],                                     x:50.75, y:31.33, w:12.75, h:36.40, status:"ok", url:"../zone-d/index.html" },
  { id:"E", name:"Access Node & Airlock",    mods:["Estructura","Robótica/EVA","Incendios"],                                       x:64.94, y:31.33, w:12.75, h:36.40, status:"ok", url:"../zone-e/index.html" },
  { id:"F", name:"Exterior Assembly",        mods:["Energía","Térmico","Comms","Ciencia","Estructura","Propulsión","Radiación"],   x:79.19, y:31.33, w:12.75, h:36.40, status:"ok", url:"../zone-f/index.html" }
];

/* ============ ALERTAS: parametro URL y estado guardado ============ */
function readUrlAlert() {
  const params = new URLSearchParams(location.search);
  const zone = params.get("alert");
  const level = params.get("level");
  if (!zone || !/^[a-f]$/i.test(zone)) return;
  if (level && ["ok", "warn", "crit"].includes(level)) stationStore.saveAlert(zone.toLowerCase(), level);
  history.replaceState(null, document.title, location.pathname);
}

function alertedZones() {
  // Solo el estado EN VIVO del store: la alerta guardada en localStorage
  // quedaba obsoleta (tras reiniciar la partida el backend pone todo en ok,
  // pero la alerta guardada seguia haciendo parpadear la zona en amarillo
  // sin que hubiera ningun error real).
  const out = new Set();
  ZONES.forEach(z => { if (stationStore.getZoneStatus(z.id.toLowerCase()) !== "ok") out.add(z.id); });
  return out;
}

// Nivel de parpadeo para una zona: usa el estado real de sus modulos si no es ok;
// si todo esta ok pero hay una alerta guardada (parametro URL), usa ese nivel.
function alertLevelFor(zoneId) {
  // Solo el estado en vivo: si la zona esta ok, no parpadea aunque haya
  // una alerta guardada vieja en localStorage.
  return stationStore.getZoneStatus(String(zoneId).toLowerCase());
}

/* parpadeo del boton MAP del mapa segun cualquier alerta en la estacion */
function updateMapButtonBlink() {
  const level = stationStore.getAnyAlertStatus();
  const hot = $("#mapHot"), btn = $("#mapBtn");
  hot.classList.toggle("alert-warn", level === "warn");
  hot.classList.toggle("alert-crit", level === "crit");
  btn.classList.toggle("alert-warn", level === "warn");
  btn.classList.toggle("alert-crit", level === "crit");
}

/* ============ ESTADO ============ */
const $ = (s) => document.querySelector(s);
const stage = $("#stage"), zonesEl = $("#zones"), bg = $("#bg");
const STATUS_LABEL = { ok:"Normal", warn:"Anomalía", crit:"Crítico" };
let selected = null;

// Recupera coordenadas guardadas (si el navegador lo permite)
try {
  const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "null");
  if (saved) {
    saved.forEach(s => {
      if (s.id === "MAP") {
        const mb = CONFIG.mapButton;
        Object.assign(mb, { x:+s.x, y:+s.y, w:+s.w, h:+s.h });
      } else {
        const z = ZONES.find(z => z.id === s.id);
        if (z) Object.assign(z, {x:s.x,y:s.y,w:s.w,h:s.h});
      }
    });
  }
  // Aplicar coordenadas del botón MAP al DOM
  const mb = CONFIG.mapButton;
  const hot = $("#mapHot");
  Object.assign(hot.style, { left:mb.x+"%", top:mb.y+"%", width:mb.w+"%", height:mb.h+"%" });
} catch (e) {}

/* ============ IMAGEN DE FONDO ============ */
bg.onerror = () => stage.classList.add("no-bg");   // sin imagen: muestra fondo oscuro 16:9
bg.src = CONFIG.image;

/* ============ RENDER ============ */
// v19: rejilla de zonas para MOVIL — 6 botones grandes con el estado.
function renderZoneGrid() {
  const grid = document.getElementById("zoneGrid");
  if (!grid) return;
  grid.innerHTML = "";
  ZONES.forEach(z => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zone-grid-btn " + (z.status || "ok") + (selected === z.id ? " sel" : "");
    b.dataset.id = z.id;
    const letter = document.createElement("span");
    letter.className = "zg-letter";
    letter.textContent = z.id;
    const name = document.createElement("span");
    name.className = "zg-name";
    name.textContent = z.name;
    b.appendChild(letter);
    b.appendChild(name);
    b.addEventListener("click", () => { select(z.id); });
    grid.appendChild(b);
  });
}
function render() {
  zonesEl.innerHTML = "";
  const alerted = alertedZones();
  ZONES.forEach(z => {
    const blinking = alerted.has(z.id);
    const el = document.createElement("div");
    el.className = `zone ${z.status}` + (selected === z.id ? " sel" : "") + (blinking ? ` blink-${alertLevelFor(z.id)}` : "");
    el.dataset.id = z.id;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Zona ${z.id}: ${z.name}. Estado: ${STATUS_LABEL[z.status]}`);
    el.tabIndex = 0;
    Object.assign(el.style, { left:z.x+"%", top:z.y+"%", width:z.w+"%", height:z.h+"%" });
    el.innerHTML = CONFIG.showLabels ? `<span class="tag">${z.id}</span><span class="name">${z.name}</span>` : "";
    zonesEl.appendChild(el);
  });
  renderPanel();
  renderZoneGrid();
  updateMapButtonBlink();
  ajustarZonasImagen();
}

function renderPanel() {
  const z = ZONES.find(z => z.id === selected);
  $("#hint").hidden = !!z;
  $("#info").hidden = !z;
  if (!z) return;
  $("#zTitle").textContent = `Zona ${z.id} · ${z.name}`;
  $("#zMods").textContent = "Módulos: " + z.mods.join(", ");
  // Estado EN VIVO desde el store (backend + datos reales de la NASA).
  // No hay botones manuales: el estado lo pone el backend, no el jugador.
  const mods = stationStore.getZoneModules(z.id.toLowerCase());
  const zs = stationStore.getZoneStatus(z.id.toLowerCase());
  const label = { ok: "Normal", warn: "Anomalía", crit: "Crítico" }[zs] || zs;
  $("#zStatus").textContent = `Estado en vivo: ${label}`;
  const list = $("#zModList");
  list.innerHTML = "";
  mods.forEach(m => {
    const row = document.createElement("div");
    row.className = "modrow " + m.status;
    const slug = m.moduleId.replace(/^mod-[a-f]-/, "");
    row.textContent = `${slug}: ${m.status}`;
    list.appendChild(row);
  });
}

/* ============ SELECCIÓN ============ */
function select(id) { selected = id; render(); }

zonesEl.addEventListener("click", e => {
  const el = e.target.closest(".zone"); if (!el) return;
  const id = el.dataset.id;
  const blinking = el.classList.contains("blink-warn") || el.classList.contains("blink-crit");
  select(id);
  if (blinking) {
    // Navegar a la zona abriendo el modulo que esta en alerta (para que parpadee al entrar).
    // Hacer clic en la zona NO atiende la falla: solo se atiende con clic en
    // el modulo, dentro de la pagina de la zona.
    const z = ZONES.find(z => z.id === id);
    let url = z.url;
    if (url) {
      const mods = stationStore.getZoneModules(id.toLowerCase());
      const alerted = mods.find(m => m.status !== "ok");
      if (alerted) {
        const slug = alerted.moduleId.replace(/^mod-[a-f]-/, "");
        url += (url.includes("?") ? "&" : "?") + `mod=${slug}`;
      }
    }
    setTimeout(() => { location.href = url; }, 0);
    return;
  }
});
zonesEl.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("zone")) { e.preventDefault(); select(e.target.dataset.id); }
});

/* ============ BOTÓN MAP: confirmar e ir a la sección ============ */
function goMap() {
  const z = ZONES.find(z => z.id === selected);
  if (!z) { toast("Selecciona primero una zona"); return; }
  if (z.url) location.href = z.url;
  else location.hash = "zona-" + z.id.toLowerCase();
}
$("#mapBtn").addEventListener("click", goMap);

// Zona clicable sobre el botón MAP dibujado en la imagen
const hot = $("#mapHot"), mb = CONFIG.mapButton;
Object.assign(hot.style, { left:mb.x+"%", top:mb.y+"%", width:mb.w+"%", height:mb.h+"%" });
hot.addEventListener("click", goMap);

let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600);
}
function route() {
  const m = location.hash.match(/^#zona-([a-f])$/i);
  const z = m && ZONES.find(z => z.id === m[1].toUpperCase());
  $("#detail").hidden = !z;
  if (z) { $("#dTitle").textContent = `Zona ${z.id} · ${z.name}`; $("#dMods").textContent = "Módulos: " + z.mods.join(", "); }
}
window.addEventListener("hashchange", route);
$("#backBtn").addEventListener("click", () => { location.hash = ""; });
document.addEventListener("keydown", e => { if (e.key === "Escape") location.hash = ""; });

window.addEventListener("station:modulestatuschange", () => {
  render();
  updateMapButtonBlink();
});

readUrlAlert();
updateMapButtonBlink();
render(); route();

/* ============ AJUSTE DE ZONAS CON OBJECT-FIT:CONTAIN ============ */
// Cuando la imagen usa contain, puede dejar espacios en los lados.
// Mapeamos las coordenadas de zona (0-100% sobre la imagen) al stage real.
function ajustarZonasImagen() {
  const img = $("#bg");
  const stageEl = $("#stage");
  if (!img.naturalWidth) return;
  const sw = stageEl.clientWidth, sh = stageEl.clientHeight;
  if (!sw || !sh) return;
  // getBoundingClientRect() del <img> devuelve la CAJA del elemento, no la
  // imagen dibujada con object-fit:contain. Por eso las zonas se corrian.
  // Aqui calculamos el rectangulo real que ocupa la imagen dentro del stage.
  const scale = Math.min(sw / img.naturalWidth, sh / img.naturalHeight);
  const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
  const il = (sw - iw) / 2, it = (sh - ih) / 2;
  const place = (el, r) => Object.assign(el.style, {
    left:   (il + r.x / 100 * iw) + "px",
    top:    (it + r.y / 100 * ih) + "px",
    width:  (r.w / 100 * iw) + "px",
    height: (r.h / 100 * ih) + "px"
  });
  ZONES.forEach(z => {
    const el = zonesEl.querySelector(`[data-id="${z.id}"]`);
    if (el) place(el, z);
  });
  place($("#mapHot"), CONFIG.mapButton);
}
// Ejecutar despues de render y cuando la imagen cargue
bg.addEventListener("load", () => { ajustarZonasImagen(); });
// Si la imagen ya estaba en caché, el load puede haber ocurrido antes
// de registrar el listener: ajustar de inmediato en ese caso.
if (bg.complete && bg.naturalWidth) ajustarZonasImagen();
window.addEventListener("resize", ajustarZonasImagen);
window.addEventListener("orientationchange", () => setTimeout(ajustarZonasImagen, 150));
if (window.ResizeObserver) new ResizeObserver(ajustarZonasImagen).observe(stage);

/* ============ RELOJ DE MISIÓN (día X/5 en la cabecera) ============ */
// La misión arranca con START MISSION en el menú (POST /api/mission/start).
// Aquí solo se muestra: día actual, horas/minutos y si ya terminó.
// (v13) El reloj muestra horas y minutos (transcurrido y restante), no
// solo el día, y se actualiza cada 5 s para que se vea correr. Al
// terminar, se abre la pantalla de score con el desglose.
function fmtHM(min) {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function showEndScreen(m) {
  const sec = document.getElementById("endScreen");
  if (!sec) return;
  const s = m.score || {};
  // v19: MISION FALLIDA (game over) — 6+ modulos en crit o score a 0.
  // El titulo cambia a rojo y explica por que se acabo el juego.
  const titleEl = document.getElementById("endTitle");
  if (titleEl) {
    if (m.failed) {
      titleEl.textContent = "Misión fallida";
      titleEl.style.color = "#e74c3c";
    } else {
      titleEl.textContent = "Misión completada";
      titleEl.style.color = "";
    }
  }
  document.getElementById("endMission").textContent =
    (m.objetivo || "Misión") + " · " + m.days_total + " días · " + m.difficulty;
  const row = (label, val) =>
    '<div class="row"><span>' + label + '</span><b>' + val + '</b></div>';
  document.getElementById("endScore").innerHTML =
    row("Diseño (órbita + lanzador)", (s.fit || 0) + " pts")
    + row("Completar la misión", "+" + (s.complete || 0) + " pts")
    + row("Reparaciones (" + (s.n_repairs || 0) + " × 50)", "+" + (s.repairs || 0) + " pts")
    + row("Módulos en crítico (" + (s.n_crits || 0) + " × −50)", (s.crits || 0) + " pts")
    + (s.penalties ? row("Diagnósticos errados (" + (s.n_penalties || 0) + " × −10)", (s.penalties || 0) + " pts") : "")
    + row("Datos científicos (DATA)", "+" + (s.data || 0) + " pts")
    + row("Combustible (se agotó antes de terminar)", (s.fuel || 0) + " pts")
    + (s.drain ? row("Drenaje (módulos en crítico sin atender)", (s.drain || 0) + " pts") : "")
    + (m.failed ? row("Motivo del fallo", (s.n_crits || 0) >= 6 ? "6+ módulos en crítico" : "El score llegó a 0") : "")
    + '<div class="row total"><span>SCORE TOTAL</span><span>' + (s.total || 0) + " pts</span></div>";
  const fuel = m.fuel || {};
  if (fuel.capacity) {
    document.getElementById("endMission").textContent += " · FUEL " + (fuel.remaining || 0) + "/" + fuel.capacity + " kg";
  }
  sec.hidden = false;
}
// v15: DOS marcadores de tiempo, como pidio Darian:
// 1) Dias: "Día 1/5", "Día 2/5"... (en #missionDay).
// 2) Cuenta atras del dia actual: "⏱ MM:SS" bajando cada segundo (en
// #missionClock). El backend se consulta cada 5 s; entre consultas el
// reloj baja en local (1 s) para que los segundos se vean correr.
var _lastMission = null;
var _lastFetchAt = 0;
function fmtMS(totalSeconds) {
  var s = Math.max(0, Math.floor(totalSeconds));
  var mm = Math.floor(s / 60);
  var ss = s % 60;
  return (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
}
function renderClock() {
  var el = document.getElementById("missionDay");
  var clk = document.getElementById("missionClock");
  if (!el || !clk || !_lastMission) return;
  var m = _lastMission;
  if (m.finished) {
    el.textContent = (m.failed ? "Misión fallida · " : "Misión completada · ") + m.days_total + " días · " + fmtHM(m.minutes_total);
    el.classList.add("finished");
    clk.textContent = "";
    clk.style.display = "none";
    return;
  }
  // Minutos transcurridos ahora = lo que dijo el backend + lo que paso
  // en local desde la ultima consulta.
  var elapsedMin = (m.minutes_elapsed || 0) + (Date.now() - _lastFetchAt) / 60000;
  var perDay = m.min_per_day || 1;
  var dayElapsedMin = elapsedMin % perDay;
  var dayLeftSec = Math.max(0, (perDay - dayElapsedMin) * 60);
  var day = Math.min(m.days_total, Math.floor(elapsedMin / perDay) + 1);
  el.textContent = "Día " + day + "/" + m.days_total;
  el.classList.remove("finished");
  clk.textContent = "⏱ " + fmtMS(dayLeftSec) + " · restan " + fmtHM(Math.max(0, (m.minutes_total || 0) - elapsedMin));
  clk.style.display = "";
}
function syncMissionDay() {
  const el = document.getElementById("missionDay");
  const clk = document.getElementById("missionClock");
  if (!el) return;
  fetch("/api/mission").then(r => r.ok ? r.json() : null).then(d => {
    const m = d && d.mission;
    if (!m || !m.active) {
      el.textContent = ""; el.style.display = "none";
      if (clk) { clk.textContent = ""; clk.style.display = "none"; }
      _lastMission = null;
      return;
    }
    el.style.display = "";
    _lastMission = m;
    _lastFetchAt = Date.now();
    renderClock();
    if (m.finished) showEndScreen(m);
  }).catch(() => { /* sin backend: no se muestra el reloj */ });
}
syncMissionDay();
setInterval(syncMissionDay, 5000);
setInterval(renderClock, 1000);
// Botones de la pantalla de fin de mision.
document.getElementById("endMenuBtn").addEventListener("click", () => { location.href = "../menu/index.html"; });
document.getElementById("endRestartBtn").addEventListener("click", () => { restartMission(); });

/* ============ REINICIAR PARTIDA / SALIR AL MENÚ ============ */
// Reiniciar: vuelve a lanzar la misma misión desde el Día 1 (POST
// /api/mission/start con la configuración actual; el backend además limpia
// los módulos atendidos y los eventos aplicados, y los eventos NASA que
// sigan activos se vuelven a aplicar en el próximo poll).
// Reiniciar: vuelve a lanzar la misma mision desde el Dia 1 (v13: es una
// funcion con nombre para que tambien la use el boton "Jugar otra vez" de
// la pantalla de fin de mision).
// Normaliza un valor guardado a string (un localStorage viejo guarda el
// objetivo como objeto {id, title}; el backend lo espera como string).
function _str(v) {
  if (v && typeof v === "object") return String(v.id || v.title || v.name || "");
  return (v == null ? "" : String(v));
}
async function restartMission() {
  if (!confirm("¿Reiniciar la partida? El reloj vuelve al Día 1 y las anomalías activas se vuelven a aplicar.")) return;
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem("xonidu-mission-v1") || "{}") || {}; } catch (e) {}
  const difficulty = localStorage.getItem("xonidu-difficulty-v1") || "medio";
  const days = parseInt(localStorage.getItem("xonidu-mission-days") || "5", 10) || 5;
  let ok = false;
  try {
    const r = await fetch("/api/mission/start", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: _str(cfg.objetivo), orbita: _str(cfg.orbita), lanzador: _str(cfg.lanzador), difficulty, days, fit_score: cfg.score || 0, components: cfg.components || {} }) });
    ok = r.ok;
  } catch (e) { ok = false; }
  if (!ok) {
    // Antes recargaba igual aunque el POST fallara, y volvia la misma
    // mision fallida: parecia que "no reinicia". Ahora avisa y no recarga.
    alert("No se pudo reiniciar: no hay conexión con el servidor del juego. Revisa que el backend esté corriendo y vuelve a intentarlo.");
    return;
  }
  // Ocultar la pantalla de fin de inmediato para que se vea el reinicio.
  const sec = document.getElementById("endScreen");
  if (sec) sec.hidden = true;
  location.reload();
}
document.getElementById("restartBtn").addEventListener("click", restartMission);
// Salir al menú: ahí se elige otra misión o dificultad (el menú limpia la
// sesión al entrar, así que hay que iniciar la misión desde ahí).
document.getElementById("menuBtn").addEventListener("click", () => {
  location.href = "../menu/index.html";
});

/* ============ CONFIGURACIÓN (edita aquí) ============ */
// x, y, w, h en % de la imagen (0–100).
// url: página a la que va el botón; si es null abre la vista interna (hash).
// Las coordenadas coinciden con los 4 botones dibujados en menu.png.
const BUTTONS = [
  { id:"objectives", key:"menuObjectives", x:36.1, y:50.4, w:28.0, h:7.0, url:null },
  { id:"orbit",      key:"menuOrbit",      x:36.1, y:59.2, w:28.0, h:7.2, url:null },
  { id:"launch",     key:"menuLaunch",     x:36.1, y:68.3, w:28.0, h:7.1, url:null },
  { id:"start",      key:"menuStart",      x:35.6, y:77.2, w:28.9, h:8.9, url:"../station-map/index.html" }
];

// Barra inferior. Las celdas coinciden con los cuadros de la imagen.
const HUD = [
  { id:"score",  key:"hudScore",  label:"SCORE",  value:"0",      status:"ok", x:0.3,  y:87.3, w:19.8, h:10.0 },
  { id:"mass",   key:"hudMass",   label:"MASS",   value:"0 t",    status:"ok", x:20.3, y:87.3, w:18.3, h:10.0 },
  { id:"power",  key:"hudPower",  label:"POWER",  value:"0 kW",   status:"ok", x:38.9, y:87.3, w:20.2, h:10.0 },
  { id:"budget", key:"hudBudget", label:"BUDGET", value:"0 cr",   status:"ok", x:59.4, y:87.3, w:19.8, h:10.0 },
  { id:"data",   key:"hudData",   label:"DATA",   value:"0 mb",   status:"ok", x:79.4, y:87.3, w:20.3, h:10.0 }
];

/* ============ MISIONES, ORBITAS Y LANZADORES ============ */
// Las 9 misiones que definio Darian (mecanicas-reto-13-xonidu.md §2).
// Una partida = una mision. orbit / launcher = el encaje recomendado;
// bonus = puntos al completar (100 por paso + bonus al final).
// datos = DATA que genera la mision durante el juego.
// Los numeros son valores de JUEGO para la demo, no datos reales de ingenieria.
// v14: cada mision indica sus orbitas buenas (orbits[]), su instrumento
// clave (instrumento, null si la mision no depende de uno) y si necesita
// propulsion para acercarse/acoplarse (needsPropulsion).
const MISSIONS = [
  { id:"SATELLITE REPAIR", desc:"Approach, capture with the arm and repair a satellite. Best: LEO + Falcon 9. Completion +200.", orbits:["LEO"], launcher:["FALCON 9"], bonus:200, datos:0, instrumento:null, needsPropulsion:true },
  { id:"CARGO CAPTURE", desc:"Catch a Dragon / Cygnus cargo ship with the arm and dock it. Best: LEO + Falcon 9. Completion +200.", orbits:["LEO"], launcher:["FALCON 9"], bonus:200, datos:0, instrumento:null, needsPropulsion:true },
  { id:"SPACEWALK (EVA)", desc:"Astronauts go out to repair, install or collect samples. Abort on solar storm. Best: LEO + Falcon 9. Completion +200.", orbits:["LEO"], launcher:["FALCON 9"], bonus:200, datos:0, instrumento:null, needsPropulsion:false },
  { id:"CUBESAT DEPLOY", desc:"Design, deploy and track a small satellite from the airlock. Best: LEO + Falcon 9. Completion +200, +DATA.", orbits:["LEO"], launcher:["FALCON 9"], bonus:200, datos:40, instrumento:"CAMERA", needsPropulsion:false },
  { id:"MICROGRAVITY SCIENCE", desc:"Veggie / APH crops and BASS / SAFFIRE combustion. Best: LEO + Falcon 9. Completion +200, +DATA.", orbits:["LEO"], launcher:["FALCON 9"], bonus:200, datos:40, instrumento:"SPECTROMETER", needsPropulsion:false },
  { id:"EARTH OBSERVATION", desc:"Monitor fires, hurricanes and floods; send data to ground teams. Best: polar or Sun-synchronous + Falcon 9. Completion +200, +DATA.", orbits:["LEO", "POLAR", "SUN-SYNCHRONOUS"], launcher:["FALCON 9"], bonus:200, datos:40, instrumento:"CAMERA", needsPropulsion:false },
  { id:"MOON & MARS TECH", desc:"Test on the station what future Moon / Mars missions need. All 6 zones. Best: LEO (heliocentric variant) + Atlas V. Completion +300.", orbits:["LEO", "HELIOCENTRIC"], launcher:["ATLAS V"], bonus:300, datos:0, instrumento:"SENSOR SUITE", needsPropulsion:false },
  { id:"SATELLITE LIFE EXTENSION", desc:"Dock with an old satellite to refuel or replace parts. Best: GEO + Atlas V or Ariane 5. Completion +200.", orbits:["GEO"], launcher:["ATLAS V", "ARIANE 5"], bonus:200, datos:0, instrumento:null, needsPropulsion:true },
  { id:"ASTRONOMY", desc:"Observe space from orbit, with less atmospheric interference. Best: LEO + Falcon 9. Completion +200, +DATA.", orbits:["LEO"], launcher:["FALCON 9"], bonus:200, datos:40, instrumento:"TELESCOPE", needsPropulsion:false }
];

const ORBITS = [
  { id:"LEO", desc:"Low Earth Orbit · 400 km · easy resupply.", masa:12, potencia:8, presupuesto:120, datos:40 },
  { id:"GEO", desc:"Geostationary Orbit · 35,786 km · constant coverage.", masa:18, potencia:12, presupuesto:220, datos:60 },
  { id:"HELIOCENTRIC", desc:"Heliocentric · beyond Earth orbit · highest risk.", masa:25, potencia:15, presupuesto:350, datos:90 },
  { id:"POLAR", desc:"Polar Orbit · 800 km · passes over the poles, covers all Earth.", masa:14, potencia:9, presupuesto:150, datos:70 },
  { id:"SUN-SYNCHRONOUS", desc:"Sun-synchronous Orbit · 600 km · same sunlight every pass, best for Earth imaging.", masa:13, potencia:9, presupuesto:160, datos:80 }
];

// v14: Componentes de la nave (reto 13). El jugador diseña la nave
// eligiendo 1 opcion por sistema. Cada opcion mueve MASS / POWER /
// BUDGET / DATA / FUEL y puntua por encaje con la mision. Los numeros son
// valores de JUEGO, no datos reales de ingenieria. La potencia de un
// sistema de potencia es NEGATIVA porque GENERA energia (el resto consume).
// combustible = capacidad del tanque (kg); consumo = gasto por dia (kg/dia).
const COMPONENT_SYSTEMS = [
  { key:"spacecraft", name:"Nave espacial", options:[
    { id:"SMALLSAT", desc:"Pequeña y barata; poca capacidad.", masa:0.5, potencia:0.2, presupuesto:20, datos:0, combustible:0, consumo:0 },
    { id:"MEDIUM BUS", desc:"Equilibrada; la estándar de la estación.", masa:2, potencia:0.5, presupuesto:60, datos:0, combustible:0, consumo:0 },
    { id:"LARGE BUS", desc:"Gran capacidad; pesada y cara.", masa:5, potencia:1.0, presupuesto:120, datos:0, combustible:0, consumo:0 } ] },
  { key:"instruments", name:"Instrumentos científicos", options:[
    { id:"CAMERA", desc:"Cámara multiespectral; ideal para observar la Tierra.", masa:0.1, potencia:0.1, presupuesto:15, datos:50, combustible:0, consumo:0 },
    { id:"SPECTROMETER", desc:"Espectrómetro; analiza la composición de muestras y atmósferas.", masa:0.2, potencia:0.2, presupuesto:25, datos:40, combustible:0, consumo:0 },
    { id:"TELESCOPE", desc:"Telescopio; observa el espacio profundo (no sirve para luz UV).", masa:0.5, potencia:0.3, presupuesto:40, datos:60, combustible:0, consumo:0 },
    { id:"SENSOR SUITE", desc:"Suite de sensores; medidas generales de todo tipo.", masa:0.15, potencia:0.15, presupuesto:20, datos:30, combustible:0, consumo:0 } ] },
  { key:"power", name:"Sistema de potencia", options:[
    { id:"SOLAR PANELS", desc:"Paneles solares; energía del Sol, gratis en LEO.", masa:0.3, potencia:-14, presupuesto:30, datos:0, combustible:0, consumo:0 },
    { id:"SOLAR + BATTERY", desc:"Paneles + baterías; energía también en la sombra.", masa:0.6, potencia:-18, presupuesto:50, datos:0, combustible:0, consumo:0 },
    { id:"RTG", desc:"Generador nuclear (RTG); energía constante lejos del Sol.", masa:0.8, potencia:-20, presupuesto:100, datos:0, combustible:0, consumo:0 } ] },
  { key:"comms", name:"Comunicaciones", options:[
    { id:"S-BAND", desc:"Banda S; básica, baja velocidad de datos.", masa:0.05, potencia:0.1, presupuesto:10, datos:10, combustible:0, consumo:0 },
    { id:"X-BAND", desc:"Banda X; estándar de la ISS.", masa:0.1, potencia:0.2, presupuesto:20, datos:30, combustible:0, consumo:0 },
    { id:"KA-BAND", desc:"Banda Ka; alta velocidad, más potencia.", masa:0.15, potencia:0.4, presupuesto:35, datos:80, combustible:0, consumo:0 } ] },
  { key:"thermal", name:"Control térmico", options:[
    { id:"PASSIVE RADIATORS", desc:"Radiadores pasivos; simples, suficientes en LEO.", masa:0.2, potencia:0, presupuesto:15, datos:0, combustible:0, consumo:0 },
    { id:"ACTIVE THERMAL", desc:"Radiadores + calentadores; control activo para órbitas extremas.", masa:0.4, potencia:0.3, presupuesto:30, datos:0, combustible:0, consumo:0 } ] },
  { key:"propulsion", name:"Propulsión", options:[
    { id:"NONE", desc:"Sin propulsión; solo la estación, sin maniobras.", masa:0, potencia:0, presupuesto:0, datos:0, combustible:0, consumo:0 },
    { id:"CHEMICAL", desc:"Química; empuje fuerte, gasta mucho combustible.", masa:0.5, potencia:0.1, presupuesto:40, datos:0, combustible:200, consumo:10 },
    { id:"ELECTRIC", desc:"Eléctrica (iónica); eficiente, empuje lento.", masa:0.3, potencia:0.5, presupuesto:60, datos:0, combustible:50, consumo:2 } ] }
];
const COMPONENTS_KEY = "xonidu-components-v1";
let comp = {};
try {
  const savedComp = JSON.parse(localStorage.getItem(COMPONENTS_KEY) || "null");
  if (savedComp) comp = savedComp;
} catch (e) {}
function compOption(systemKey) {
  const sys = COMPONENT_SYSTEMS.find(s => s.key === systemKey);
  if (!sys) return null;
  return sys.options.find(o => o.id === comp[systemKey]) || null;
}
function compTotals() {
  const t = { masa:0, potencia:0, presupuesto:0, datos:0, combustible:0, consumo:0 };
  COMPONENT_SYSTEMS.forEach(sys => {
    const o = compOption(sys.key);
    if (!o) return;
    t.masa += o.masa; t.potencia += o.potencia; t.presupuesto += o.presupuesto;
    t.datos += o.datos; t.combustible += o.combustible; t.consumo += o.consumo;
  });
  return t;
}

const LAUNCHERS = [
  { id:"FALCON 9", desc:"Capacity 22 t · cost 90 cr.", capacidad:22, costo:90 },
  { id:"ATLAS V", desc:"Capacity 18 t · cost 140 cr.", capacidad:18, costo:140 },
  { id:"ARIANE 5", desc:"Capacity 20 t · cost 160 cr.", capacidad:20, costo:160 }
];

const STORE_KEY = "xonidu-mission-v1";
// v19.2: segundos en warn (amarillo) antes de crit (rojo) que el usuario
// cambio a mano, por dificultad. Si hay uno guardado, manda sobre el
// preset (facil 120 / medio 80 / dificil 60) y sobrevive a cambiar de
// dificultad y a reiniciar el servidor (se re-aplica al elegir dificultad).
const CUSTOM_WINDOW_KEY = "xonidu-attend-window-v1";
function getCustomWindow(key) {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_WINDOW_KEY) || "{}") || {};
    const v = Number(all[key]);
    return (v >= 5 && v <= 120) ? v : null;
  } catch (e) { return null; }
}
function setCustomWindow(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_WINDOW_KEY) || "{}") || {};
    all[key] = Math.max(5, Math.min(120, Math.round(Number(value) || 40)));
    localStorage.setItem(CUSTOM_WINDOW_KEY, JSON.stringify(all));
    return all[key];
  } catch (e) { return null; }
}
function effectiveWindow(key) {
  return getCustomWindow(key) || (DIFFICULTY_PRESETS[key] && DIFFICULTY_PRESETS[key].attend_window_sec) || 40;
}
const CONFIG_KEY = "xonidu-config-v1";
const LANG_KEY = "xonidu-lang";
const MISSION_DAYS_KEY = "xonidu-mission-days";

// Idioma del menu (espanol por defecto; se recuerda en localStorage).
let LANG = "es";
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "es" || saved === "en") LANG = saved;
} catch (e) { /* primera partida */ }

// Duracion de la mision (deslizador de la vista Objetivos). Se recuerda.
let missionDays = 5;   // = dias de la dificultad por defecto (Medio)
try {
  const saved = Number(localStorage.getItem(MISSION_DAYS_KEY));
  if (!isNaN(saved) && saved >= 1 && saved <= 30) missionDays = saved;
} catch (e) { /* primera partida */ }

// Dificultad de la partida (configuracion inicial, boton "Dificultad").
// 5 dias siempre; a mas dificultad, mas minutos por dia (la partida dura mas)
// y umbrales mas sensibles -> aparecen MAS fallos reales de la NASA.
const DIFFICULTY_KEY = "xonidu-difficulty-v1";
// v15: cada dificultad trae sus configuraciones POR DEFECTO.
// Facil (para ninos): TODO configurado — la nave ya viene disenada y solo
// hay que elegir la mision y jugar. Medio: 3 sistemas listos, el resto se
// elige. Dificil (para adultos/expertos): NADA configurado — hay que
// disenar la nave completa y los umbrales son mas estrictos.
const DIFFICULTY_DEFAULT_COMPONENTS = {
  facil:   { spacecraft: "MEDIUM BUS", instruments: "CAMERA", power: "SOLAR PANELS", comms: "X-BAND", thermal: "PASSIVE RADIATORS", propulsion: "ELECTRIC" },
  medio:   { spacecraft: "MEDIUM BUS", power: "SOLAR PANELS", propulsion: "ELECTRIC" },
  dificil: {}
};
const DIFFICULTY_PRESETS = {
  facil:   { days: 5, min_per_day: 1, kp_warn: 6, kp_crit: 8, cme_speed_warn: 500, flr_min_class: "M", attend_window_sec: 120, event_fresh_hours: 24, max_anomalies: 2 },
  medio:   { days: 5, min_per_day: 2, kp_warn: 6, kp_crit: 8, cme_speed_warn: 500, flr_min_class: "M", attend_window_sec: 80, event_fresh_hours: 96, max_anomalies: 2 },
  dificil: { days: 5, min_per_day: 3, kp_warn: 5, kp_crit: 7, cme_speed_warn: 450, flr_min_class: "M", attend_window_sec: 60, event_fresh_hours: 120, max_anomalies: 2 }
};
let difficulty = "medio";
try {
  const saved = localStorage.getItem(DIFFICULTY_KEY);
  if (saved && DIFFICULTY_PRESETS[saved]) difficulty = saved;
} catch (e) { /* primera partida */ }
function difficultyName() {
  return t(difficulty === "facil" ? "difficultyEasy" : difficulty === "medio" ? "difficultyMedium" : "difficultyHard");
}

// Configuracion del juego (metricas, umbrales, scoring). La fuente de verdad
// es el backend (GET /api/config, guardado en game_config.json); si el
// backend no esta disponible, se usa lo guardado en localStorage o los
// valores por defecto. El panel Metrics permite verla y cambiarla.
const DEFAULT_CONFIG = {
  kp_warn: 5, kp_crit: 7, cme_speed_warn: 500, event_fresh_hours: 24,
  attend_window_sec: 80, max_anomalies: 2,
  score_base: 100, orbit_fit: 20, orbit_miss: -15,
  launcher_fit: 10, launcher_miss: -10,
  mass_penalty: -20, budget_penalty: -10, budget_cap: 500,
  complete_bonus: 200, complete_bonus_hard: 300, data_bonus: 40
};
let CFG = Object.assign({}, DEFAULT_CONFIG);
try {
  const savedCfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
  if (savedCfg) Object.assign(CFG, savedCfg);
} catch (e) { /* primera partida */ }
fetch("/api/config").then(r => r.ok ? r.json() : null).then(d => {
  if (d && d.config) {
    CFG = Object.assign({}, DEFAULT_CONFIG, d.config);
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(CFG)); } catch (e) {}
    if (d.config.difficulty && DIFFICULTY_PRESETS[d.config.difficulty]) {
      difficulty = d.config.difficulty;
      missionDays = DIFFICULTY_PRESETS[difficulty].days;
    }
    syncHud();
  }
}).catch(() => { /* sin backend: se juega con la config local */ });

// La seleccion sobrevive al cambio de pagina (menu -> mapa -> zonas).
let sel = { objetivo:null, orbita:null, lanzador:null };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (saved) {
    sel.objetivo = saved.objetivo || null;
    sel.orbita = saved.orbita || null;
    sel.lanzador = saved.lanzador || null;
  }
} catch (e) { /* primera partida */ }

/* ============ IDIOMA ============ */
const STRINGS = {
  es: {
    appTitle: "XONIDU Station — Juego de diseño de misión espacial",
    menuObjectives: "Objetivos de la misión",
    menuOrbit: "Seleccionar órbita",
    menuLaunch: "Seleccionar lanzador",
    menuStart: "Iniciar misión",
    btnMetrics: "Métricas y algoritmos",
    btnMetricsTop: "⚙ Métricas",
    btnBack: "← Volver",
    langEnglish: "English",
    langSpanish: "Español",
    hudScore: "PUNTAJE",
    hudMass: "MASA",
    hudPower: "ENERGÍA",
    hudBudget: "PRESUPUESTO",
    hudData: "DATOS",
    objectivesTitle: "Objetivos de la misión",
    objectivesSub: "Elige 1 de 9 misiones. Una partida = una misión; la órbita y el lanzador puntúan por encaje.",
    pickMissionFirst: "Elige una misión primero (MISSION OBJECTIVES).",
    btnComponentsTop: "🧩 Componentes",
    btnRefreshTop: "🔄 Datos NASA",
    refreshOk: "Datos de la NASA actualizados ✓",
    refreshFail: "No se pudieron actualizar los datos (revisa el servidor).",
    refreshPolling: "Actualizando datos de la NASA…",
    componentsTitle: "Componentes de la nave",
    componentsSub: "Diseña tu nave: elige 1 opción por sistema. Cada elección mueve MASS, POWER, BUDGET, DATA y FUEL, y puntúa por encaje con la misión. Sin el instrumento clave o sin suficiente potencia o combustible, el diseño no es viable.",
    componentsCurrent: "Actual",
    componentsNotChosen: "sin elegir",
    componentsFuel: "Combustible",
    componentsFuelLine: "tanque",
    componentsFuelNeed: "necesita",
    componentsSummary: "Tu diseño",
    componentsSaved: "Componente guardado ✓",
    objectivesDuration: "Duración de la misión",
    objectivesDays: "días",
    orbitTitle: "Seleccionar órbita",
    orbitSub: "La órbita define masa, energía, presupuesto y necesidades de datos.",
    launchTitle: "Seleccionar lanzador",
    launchSub: "El lanzador debe levantar la masa de la misión.",
    summaryScore: "PUNTAJE",
    summaryMass: "MASA",
    summaryPower: "ENERGÍA",
    summaryBudget: "PRESUPUESTO",
    summaryData: "DATOS",
    summaryDuration: "Duración",
    summaryNotes: "Misión no factible con este lanzador.",
    metricsTitle: "Métricas, algoritmos y ecuaciones",
    metricsLive: "Cargando datos NASA en vivo…",
    metricsLiveUnavailable: "Datos en vivo: backend no disponible. Arranca station-backend.py para verlos.",
    metricsLiveKp: "Kp",
    metricsLiveFlr: "última llamarada",
    metricsLiveCme: "última CME",
    metricsLiveDsn: "estaciones en vivo",
    metricsSystems: "Metricas del Sistema",
    metricsSystemsP1: "Puntuacion total de la mision. Aumenta al completar modulos y objetivos. Se penaliza si un modulo queda en estado critico.",
    metricsSystemsP2: "Masa actual de la estacion en kg. Afecta al delta-v necesario para maniobras.",
    metricsSystemsP3: "Potencia disponible en kW. Se degrada con tormentas solares (DONKI CME) y fallos en modulos de energia.",
    metricsSystemsP4: "Presupuesto restante en millones de dolares. Cada lanzamiento y reparacion consume presupuesto.",
    metricsSystemsP5: "Datos científicos recolectados en GB. Se generan en modulos de ciencia y observacion.",
    metricsAlgorithms: "Algoritmos de Estado de Modulos",
    metricsAlgorithmsP1: "Cada modulo tiene un estado: ok (normal), warn (anomalia), crit (critico).",
    metricsAlgorithmsP2: "El estado de una zona es el peor de todos sus modulos.",
    metricsAlgorithmsP3: "El estado global de la estacion es el peor de todas las zonas.",
    metricsEquations: "Ecuaciones de Integracion NASA",
    metricsEquationsP1: "Radiacion (SWPC K-index): si Kp >= 5, los modulos de radiacion pasan a warn; si Kp >= 7, a crit.",
    metricsEquationsP2: "Tormenta Solar (DONKI FLR): llamaradas clase M o X degradan comunicaciones y salud en EVA.",
    metricsEquationsP3: "CME (DONKI CME): eyecciones de masa coronal reducen la energia de paneles solares y degradan modulos de energia.",
    metricsEquationsP4: "Asteroides (NeoWs): asteroides potencialmente peligrosos generan alerta en navegacion y modulos de estructura.",
    metricsEscalation: "Escalado de Fallas",
    metricsEscalationP: "Un modulo en warn parpadea en amarillo cada 1.2s. Si no se atiende (clic en el modulo) antes del tiempo de revision, escala a crit (parpadeo rojo cada 0.5s).",
    metricsScoring: "Puntuacion por Mision",
    metricsScoringP: "Cada una de las 9 misiones tiene modulos clave y eventos NASA que la amenazan. Completar una misión sin fallos criticos otorga el puntaje maximo.",
    metricsConfigTitle: "Configurar métricas",
    metricsConfigSub: "Estos valores los usa el juego ahora mismo. Guardar los escribe en el backend (game_config.json) y se aplican en el siguiente poll de la NASA (cada 60 s) y en el scoring del menú.",
    btnSaveConfig: "Guardar configuración",
    msgSavedBackend: "Guardado en el backend ✓",
    msgSavedLocal: "Guardado solo local (sin backend)",
    liveKp: "Kp",
    liveFlr: "última llamarada",
    liveCme: "última CME",
    liveDsn: "estaciones en vivo",
    btnDifficultyTop: "🎮 Dificultad",
    difficultyTitle: "Dificultad de la partida",
    difficultySub: "Configuración inicial. La misión dura 5 días; cada día dura los minutos indicados. A más dificultad, los umbrales son más sensibles y aparecen más fallos reales de la NASA (no simulados).",
    difficultyDays: "días",
    difficultyMinPerDay: "min por día",
    difficultyFailsFew: "Pocos fallos",
    difficultyFailsNormal: "Fallos normales",
    difficultyFailsMany: "Muchos fallos",
    difficultyCurrent: "Actual",
    difficultyEasy: "Fácil",
    difficultyMedium: "Medio",
    difficultyHard: "Difícil",
    difficultyKp: "Kp warn/crit",
    difficultyCme: "CME mínima",
    difficultyFlr: "Llamaradas",
    difficultyAttend: "Tiempo para atender",
    difficultyFresh: "Eventos recientes (máx.)",
    difficultySaved: "Dificultad guardada ✓",
    difficultySavedLocal: "Guardado solo local (sin backend)",
    difficultyLabel: "Dificultad"
  },
  en: {
    appTitle: "XONIDU Station — Space Mission Design Game",
    menuObjectives: "Mission Objectives",
    menuOrbit: "Select Orbit",
    menuLaunch: "Select Launch Vehicle",
    menuStart: "Start Mission",
    btnMetrics: "Metrics & Algorithms",
    btnMetricsTop: "⚙ Metrics",
    btnBack: "← Back",
    langEnglish: "English",
    langSpanish: "Español",
    hudScore: "SCORE",
    hudMass: "MASS",
    hudPower: "POWER",
    hudBudget: "BUDGET",
    hudData: "DATA",
    objectivesTitle: "Mission Objectives",
    objectivesSub: "Pick 1 of 9 missions. One run = one mission; orbit and launcher score by fit.",
    pickMissionFirst: "Pick a mission first (MISSION OBJECTIVES).",
    btnComponentsTop: "🧩 Components",
    btnRefreshTop: "🔄 NASA Data",
    refreshOk: "NASA data updated ✓",
    refreshFail: "Could not update the data (check the server).",
    refreshPolling: "Updating NASA data…",
    componentsTitle: "Spacecraft components",
    componentsSub: "Design your spacecraft: pick 1 option per system. Each choice moves MASS, POWER, BUDGET, DATA and FUEL, and scores by fit with the mission. Without the key instrument, or without enough power or fuel, the design is not viable.",
    componentsCurrent: "Current",
    componentsNotChosen: "not chosen",
    componentsFuel: "Fuel",
    componentsFuelLine: "tank",
    componentsFuelNeed: "needs",
    componentsSummary: "Your design",
    componentsSaved: "Component saved ✓",
    objectivesDuration: "Mission duration",
    objectivesDays: "days",
    orbitTitle: "Select Orbit",
    orbitSub: "Orbit sets mass, power, budget and data needs.",
    launchTitle: "Select Launch Vehicle",
    launchSub: "The launcher must lift the mission mass.",
    summaryScore: "SCORE",
    summaryMass: "MASS",
    summaryPower: "POWER",
    summaryBudget: "BUDGET",
    summaryData: "DATA",
    summaryDuration: "Duration",
    summaryNotes: "Mission not feasible with this launcher.",
    metricsTitle: "Metrics, Algorithms & Equations",
    metricsLive: "Loading live NASA data…",
    metricsLiveUnavailable: "Live data: backend not available. Start station-backend.py to see them.",
    metricsLiveKp: "Kp",
    metricsLiveFlr: "last flare",
    metricsLiveCme: "last CME",
    metricsLiveDsn: "live stations",
    metricsSystems: "System Metrics",
    metricsSystemsP1: "Total mission score. Increases by completing modules and objectives. Penalized if a module stays critical.",
    metricsSystemsP2: "Current station mass in kg. Affects the delta-v needed for maneuvers.",
    metricsSystemsP3: "Available power in kW. Degrades with solar storms (DONKI CME) and power module failures.",
    metricsSystemsP4: "Remaining budget in millions of dollars. Each launch and repair consumes budget.",
    metricsSystemsP5: "Scientific data collected in GB. Generated by science and observation modules.",
    metricsAlgorithms: "Module Status Algorithms",
    metricsAlgorithmsP1: "Each module has a status: ok (normal), warn (anomaly), crit (critical).",
    metricsAlgorithmsP2: "The status of a zone is the worst of all its modules.",
    metricsAlgorithmsP3: "The global station status is the worst of all zones.",
    metricsEquations: "NASA Integration Equations",
    metricsEquationsP1: "Radiation (SWPC K-index): if Kp >= 5, radiation modules go to warn; if Kp >= 7, to crit.",
    metricsEquationsP2: "Solar Storm (DONKI FLR): M or X class flares degrade communications and EVA health.",
    metricsEquationsP3: "CME (DONKI CME): coronal mass ejections reduce solar panel power and degrade power modules.",
    metricsEquationsP4: "Asteroids (NeoWs): potentially hazardous asteroids raise alerts in navigation and structure modules.",
    metricsEscalation: "Failure Escalation",
    metricsEscalationP: "A module in warn blinks yellow every 1.2s. If not attended (click on the module) before the review time, it escalates to crit (red blink every 0.5s).",
    metricsScoring: "Mission Scoring",
    metricsScoringP: "Each of the 9 missions has key modules and NASA events that threaten it. Completing a mission without critical failures grants the maximum score.",
    metricsConfigTitle: "Configure metrics",
    metricsConfigSub: "These values are used by the game right now. Saving writes them to the backend (game_config.json) and they apply on the next NASA poll (every 60 s) and in the menu scoring.",
    btnSaveConfig: "Save configuration",
    msgSavedBackend: "Saved to backend ✓",
    msgSavedLocal: "Saved locally only (no backend)",
    liveKp: "Kp",
    liveFlr: "last flare",
    liveCme: "last CME",
    liveDsn: "live stations",
    btnDifficultyTop: "🎮 Difficulty",
    difficultyTitle: "Mission difficulty",
    difficultySub: "Starting configuration. The mission lasts 5 days; each day lasts the minutes shown. The harder it is, the more sensitive the thresholds are and the more real NASA failures appear (not simulated).",
    difficultyDays: "days",
    difficultyMinPerDay: "min per day",
    difficultyFailsFew: "Few failures",
    difficultyFailsNormal: "Normal failures",
    difficultyFailsMany: "Many failures",
    difficultyCurrent: "Current",
    difficultyEasy: "Easy",
    difficultyMedium: "Medium",
    difficultyHard: "Hard",
    difficultyKp: "Kp warn/crit",
    difficultyCme: "Min CME",
    difficultyFlr: "Flares",
    difficultyAttend: "Time to attend",
    difficultyFresh: "Recent events (max)",
    difficultySaved: "Difficulty saved ✓",
    difficultySavedLocal: "Saved locally only (no backend)",
    difficultyLabel: "Difficulty"
  }
};

function t(key) { return STRINGS[LANG][key] || key; }

function applyLang() {
  document.title = t("appTitle");
  document.documentElement.lang = LANG;
  BUTTONS.forEach(b => {
    const el = $("#buttons .btn[data-id='" + b.id + "']");
    if (el) el.textContent = t(b.key);
    const mel = $("#mobileMenu .mm-btn[data-id='" + b.id + "']");
    if (mel) mel.textContent = t(b.key);
  });
  HUD.forEach(h => {
    const el = $(".cell[data-id='" + h.id + "'] .lbl");
    if (el) el.textContent = t(h.key);
  });
  const langBtn = $("#langBtn");
  if (langBtn) langBtn.textContent = LANG === "es" ? t("langEnglish") : t("langSpanish");
  const diffBtn = $("#diffTopBtn");
  if (diffBtn) diffBtn.textContent = t("btnDifficultyTop");
  const metricsBtnTop = $("#metricsTopBtn");
  if (metricsBtnTop) metricsBtnTop.textContent = t("btnMetricsTop");
  const compBtnTop = $("#compTopBtn");
  if (compBtnTop) compBtnTop.textContent = t("btnComponentsTop");
  const refreshBtnTop = $("#refreshTopBtn");
  if (refreshBtnTop) refreshBtnTop.textContent = t("btnRefreshTop");
  const backBtn = $("#backBtn");
  if (backBtn) backBtn.textContent = t("btnBack");
  if (!$("#detail").hidden) route();
  syncHud();
}

/* ============ SCORING (funcion pura, sin DOM) ============ */
// El puntaje arranca en score_base (config). El bonus de finalizacion
// (+complete_bonus / +complete_bonus_hard) se gana jugando, no en la
// configuracion. Aqui se puntua el ENCADRE de orbita + lanzador contra la
// mision elegida: orbita correcta +orbit_fit / incorrecta orbit_miss;
// lanzador correcto +launcher_fit / incorrecto launcher_miss. Sobre el
// presupuesto resta puntos; un lanzador que no levanta la masa resta
// mass_penalty y marca la mision no factible. Todos los valores se editan
// en el panel Metrics (boton ⚙ del menu).
function computeMissionScore(cfg) {
  let score = CFG.score_base, feasible = true;
  const notes = [];
  const ct = compTotals();
  if (cfg.objetivo && cfg.orbita) {
    const good = cfg.objetivo.orbits || [cfg.objetivo.orbit];
    if (good.indexOf(cfg.orbita.id) !== -1) {
      score += CFG.orbit_fit; notes.push("Orbit fits the mission (+" + CFG.orbit_fit + ").");
    } else {
      score += CFG.orbit_miss; notes.push("Orbit does not fit " + cfg.objetivo.id + " (best: " + good.join(" / ") + ", " + CFG.orbit_miss + ").");
    }
  }
  if (cfg.objetivo && cfg.lanzador) {
    if (cfg.objetivo.launcher.indexOf(cfg.lanzador.id) !== -1) {
      score += CFG.launcher_fit; notes.push("Launcher fits the mission (+" + CFG.launcher_fit + ").");
    } else {
      score += CFG.launcher_miss; notes.push("Launcher does not fit " + cfg.objetivo.id + " (best: " + cfg.objetivo.launcher.join(" or ") + ", " + CFG.launcher_miss + ").");
    }
  }
  // Componentes: instrumento clave de la mision (+20), potencia neta y
  // combustible. La potencia neta es lo que consume la mision menos lo
  // que genera el sistema de potencia; si es positiva falta energia.
  if (cfg.objetivo && cfg.objetivo.instrumento) {
    const inst = compOption("instruments");
    if (inst && inst.id === cfg.objetivo.instrumento) {
      score += 20; notes.push("Key instrument for this mission: " + inst.id + " (+20).");
    } else {
      notes.push("This mission works best with " + cfg.objetivo.instrumento + " (pick it in Components).");
    }
  }
  // Potencia: solo se penaliza si YA eligio un sistema de potencia y
  // aun asi falta energia. Si todavia no eligio, solo se le avisa.
  if (cfg.orbita) {
    const powerOpt = compOption("power");
    if (powerOpt) {
      const netPower = cfg.orbita.potencia + ct.potencia;
      if (netPower > 0) {
        score -= 20; feasible = false;
        notes.push("Not enough power: the mission needs " + cfg.orbita.potencia + " kW and the power system generates " + (-ct.potencia) + " kW (deficit " + netPower + " kW).");
      }
    } else {
      notes.push("Pick a power system in Components.");
    }
  }
  // Propulsion: solo se penaliza si YA eligio (incluido NONE) y es
  // insuficiente. Si todavia no eligio, solo se le avisa.
  if (cfg.objetivo && cfg.objetivo.needsPropulsion) {
    const prop = compOption("propulsion");
    if (prop) {
      if (prop.id === "NONE") {
        score -= 20; feasible = false;
        notes.push("This mission needs propulsion to rendezvous/dock (pick one in Components).");
      } else if (prop.combustible < prop.consumo * missionDays) {
        score -= 20; feasible = false;
        notes.push("Not enough fuel: " + prop.combustible + " kg on board, the mission needs " + (prop.consumo * missionDays) + " kg (" + prop.consumo + " kg/day × " + missionDays + " days).");
      }
    } else {
      notes.push("This mission needs propulsion (pick one in Components).");
    }
  }
  if (cfg.orbita && cfg.lanzador) {
    const totalMass = cfg.orbita.masa + ct.masa;
    if (totalMass > cfg.lanzador.capacidad) {
      score += CFG.mass_penalty; feasible = false;
      notes.push("Launcher cannot lift the mission mass (" + totalMass.toFixed(1) + " t > " + cfg.lanzador.capacidad + " t).");
    }
    const cost = cfg.orbita.presupuesto + cfg.lanzador.costo + ct.presupuesto;
    if (cost > CFG.budget_cap) { score += CFG.budget_penalty; notes.push("Budget overrun: " + cost + " cr (cap " + CFG.budget_cap + " cr)."); }
  }
  return { score: Math.max(0, score), feasible, notes };
}
window.computeMissionScore = computeMissionScore;

function currentConfig() {
  return {
    objetivo: MISSIONS.find(m => m.id === sel.objetivo) || null,
    orbita: ORBITS.find(o => o.id === sel.orbita) || null,
    lanzador: LAUNCHERS.find(l => l.id === sel.lanzador) || null
  };
}

function resourcesOf(cfg) {
  const ct = compTotals();
  return {
    masa: (cfg.orbita ? cfg.orbita.masa : 0) + ct.masa,
    // Potencia neta: lo que consume la mision menos lo que genera el
    // sistema de potencia (negativo = sobra energia).
    potencia: (cfg.orbita ? cfg.orbita.potencia : 0) + ct.potencia,
    presupuesto: (cfg.orbita ? cfg.orbita.presupuesto : 0) + (cfg.lanzador ? cfg.lanzador.costo : 0) + ct.presupuesto,
    datos: (cfg.orbita ? cfg.orbita.datos : 0) + (cfg.objetivo ? cfg.objetivo.datos : 0) + ct.datos,
    // Combustible: capacidad del tanque y gasto total de la mision.
    combustible: ct.combustible,
    combustibleNecesario: ct.consumo * missionDays
  };
}

function saveSel() {
  try {
    const cfg = currentConfig();
    const result = computeMissionScore(cfg);
    localStorage.setItem(STORE_KEY, JSON.stringify({
      objetivo: sel.objetivo, orbita: sel.orbita, lanzador: sel.lanzador,
      score: result.score, recursos: resourcesOf(cfg),
      components: Object.assign({}, comp)
    }));
  } catch (e) { /* modo privado */ }
}

// Lo lee el mapa / las zonas: la mision sobrevive al cambio de pagina.
window.getMissionConfig = function () {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
};

/* ============ ARRANQUE ============ */
// El juego empieza obligatoriamente en el menu. Al entrar al menu se limpia
// la sesion para que ninguna zona o el mapa se puedan abrir sin haber
// iniciado una mision desde el menu.
sessionStorage.removeItem("xonidu-started");

const $ = (s) => document.querySelector(s);
const place = (el, o) => Object.assign(el.style, { left:o.x+"%", top:o.y+"%", width:o.w+"%", height:o.h+"%" });
if (location.search.includes("debug")) $("#stage").classList.add("debug");

/* ============ BOTONES ============ */
BUTTONS.forEach(b => {
  const el = document.createElement("button");
  el.type = "button"; el.className = "btn"; el.dataset.id = b.id;
  el.setAttribute("aria-label", t(b.key)); place(el, b);
  el.textContent = t(b.key);
  el.addEventListener("click", () => {
    if (b.url) { startMission(b.url); return; }
    location.hash = b.id;
  });
  $("#buttons").appendChild(el);
});
// v19.3: botones grandes para el movil en vertical (los mismos 4 del menu,
// mismo texto y mismo click). Solo se ven en portrait <=820px (CSS).
BUTTONS.forEach(b => {
  const nav = $("#mobileMenu");
  if (!nav) return;
  const el = document.createElement("button");
  el.type = "button"; el.className = "mm-btn" + (b.id === "start" ? " start" : "");
  el.dataset.id = b.id;
  el.setAttribute("aria-label", t(b.key));
  el.textContent = t(b.key);
  el.addEventListener("click", () => {
    if (b.url) { startMission(b.url); return; }
    location.hash = b.id;
  });
  nav.appendChild(el);
});

// START MISSION: arranca el reloj de la mision en el backend (dia 1 de N)
// y luego navega al mapa. Si no hay backend, se navega igual.
// (v13) Sin mision elegida NO se inicia: se avisa y se abre la lista de
// misiones. El fit_score de diseno viaja en el payload para el score final.
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 3200);
}
function startMission(url) {
  if (!sel.objetivo) {
    showToast(t("pickMissionFirst"));
    location.hash = "objectives";
    return;
  }
  // Marcar sesion iniciada SOLO al lanzar la mision desde el menu.
  sessionStorage.setItem("xonidu-started", "1");
  try { saveSel(); } catch (e) {}
  let fitScore = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && typeof saved.score === "number") fitScore = saved.score;
  } catch (e) {}
  const payload = {
    objetivo: sel.objetivo, orbita: sel.orbita, lanzador: sel.lanzador,
    difficulty: difficulty, days: missionDays, fit_score: fitScore,
    components: Object.assign({}, comp),
    min_per_day: DIFFICULTY_PRESETS[difficulty].min_per_day
  };
  try {
    fetch("/api/mission/start", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload) })
      .catch(() => {})
      .finally(() => { location.href = url; });
  } catch (e) { location.href = url; }
}

/* ============ DIFICULTAD ============ */
function renderDifficulty() {
  ensureStyles();
  $("#dTitle").textContent = t("difficultyTitle");
  const box = $("#dText");
  let html = '<p class="ms-sub">' + t("difficultySub") + "</p>";
  Object.keys(DIFFICULTY_PRESETS).forEach(key => {
    const p = DIFFICULTY_PRESETS[key];
    const failsKey = key === "facil" ? "difficultyFailsFew" : key === "medio" ? "difficultyFailsNormal" : "difficultyFailsMany";
    const failsCls = key === "facil" ? "easy" : key === "medio" ? "medium" : "hard";
    const nameKey = key === "facil" ? "difficultyEasy" : key === "medio" ? "difficultyMedium" : "difficultyHard";
    const defaultsTxt = key === "facil" ? "🧩 nave ya diseñada (6/6 sistemas)" : key === "medio" ? "🧩 3/6 sistemas listos" : "🧩 tú diseñas la nave (0/6)";
    html += '<button type="button" class="diff-opt' + (key === difficulty ? " sel" : "") + '" data-id="' + key + '">'
      + '<span class="diff-name">' + t(nameKey) + (key === difficulty ? " · " + t("difficultyCurrent") : "") + '</span>'
      + '<span class="diff-line">' + defaultsTxt + " · " + p.days + " " + t("difficultyDays") + " · " + p.min_per_day + " " + t("difficultyMinPerDay")
      + " · " + t("difficultyKp") + " " + p.kp_warn + "/" + p.kp_crit
      + " · " + t("difficultyCme") + " " + p.cme_speed_warn + " km/s"
      + " · " + t("difficultyFlr") + " " + p.flr_min_class + "+"
      + " · " + t("difficultyAttend") + " " + effectiveWindow(key) + " s"
      + " · máx. " + (p.max_anomalies || 2) + " anomalías a la vez"
      + " · " + t("difficultyFresh") + " " + p.event_fresh_hours + " h</span>"
      + '<span class="diff-fails ' + failsCls + '">' + t(failsKey) + "</span></button>";
  });
  html += '<p class="ms-sub" id="diffMsg"></p>';
  // v19.2: control para cambiar los segundos en amarillo (warn) antes de
  // rojo (crit) de la dificultad elegida, sin tocar codigo. Se guarda por
  // dificultad y manda sobre el preset (facil 120 / medio 80 / dificil 60).
  const curWin = effectiveWindow(difficulty);
  html += '<h3 class="ms-h">⏱ Tiempo en amarillo antes de rojo</h3>'
    + '<p class="ms-sub">Segundos que un módulo pasa en warn (amarillo) sin atender antes de escalar a crit (rojo), para la dificultad elegida (' + difficultyName() + ').</p>'
    + '<label class="ms-field"><span>Segundos en warn</span>'
    + '<input type="number" id="winNum" min="5" max="120" value="' + curWin + '">'
    + '<input type="range" id="winRange" min="5" max="120" value="' + curWin + '">'
    + '<em>s</em></label>'
    + '<button type="button" id="winSave" class="ms-save">💾 Guardar tiempo (' + curWin + ' s)</button>'
    + '<span id="winSaved" class="ms-saved"></span>';
  box.innerHTML = html;
  box.querySelectorAll(".diff-opt").forEach(btn => {
    btn.addEventListener("click", () => { applyDifficulty(btn.dataset.id); });
  });
  // Numero y deslizador sincronizados; al guardar, se aplica y se re-muestra.
  const winNum = box.querySelector("#winNum"), winRange = box.querySelector("#winRange");
  const syncWin = (v) => {
    const n = Math.max(5, Math.min(120, Math.round(Number(v) || curWin)));
    if (winNum) winNum.value = n;
    if (winRange) winRange.value = n;
    const saveBtn = box.querySelector("#winSave");
    if (saveBtn) saveBtn.textContent = "💾 Guardar tiempo (" + n + " s)";
    return n;
  };
  if (winNum) winNum.addEventListener("input", () => syncWin(winNum.value));
  if (winRange) winRange.addEventListener("input", () => syncWin(winRange.value));
  const winSave = box.querySelector("#winSave");
  if (winSave) winSave.addEventListener("click", () => {
    const v = syncWin(winNum ? winNum.value : curWin);
    winSave.disabled = true;
    winSave.textContent = "⏳ Guardando...";
    setCustomWindow(difficulty, v);
    CFG.attend_window_sec = v;
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(CFG)); } catch (e) {}
    const done = (okServer) => {
      // Re-renderizar PRIMERO (actualiza las opciones con la ventana nueva)
      // y poner el mensaje DESPUES, sobre los elementos nuevos: si no, el
      // re-render borra el mensaje y parece que el boton no hace nada.
      renderDifficulty();
      const msg = document.querySelector("#winSaved");
      if (msg) msg.textContent = okServer
        ? "✓ Guardado en el servidor: " + difficultyName() + " = " + v + " s en amarillo"
        : "✓ Guardado en este dispositivo: " + difficultyName() + " = " + v + " s en amarillo";
    };
    fetch("/api/config", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attend_window_sec: v }) })
      .then(r => r.ok ? r.json() : null)
      .then(d => done(!!(d && d.ok)))
      .catch(() => done(false));
  });
}

function applyDifficulty(key) {
  if (!DIFFICULTY_PRESETS[key]) return;
  difficulty = key;
  const p = DIFFICULTY_PRESETS[key];
  missionDays = p.days;
  // v15: la dificultad trae sus componentes por defecto (facil = todos,
  // medio = 3, dificil = ninguno). Se reemplaza el diseno actual.
  comp = Object.assign({}, DIFFICULTY_DEFAULT_COMPONENTS[key] || {});
  try {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
    localStorage.setItem(MISSION_DAYS_KEY, String(missionDays));
    localStorage.setItem(COMPONENTS_KEY, JSON.stringify(comp));
    saveSel();
    syncHud();
  } catch (e) {}
  // Aplica los umbrales al backend (los guarda en game_config.json).
  fetch("/api/difficulty", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty: key }) })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (d && d.config) {
        CFG = Object.assign({}, DEFAULT_CONFIG, d.config);
        // v19.2: si el usuario personalizo la ventana de esta dificultad,
        // manda sobre el preset (el backend la guarda en game_config.json).
        const cw = getCustomWindow(key);
        if (cw != null) {
          CFG.attend_window_sec = cw;
          fetch("/api/config", { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attend_window_sec: cw }) }).catch(() => {});
        }
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(CFG)); } catch (e) {}
      }
      const msg = $("#diffMsg");
      if (msg) msg.textContent = d && d.ok ? t("difficultySaved") : t("difficultySavedLocal");
      syncHud(); route();
    })
    .catch(() => {
      const msg = $("#diffMsg");
      if (msg) msg.textContent = t("difficultySavedLocal");
      syncHud(); route();
    });
}

// "Metrics & Algorithms" no es un boton dibujado en la imagen: vive en el
// panel de detalle, junto a Back, para no desalinear los 4 botones reales.
const metricsBtn = document.createElement("button");
metricsBtn.type = "button"; metricsBtn.id = "metricsBtn";
metricsBtn.textContent = t("btnMetrics");
metricsBtn.addEventListener("click", () => { location.hash = "metrics"; });
document.querySelector("#detail .card").appendChild(metricsBtn);

/* ============ PANELES ============ */
function ensureStyles() {
  if (document.getElementById("ms-style")) return;
  const css = document.createElement("style");
  css.id = "ms-style";
  css.textContent = [
    ".ms-opt{display:block;width:100%;text-align:left;background:#12262e;border:1px solid #1e4a5a;color:#dff6ff;border-radius:8px;padding:12px;margin:8px 0;cursor:pointer;font:inherit}",
    ".ms-opt:hover{border-color:#00e5ff}",
    ".ms-opt.sel{border-color:#00e5ff;background:#16414f}",
    ".ms-opt b{display:block;font-size:15px;letter-spacing:1px}",
    ".ms-opt span{font-size:12px;color:#9fc6d4}",
    ".ms-sub{font-size:13px;color:#9fc6d4;margin:0 0 10px}",
    ".ms-summary{margin-top:14px;font-size:13px;color:#9fc6d4;border-top:1px solid #1e4a5a;padding-top:10px}",
    ".ms-warn{color:#ffb02e}",
    ".ms-live{background:#0d2b33;border:1px solid #1e4a5a;border-radius:8px;padding:10px 12px;font-size:13px;color:#dff6ff;margin-bottom:12px}",
    ".ms-h{margin:18px 0 6px;font-size:15px;letter-spacing:1px;color:#dff6ff}",
    ".ms-field{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:13px;color:#9fc6d4}",
    ".ms-field span{flex:1}",
    ".ms-field input{width:90px;padding:6px 8px;border:1px solid #1e4a5a;border-radius:6px;background:#12262e;color:#dff6ff;font:inherit;text-align:right}",
    ".ms-field input[type=range]{width:140px;cursor:pointer}",
    ".ms-field em{font-style:normal;color:#5b8a99;font-size:12px;width:34px}",
    ".ms-save{margin-top:10px;padding:10px 16px;border-radius:8px;border:1px solid #00e5ff;background:#16414f;color:#dff6ff;cursor:pointer;font:inherit}",
    ".ms-saved{margin-left:10px;font-size:13px;color:#9be3a8}",
    "#metricsBtn{margin-top:10px;padding:10px 14px;border-radius:8px;border:1px solid #1e4a5a;background:transparent;color:#dff6ff;cursor:pointer;font:inherit}"
  ].join("\n");
  document.head.appendChild(css);
}

function optionList(title, sub, options, currentId, onPick, extraHtml) {
  ensureStyles();
  $("#dTitle").textContent = title;
  const box = $("#dText");
  let html = '<p class="ms-sub">' + sub + "</p>";
  options.forEach(opt => {
    html += '<button type="button" class="ms-opt' + (opt.id === currentId ? " sel" : "") +
      '" data-id="' + opt.id + '"><b>' + opt.id + "</b><span>" + opt.desc + "</span></button>";
  });
  if (extraHtml) html += extraHtml;
  const cfg = currentConfig();
  const result = computeMissionScore(cfg);
  const res = resourcesOf(cfg);
  const ct = compTotals();
  let summary = 'SCORE: <b>' + result.score + "</b> &nbsp;·&nbsp; MASS: " + res.masa.toFixed(1) +
    " t &nbsp;·&nbsp; POWER: " + res.potencia.toFixed(1) + " kW &nbsp;·&nbsp; BUDGET: " + res.presupuesto +
    " cr &nbsp;·&nbsp; DATA: " + res.datos + " mb &nbsp;·&nbsp; FUEL: " + ct.combustible + " kg";
  if (typeof missionDays === "number") {
    summary += ' &nbsp;·&nbsp; <b>' + t("summaryDuration") + ': ' + missionDays + ' ' + t("objectivesDays") + '</b>';
  }
  summary += ' &nbsp;·&nbsp; <b>' + t("difficultyLabel") + ': ' + difficultyName() + '</b>';
  html += '<div class="ms-summary">' + summary +
    (result.notes.length ? '<br><span class="ms-warn">' + result.notes.join(" ") + "</span>" : "") +
    (result.feasible ? "" : '<br><span class="ms-warn">' + t("summaryNotes") + '</span>') +
    "</div>";
  box.innerHTML = html;
  box.querySelectorAll(".ms-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const opt = options.find(o => o.id === btn.dataset.id);
      onPick(opt);
      saveSel();
      syncHud();
      route();
    });
  });
  // Deslizador de duracion de la mision (solo en la vista Objetivos).
  const slider = box.querySelector("#objDurSlider");
  if (slider) {
    const valDisp = box.querySelector("#objDurVal");
    slider.value = missionDays;
    valDisp.textContent = missionDays;
    slider.addEventListener("input", () => {
      missionDays = Number(slider.value);
      valDisp.textContent = missionDays;
      try { localStorage.setItem(MISSION_DAYS_KEY, String(missionDays)); } catch (e) {}
    });
  }
}

// El texto se construye con los valores REALES (CFG y presets de dificultad),
// asi nunca se desfasa de lo que hace el juego. Unidades como en la barra
// inferior: MASA en t, ENERGIA en kW, PRESUPUESTO en cr, DATOS en mb.
function metricsHtml() {
  const en = LANG === "en", P = DIFFICULTY_PRESETS;
  const per = (f) => (en ? "Easy " : "Fácil ") + f("facil") + " · " + (en ? "Medium " : "Medio ") + f("medio")
    + " · " + (en ? "Hard " : "Difícil ") + f("dificil");
  const kp = per(k => P[k].kp_warn + "/" + P[k].kp_crit);
  const cme = per(k => P[k].cme_speed_warn + " km/s");
  const fresh = per(k => P[k].event_fresh_hours + " h");
  const win = per(k => effectiveWindow(k) + " s");
  const maxA = per(k => String(P[k].max_anomalies || 2));
  const plan = per(k => P[k].days + (en ? " days × " : " días × ") + P[k].min_per_day + " min");
  if (en) return `
      <div class="metrics-card">
        <h3>System metrics (bottom bar)</h3>
        <p><strong>SCORE</strong>: mission points from your design (see “Scoring”). Turns yellow when the design is not feasible.</p>
        <p><strong>MASS</strong>: tonnes (t) = orbit mass + component mass. It must fit the launcher capacity.</p>
        <p><strong>POWER</strong>: net kW = what the mission consumes − what the components generate. Negative = surplus; positive = deficit.</p>
        <p><strong>BUDGET</strong>: credits (cr) = orbit + launcher + components. Going over <code>${CFG.budget_cap}</code> cr costs <code>${CFG.budget_penalty}</code> points.</p>
        <p><strong>DATA</strong>: megabytes (mb) = orbit + mission + instruments.</p>
        <p><strong>Fuel</strong>: kg on board versus what is needed (daily consumption × mission days).</p>

        <h3>Scoring (algorithm)</h3>
        <p>It starts at <code>score_base</code> = ${CFG.score_base} and applies these rules (minimum result 0):</p>
        <p>• Orbit fits the mission: <code>+${CFG.orbit_fit}</code>; does not fit: <code>${CFG.orbit_miss}</code>.<br>
        • Launcher fits: <code>+${CFG.launcher_fit}</code>; does not fit: <code>${CFG.launcher_miss}</code>.<br>
        • The mission's key instrument chosen in Components: <code>+20</code>.<br>
        • A power system is chosen but power is short: <code>−20</code> (not feasible).<br>
        • The mission needs propulsion and there is none, or the fuel is not enough: <code>−20</code> (not feasible).<br>
        • The launcher cannot lift the total mass: <code>${CFG.mass_penalty}</code> (not feasible).<br>
        • Total cost above ${CFG.budget_cap} cr: <code>${CFG.budget_penalty}</code>.</p>
        <p>While playing: completing the mission adds <code>${CFG.complete_bonus}</code> (<code>${CFG.complete_bonus_hard}</code> on mission 7) and missions 4, 5, 6 and 9 generate <code>${CFG.data_bonus}</code> mb of DATA.</p>

        <h3>Module status algorithm</h3>
        <p>Each module has a status: <code>ok</code> (normal), <code>warn</code> (anomaly), <code>crit</code> (critical).</p>
        <p>The status of a zone is the <em>worst</em> of all its modules.</p>
        <p>The global station status is the <em>worst</em> of all zones.</p>

        <h3>Failure escalation</h3>
        <p>A module in <code>warn</code> blinks yellow every 1.2 s. If you do not attend it (click the module) within <code>attend_window_sec</code> seconds it escalates to <code>crit</code> (red blink every 0.5 s). Now: ${win}.</p>
        <p>Only <code>max_anomalies</code> anomalies can be active at once (${maxA}); the rest wait in a queue.</p>

        <h3>NASA integration equations</h3>
        <p>Thresholds depend on the difficulty and can be edited below.</p>
        <p><strong>Radiation (SWPC, Kp index):</strong> Kp ≥ <code>kp_warn</code> → radiation modules go to <code>warn</code>; Kp ≥ <code>kp_crit</code> → <code>crit</code>. Values (warn/crit): ${kp}.</p>
        <p><strong>Solar storm (DONKI FLR):</strong> flares of class <code>flr_min_class</code> or higher (M or X) degrade communications and EVA health.</p>
        <p><strong>CME (DONKI CME):</strong> if speed ≥ <code>cme_speed_warn</code> (${cme}) they reduce solar panel power and degrade the power modules.</p>
        <p><strong>Event age:</strong> only events from the last <code>event_fresh_hours</code> hours count (${fresh}).</p>
        <p><strong>Asteroids (NeoWs):</strong> potentially hazardous ones raise alerts in navigation and structure (no threshold to configure here).</p>

        <h3>Difficulty</h3>
        <p>${plan}. Easy: spacecraft already designed (6/6 systems). Medium: 3/6 systems ready. Hard: you design the whole spacecraft (0/6). The harder the level, the more sensitive the thresholds and the less time to attend failures.</p>
      </div>
    `;
  return `
      <div class="metrics-card">
        <h3>Métricas del sistema (barra inferior)</h3>
        <p><strong>PUNTAJE</strong> (SCORE): puntos de la misión según tu diseño (ver «Puntuación»). Se pone amarillo si el diseño no es viable.</p>
        <p><strong>MASA</strong> (MASS): toneladas (t) = masa de la órbita + masa de los componentes. Debe caber en la capacidad del lanzador.</p>
        <p><strong>ENERGÍA</strong> (POWER): kW netos = lo que consume la misión − lo que generan los componentes. Negativo = sobra energía; positivo = déficit.</p>
        <p><strong>PRESUPUESTO</strong> (BUDGET): créditos (cr) = órbita + lanzador + componentes. Pasar de <code>${CFG.budget_cap}</code> cr resta <code>${CFG.budget_penalty}</code> puntos.</p>
        <p><strong>DATOS</strong> (DATA): megabytes (mb) = órbita + misión + instrumentos.</p>
        <p><strong>Combustible</strong>: kg a bordo frente a lo necesario (consumo diario × días de misión).</p>

        <h3>Puntuación (algoritmo)</h3>
        <p>Se parte de <code>score_base</code> = ${CFG.score_base} y se aplican estas reglas (resultado mínimo 0):</p>
        <p>• Órbita que encaja con la misión: <code>+${CFG.orbit_fit}</code>; si no encaja: <code>${CFG.orbit_miss}</code>.<br>
        • Lanzador que encaja: <code>+${CFG.launcher_fit}</code>; si no: <code>${CFG.launcher_miss}</code>.<br>
        • Instrumento clave de la misión elegido en Componentes: <code>+20</code>.<br>
        • Hay sistema de potencia pero falta energía: <code>−20</code> (misión no viable).<br>
        • La misión exige propulsión y no hay, o el combustible no alcanza: <code>−20</code> (no viable).<br>
        • El lanzador no levanta la masa total: <code>${CFG.mass_penalty}</code> (no viable).<br>
        • Costo total sobre ${CFG.budget_cap} cr: <code>${CFG.budget_penalty}</code>.</p>
        <p>Al jugar: completar la misión suma <code>${CFG.complete_bonus}</code> (<code>${CFG.complete_bonus_hard}</code> en la misión 7) y las misiones 4, 5, 6 y 9 generan <code>${CFG.data_bonus}</code> mb de DATOS.</p>

        <h3>Algoritmo de estado de módulos</h3>
        <p>Cada módulo tiene un estado: <code>ok</code> (normal), <code>warn</code> (anomalía), <code>crit</code> (crítico).</p>
        <p>El estado de una zona es el <em>peor</em> de todos sus módulos.</p>
        <p>El estado global de la estación es el <em>peor</em> de todas las zonas.</p>

        <h3>Escalado de fallas</h3>
        <p>Un módulo en <code>warn</code> parpadea en amarillo cada 1.2 s. Si no lo atiendes (clic en el módulo) antes de <code>attend_window_sec</code> segundos pasa a <code>crit</code> (parpadeo rojo cada 0.5 s). Ahora: ${win}.</p>
        <p>Solo puede haber <code>max_anomalies</code> anomalías activas a la vez (${maxA}); las demás esperan en cola.</p>

        <h3>Ecuaciones de integración NASA</h3>
        <p>Los umbrales dependen de la dificultad y se pueden editar abajo.</p>
        <p><strong>Radiación (SWPC, índice Kp):</strong> Kp ≥ <code>kp_warn</code> → los módulos de radiación pasan a <code>warn</code>; Kp ≥ <code>kp_crit</code> → <code>crit</code>. Valores (warn/crit): ${kp}.</p>
        <p><strong>Tormenta solar (DONKI FLR):</strong> llamaradas de clase <code>flr_min_class</code> o mayor (M o X) degradan comunicaciones y salud en EVA.</p>
        <p><strong>CME (DONKI CME):</strong> si la velocidad ≥ <code>cme_speed_warn</code> (${cme}) reducen la energía de los paneles solares y degradan los módulos de energía.</p>
        <p><strong>Antigüedad:</strong> solo cuentan los eventos de las últimas <code>event_fresh_hours</code> horas (${fresh}).</p>
        <p><strong>Asteroides (NeoWs):</strong> los potencialmente peligrosos generan alerta en navegación y estructura (sin umbral configurable aquí).</p>

        <h3>Dificultad</h3>
        <p>${plan}. Fácil: nave ya diseñada (6/6 sistemas). Medio: 3/6 sistemas listos. Difícil: diseñas toda la nave (0/6). Cuanto más difícil, umbrales más sensibles y menos tiempo para atender los fallos.</p>
      </div>
    `;
}

/* ============ COMPONENTES: disenar la nave (v14) ============ */
// Panel HTML (no toca la imagen): 6 sistemas, 1 opcion por sistema.
// Al elegir se guarda en localStorage y se actualiza el HUD / scoring.
function renderComponents() {
  ensureStyles();
  $("#dTitle").textContent = t("componentsTitle");
  const box = $("#dText");
  let html = '<p class="ms-sub">' + t("componentsSub") + "</p>";
  COMPONENT_SYSTEMS.forEach(sys => {
    const cur = comp[sys.key] || null;
    html += '<h3 class="ms-h">' + sys.name + "</h3>";
    sys.options.forEach(o => {
      const isCur = cur === o.id;
      html += '<button type="button" class="ms-opt' + (isCur ? " sel" : "") + '" data-sys="' + sys.key + '" data-id="' + o.id + '">'
        + "<b>" + o.id + (isCur ? " · " + t("componentsCurrent") : "") + "</b>"
        + "<span>" + o.desc + "</span>"
        + '<span class="diff-line">MASS ' + o.masa + " t · POWER " + (o.potencia > 0 ? "+" : "") + o.potencia + " kW · BUDGET " + o.presupuesto + " cr · DATA " + o.datos + " mb"
        + (o.combustible ? " · FUEL " + o.combustible + " kg (" + o.consumo + " kg/día)" : "")
        + "</span></button>";
    });
  });
  const ct = compTotals();
  const res = resourcesOf(currentConfig());
  html += '<div class="ms-summary"><b>' + t("componentsSummary") + ":</b> MASS " + res.masa.toFixed(1) + " t · POWER " + (res.potencia > 0 ? "+" : "") + res.potencia.toFixed(1) + " kW · BUDGET " + res.presupuesto + " cr · DATA " + res.datos + " mb · FUEL " + ct.combustible + " kg (" + t("componentsFuelNeed") + " " + ct.consumo * missionDays + " kg en " + missionDays + " días)</div>";
  html += '<p class="ms-sub" id="compMsg"></p>';
  box.innerHTML = html;
  box.querySelectorAll(".ms-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      comp[btn.dataset.sys] = btn.dataset.id;
      try { localStorage.setItem(COMPONENTS_KEY, JSON.stringify(comp)); } catch (e) {}
      try { saveSel(); } catch (e) {}
      syncHud();
      renderComponents();
      const msg = $("#compMsg");
      if (msg) msg.textContent = t("componentsSaved");
    });
  });
}

/* ============ PANEL METRICS: ver y configurar ============ */
// El panel muestra: (1) datos NASA en vivo ahora mismo, (2) las metricas,
// algoritmos y ecuaciones del equipo, (3) el formulario para CONFIGURAR
// los valores (umbrales de alerta y scoring). Guardar escribe en el
// backend (POST /api/config -> game_config.json) y en localStorage.
const CONFIG_FIELDS = [
  { key:"kp_warn", label:"Kp warn — tormenta geomagnética (radiación warn)", labelEn:"Kp warn — geomagnetic storm (radiation warn)", unit:"Kp" },
  { key:"kp_crit", label:"Kp crit — tormenta fuerte (radiación crit)", labelEn:"Kp crit — strong storm (radiation crit)", unit:"Kp" },
  { key:"cme_speed_warn", label:"CME rápida — velocidad mínima para alerta de energía", labelEn:"Fast CME — minimum speed for power alert", unit:"km/s" },
  { key:"event_fresh_hours", label:"Antigüedad máxima de un evento FLR/CME para aplicarlo", labelEn:"Maximum age of a FLR/CME event to apply", unit:"h" },
  { key:"attend_window_sec", label:"Segundos en warn (amarillo) sin atender antes de escalar a crit (rojo)", labelEn:"Seconds in warn (yellow) unattended before escalating to crit (red)", unit:"s" },
  { key:"max_anomalies", label:"Anomalías a la vez (las demás quedan en cola y salen solas)", labelEn:"Anomalies at once (the rest queue up and come out on their own)", unit:"" },
  { key:"score_base", label:"Puntaje base de la misión", labelEn:"Mission base score", unit:"pts" },
  { key:"orbit_fit", label:"Órbita correcta", labelEn:"Correct orbit", unit:"pts" },
  { key:"orbit_miss", label:"Órbita incorrecta", labelEn:"Incorrect orbit", unit:"pts" },
  { key:"launcher_fit", label:"Lanzador correcto", labelEn:"Correct launcher", unit:"pts" },
  { key:"launcher_miss", label:"Lanzador incorrecto", labelEn:"Incorrect launcher", unit:"pts" },
  { key:"mass_penalty", label:"El lanzador no levanta la masa", labelEn:"Launcher cannot lift the mass", unit:"pts" },
  { key:"budget_cap", label:"Tope de presupuesto (sobre esto se penaliza)", labelEn:"Budget cap (penalty above this)", unit:"cr" },
  { key:"budget_penalty", label:"Penalización por pasar el tope de presupuesto", labelEn:"Penalty for exceeding the budget cap", unit:"pts" },
  { key:"complete_bonus", label:"Bonus al completar la misión", labelEn:"Bonus for completing the mission", unit:"pts" },
  { key:"complete_bonus_hard", label:"Bonus al completar la misión 7 (la más difícil)", labelEn:"Bonus for completing mission 7 (hardest)", unit:"pts" },
  { key:"data_bonus", label:"DATA que generan las misiones 4, 5, 6 y 9", labelEn:"DATA generated by missions 4, 5, 6 and 9", unit:"mb" }
];

function configFieldLabel(f) { return LANG === "en" && f.labelEn ? f.labelEn : f.label; }

function renderMetrics() {
  ensureStyles();
  $("#dTitle").textContent = t("metricsTitle");
  const box = $("#dText");
  let html = '<div id="ms-live" class="ms-live">' + t("metricsLive") + '</div>' + metricsHtml();
  html += '<h3 class="ms-h">' + t("metricsConfigTitle") + '</h3>'
    + '<p class="ms-sub">' + t("metricsConfigSub") + '</p>'
    + '<div id="ms-config"></div>'
    + '<button type="button" id="ms-save" class="ms-save">' + t("btnSaveConfig") + '</button>'
    + '<span id="ms-saved" class="ms-saved"></span>';
  box.innerHTML = html;
  // Formulario con los valores actuales
  const form = $("#ms-config");
  form.innerHTML = CONFIG_FIELDS.map(f =>
    '<label class="ms-field"><span>' + configFieldLabel(f) + '</span>'
    + '<input type="number" data-key="' + f.key + '" value="' + CFG[f.key] + '">'
    + (f.key === "attend_window_sec" ? '<input type="range" data-key="' + f.key + '" min="5" max="120" value="' + CFG[f.key] + '">' : "")
    + '<em>' + f.unit + '</em></label>'
  ).join("");
  // Numero y deslizador del mismo campo se mantienen sincronizados.
  form.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", () => {
      const v = Number(inp.value);
      if (inp.dataset.key in DEFAULT_CONFIG && !isNaN(v)) {
        CFG[inp.dataset.key] = v;
        form.querySelectorAll('input[data-key="' + inp.dataset.key + '"]').forEach(o => {
          if (o !== inp) o.value = inp.value;
        });
      }
    });
  });
  $("#ms-save").addEventListener("click", saveConfig);
  // v14: los componentes elegidos y sus totales, dentro de Metricas.
  const ct = compTotals();
  const res = resourcesOf(currentConfig());
  const en = LANG === "en";
  const compHtml = '<h3 class="ms-h">' + (en ? "Spacecraft components" : "Componentes de la nave") + '</h3>'
    + '<p class="ms-sub">' + (en ? "What you picked in the Components panel (🧩 button). Each system adds to the resources and the score: key instrument +20; without power or fuel the design is not feasible." : "Lo que elegiste en el panel Componentes (botón 🧩). Cada sistema suma a los recursos y al puntaje: instrumento clave +20; sin potencia o sin combustible el diseño no es viable.") + '</p>'
    + COMPONENT_SYSTEMS.map(sys => {
        const o = compOption(sys.key);
        return "<p><strong>" + sys.name + ":</strong> " + (o ? o.id + " (MASS " + o.masa + " t · POWER " + o.potencia + " kW · BUDGET " + o.presupuesto + " cr · DATA " + o.datos + " mb" + (o.combustible ? " · FUEL " + o.combustible + " kg" : "") + ")" : (en ? "not chosen" : "sin elegir")) + "</p>";
      }).join("")
    + '<p><strong>' + (en ? "Design totals:" : "Totales del diseño:") + '</strong> MASS ' + res.masa.toFixed(1) + " t · POWER " + res.potencia.toFixed(1) + " kW · BUDGET " + res.presupuesto + " cr · DATA " + res.datos + " mb · FUEL " + ct.combustible + " kg (" + (en ? "needs " : "necesita ") + ct.consumo * missionDays + (en ? " kg in " : " kg en ") + missionDays + (en ? " days)" : " días)") + "</p>";
  const msConfig = $("#ms-config");
  if (msConfig) {
    const div = document.createElement("div");
    div.innerHTML = compHtml;
    msConfig.parentNode.insertBefore(div, msConfig);
  }
  fetchLiveData();
}

function saveConfig() {
  const next = {};
  document.querySelectorAll("#ms-config input").forEach(inp => {
    const v = Number(inp.value);
    if (inp.dataset.key in DEFAULT_CONFIG && !isNaN(v)) next[inp.dataset.key] = v;
  });
  Object.assign(CFG, next);
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(CFG)); } catch (e) {}
  const msg = $("#ms-saved");
  fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next)
  }).then(r => r.ok ? r.json() : null).then(d => {
    const ok = !!(d && d.ok);
    msg.textContent = ok ? t("msgSavedBackend") : t("msgSavedLocal");
    if (ok) { showToast(t("msgSavedBackend")); renderMetrics(); }
    syncHud();
  }).catch(() => { msg.textContent = t("msgSavedLocal"); syncHud(); });
}

function fetchLiveData() {
  const el = document.getElementById("ms-live");
  if (!el) return;
  const get = p => fetch(p).then(r => r.ok ? r.json() : null).catch(() => null);
  Promise.all([get("/api/nasa/kp"), get("/api/nasa/flr"), get("/api/nasa/cme"), get("/api/nasa/dsn")])
    .then(([kp, flr, cme, dsn]) => {
      if (!kp && !flr && !cme && !dsn) {
        el.textContent = t("metricsLiveUnavailable");
        return;
      }
      let txt = "<b>Datos NASA en vivo ahora mismo:</b> ";
      if (LANG === "en") txt = "<b>Live NASA data right now:</b> ";
      if (kp && kp.data && kp.data.length) {
        const last = kp.data[kp.data.length - 1];
        txt += t("liveKp") + " " + last.Kp + " (" + last.time_tag + ") · ";
      }
      if (flr && flr.data && flr.data.length) {
        const last = flr.data[flr.data.length - 1];
        txt += t("liveFlr") + " " + last.classType + " (" + last.peakTime + ") · ";
      }
      if (cme && cme.data && cme.data.length) {
        const last = cme.data[cme.data.length - 1];
        const sp = ((last.cmeAnalyses || [{}])[0] || {}).speed;
        txt += t("liveCme") + " " + sp + " km/s (" + last.startTime + ") · ";
      }
      if (dsn && dsn.data && dsn.data.stations) {
        txt += "DSN: " + dsn.data.stations.length + " " + t("liveDsn") + ".";
      }
      el.innerHTML = txt;
    });
}

function route() {
  const id = location.hash.slice(1);
  const b = BUTTONS.find(b => b.id === id && !b.url);
  const isMetrics = id === "metrics";
  const isDifficulty = id === "difficulty";
  const isComponents = id === "components";
  $("#detail").hidden = !b && !isMetrics && !isDifficulty && !isComponents;
  // El boton «Métricas y algoritmos» sobra cuando ya estas viendo las métricas.
  const mBtn = document.getElementById("metricsBtn");
  if (mBtn) mBtn.hidden = isMetrics;
  if (isMetrics) { renderMetrics(); return; }
  if (isDifficulty) { renderDifficulty(); return; }
  if (isComponents) { renderComponents(); return; }
  if (!b) return;
  if (b.id === "objectives") {
    const extra = '<div class="slider-row"><label><span>' + t("objectivesDuration") + '</span> <span id="objDurVal">' + missionDays + '</span> <span class="slider-unit">' + t("objectivesDays") + '</span></label><input type="range" id="objDurSlider" min="1" max="30" value="' + missionDays + '"></div>';
    optionList(t("objectivesTitle"), t("objectivesSub"),
      MISSIONS, sel.objetivo, opt => { sel.objetivo = opt.id; }, extra);
  } else if (b.id === "orbit") {
    optionList(t("orbitTitle"), t("orbitSub"),
      ORBITS, sel.orbita, opt => { sel.orbita = opt.id; });
  } else if (b.id === "launch") {
    optionList(t("launchTitle"), t("launchSub"),
      LAUNCHERS, sel.lanzador, opt => { sel.lanzador = opt.id; });
  }
}
window.addEventListener("hashchange", route);
$("#backBtn").addEventListener("click", () => { location.hash = ""; });
// Botones superiores (HTML, fuera de la imagen): abren los paneles de
// configuracion. Son la UNICA parte editable del juego final.
$("#metricsTopBtn").addEventListener("click", () => { location.hash = "metrics"; });
$("#diffTopBtn").addEventListener("click", () => { location.hash = "difficulty"; });
$("#compTopBtn").addEventListener("click", () => { location.hash = "components"; });
// v15: forzar un poll manual de las APIs de la NASA (util en la demo:
// el jugador no tiene que esperar al poll automatico de 60 s).
$("#refreshTopBtn").addEventListener("click", () => {
  showToast(t("refreshPolling"));
  fetch("/api/nasa/poll", { method: "POST" })
    .then(r => r.ok ? r.json() : null)
    .then(d => { showToast(d && d.ok ? t("refreshOk") : t("refreshFail")); })
    .catch(() => { showToast(t("refreshFail")); });
});
document.addEventListener("keydown", e => { if (e.key === "Escape") location.hash = ""; });

/* ============ BOTÓN IDIOMA ============ */
$("#langBtn").addEventListener("click", () => {
  LANG = LANG === "es" ? "en" : "es";
  try { localStorage.setItem(LANG_KEY, LANG); } catch (e) {}
  applyLang();
});

/* ============ BARRA INFERIOR (SCORE · MASS · POWER · BUDGET · DATA) ============ */
const STATUS = ["ok", "warn", "crit"];
HUD.forEach(h => {
  const el = document.createElement("div");
  el.className = "cell"; el.dataset.id = h.id; place(el, h);
  el.innerHTML = `<span class="lbl">${t(h.key)}</span><span class="val"></span>`;
  $("#hud").appendChild(el);
});
function renderHud() {
  HUD.forEach(h => {
    const el = $(`.cell[data-id="${h.id}"]`);
    el.querySelector(".val").textContent = h.value;
    el.className = "cell " + h.status;
  });
}

// Úsala desde el juego / backend. Acepta un valor o { value, status }:
//   setHud({ score: 1250, mass: "840 kg", power: { value: "3.1 kW", status: "warn" } })
function setHud(update) {
  Object.entries(update).forEach(([id, v]) => {
    const h = HUD.find(h => h.id === id); if (!h) return;
    if (v !== null && typeof v === "object") {
      if ("value" in v) h.value = String(v.value);
      if (STATUS.includes(v.status)) h.status = v.status;
    } else h.value = String(v);
  });
  renderHud();
}
window.setHud = setHud;

// Redondea a 1 decimal (evita 0.30000000000000004 al sumar componentes).
const fmt1 = (n) => String(Math.round(Number(n) * 10) / 10);

// El HUD refleja la configuracion de mision elegida (o 0 si aun no hay).
function syncHud() {
  const cfg = currentConfig();
  const result = computeMissionScore(cfg);
  const res = resourcesOf(cfg);
  setHud({
    score: result.score,
    mass: fmt1(res.masa) + " t",
    power: fmt1(res.potencia) + " kW",
    budget: res.presupuesto + " cr",
    data: res.datos + " mb"
  });
  const scoreCell = HUD.find(h => h.id === "score");
  if (scoreCell) scoreCell.status = result.feasible ? "ok" : "warn";
  renderHud();
}

syncHud(); route(); applyLang();

window.addEventListener("station:missionreset", () => {
  showToast("Otro jugador reinició la partida");
  setTimeout(() => location.reload(), 1000);
});

/* ============ Pantalla del módulo (mini-web) ============ */
// La usan las 24 pantallas de zone-*/modulos/*.html. Muestra:
//  1. Estado en vivo del módulo (ok/warn/crit, desde el store + backend).
//  2. La misión elegida en el menú (localStorage xonidu-mission-v1): si este
//     módulo es clave para ella, sus pasos, puntos y amenazas; si no, qué
//     misiones lo usan. Sin misión elegida, lo dice y lista las que lo usan.
//  3. Los valores en vivo del módulo, leídos de /api/nasa/live
//     (Kp, CME, llamarada, viento solar, DSN, NeoWs, posición de la ISS):
//     números reales de las APIs de la NASA, con su fuente. Si una fuente
//     falla, ese valor sale como "—", nunca inventado.
//  4. Las métricas del módulo (mecanicas-reto-13 §5) con sus umbrales
//     warn/crit, junto al estado en vivo del módulo.
// No hay simulaciones: todo lo que se ve es estado real o reglas del juego.

(function () {
  var LABEL = { ok: "Normal", warn: "Anomalía", crit: "Crítico" };
  var RANK = { ok: 0, warn: 1, crit: 2 };

  function ensureStyles() {
    if (document.getElementById("ms-mod-style")) return;
    var css = document.createElement("style");
    css.id = "ms-mod-style";
    css.textContent = [
      ".mod-sec{margin-top:18px;border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(26,37,64,.4)}",
      ".mod-sec h2{font-size:15px;margin:0 0 8px;color:#7ff3ff;letter-spacing:.04em}",
      ".mod-sec h3{font-size:13px;margin:12px 0 4px;color:#9fb7d6}",
      ".mod-sec p{margin:6px 0;color:#c7d3ea;font-size:13px}",
      ".mod-sec .muted{color:var(--muted)}",
      ".mod-key{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;margin:4px 0}",
      ".mod-key.yes{color:#2ecc71;border:1px solid #2ecc71}",
      ".mod-key.no{color:#9fb7d6;border:1px solid var(--line)}",
      ".mod-steps{margin:8px 0 0;padding-left:18px;font-size:13px;color:#c7d3ea}",
      ".mod-steps li{margin:4px 0}",
      ".mod-steps li.here{color:#7ff3ff;font-weight:700}",
      ".mod-steps li .tag{font-size:11px;color:#5b8a99;font-weight:400}",
      ".mod-metric{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid rgba(36,50,77,.6);font-size:13px}",
      ".mod-metric:first-of-type{border-top:none}",
      ".mod-metric .m-name{color:#e8eefc}",
      ".mod-metric .m-thr{color:#9fb7d6;text-align:right}",
      ".mod-metric .m-thr b{color:#f1c40f;font-weight:600}",
      ".mod-metric .m-thr i{color:#e74c3c;font-style:normal;font-weight:600}",
      ".mod-state{font-size:12px;font-weight:700}",
      ".mod-state.ok{color:#2ecc71}.mod-state.warn{color:#f1c40f}.mod-state.crit{color:#e74c3c}",
      ".mod-mission-list{margin:8px 0 0;padding-left:18px;font-size:13px;color:#c7d3ea}",
      ".mod-mission-list li{margin:3px 0}",
      ".mod-repair{border-color:rgba(241,196,15,.6)}",
      ".mod-repair.crit{border-color:rgba(231,76,60,.7)}",
      ".mod-repair h2{color:#f1c40f}",
      ".mod-repair.crit h2{color:#e74c3c}",
      ".repair-bar-wrap{height:8px;border-radius:4px;background:#1a2540;overflow:hidden;margin:8px 0}",
      ".repair-bar{height:100%;background:#2ecc71;transition:width .3s}",
      ".repair-steps{list-style:none;margin:10px 0 0;padding:0}",
      ".repair-steps li{margin:6px 0}",
      ".repair-step{display:block;width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:#16213a;color:#e8eefc;font:inherit;cursor:pointer}",
      ".repair-step:disabled{cursor:default;opacity:.55}",
      ".repair-step.done{border-color:#2ecc71;color:#2ecc71}",
      ".repair-step.busy{border-color:#f1c40f;color:#f1c40f}",
      ".repair-step .st{float:right;font-weight:700}",
      ".live-val{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid rgba(36,50,77,.6);font-size:13px}",
      ".live-val:first-of-type{border-top:none}",
      ".live-val .lv-name{color:#e8eefc}",
      ".live-val .lv-src{display:block;font-size:11px;color:#5b8a99}",
      ".live-val .lv-num{color:#7ff3ff;text-align:right;font-weight:700;white-space:nowrap}",
      ".live-val .lv-num.na{color:#93a1bf;font-weight:400}",
      ".help-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1px solid #7ff3ff;background:transparent;color:#7ff3ff;font-size:13px;font-weight:700;line-height:1;cursor:pointer;margin-left:8px;vertical-align:middle;padding:0}",
      ".help-btn:hover{background:rgba(127,243,255,.15)}",
      ".help-box{margin-top:10px;padding:12px;border:1px solid rgba(127,243,255,.4);border-radius:8px;background:rgba(10,20,40,.6);font-size:13px;color:#c7d3ea}",
      ".help-box b{color:#7ff3ff}",
      ".help-box p{margin:6px 0}"
    ].join("\n");
    document.head.appendChild(css);
  }

  function getStatus(id) {
    try {
      return (window.stationStore ? stationStore.getModuleStatus(id) : "ok") || "ok";
    } catch (e) { return "ok"; }
  }

  function getChosenMission() {
    try {
      var saved = JSON.parse(localStorage.getItem("xonidu-mission-v1") || "null");
      if (!saved || !saved.objetivo) return null;
      var m = (window.XONIDU_MISSIONS || []).find(function (x) { return x.id === saved.objetivo; });
      if (!m) return null;
      return { mission: m, chosen: saved };
    } catch (e) { return null; }
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---- Reparacion interactiva (mecanica de tarea, estilo Among Us / FNAF
  // pero con procedimientos reales de la ISS) ----
  // Un modulo en warn/crit NO se arregla con un clic: hay que completar su
  // procedimiento de reparacion paso a paso, en orden, y cada paso tarda
  // ~1 s (trabajo real de tripulacion). En crit hay un paso extra.
  // Al completar los pasos, el modulo pasa a ok (se propaga al backend).
  var REPAIR_STEP_MS = 1000;
  var REPAIR_STEPS = {
    "energy": ["Aislar el circuito afectado", "Reiniciar el inversor", "Verificar la tensión del bus"],
    "eclss": ["Cerrar la válvula de aislamiento", "Purgar el conducto de aire", "Verificar O2 y CO2"],
    "thermal": ["Aislar el lazo térmico", "Reiniciar la bomba de refrigerante", "Verificar la temperatura"],
    "comms": ["Reorientar la antena", "Restablecer el enlace", "Verificar la señal"],
    "radiation": ["Cerrar las persianas de protección", "Verificar el blindaje", "Confirmar la dosis de radiación"],
    "command": ["Reiniciar el controlador", "Verificar la telemetría", "Confirmar el enlace de mando"],
    "navigation": ["Recalibrar el giroscopio", "Verificar la actitud", "Confirmar la órbita"],
    "robotics": ["Detener el brazo robótico", "Reiniciar el controlador", "Verificar el agarre"],
    "robotics-eva": ["Asegurar el traje EVA", "Verificar el soporte vital", "Confirmar la esclusa"],
    "structure": ["Inspeccionar el segmento", "Asegurar los pernos", "Verificar la integridad"],
    "science": ["Guardar los datos del experimento", "Reiniciar el experimento", "Verificar la telemetría"],
    "propulsion": ["Cerrar la válvula de propelente", "Purgar la línea", "Verificar la presión"],
    "fire": ["Cerrar la compuerta", "Descargar el extintor", "Verificar que no haya humo"],
    "health": ["Revisar los signos vitales", "Administrar primeros auxilios", "Verificar a la tripulación"],
    "habitability": ["Ventilar el módulo", "Verificar la presurización", "Confirmar el confort"],
    "food": ["Revisar las cámaras de cultivo", "Ajustar la iluminación", "Verificar el riego"]
  };
  var REPAIR_CRIT_EXTRA = "Confirmar la contención de la anomalía";
  var REPAIR_GENERIC = ["Aislar el módulo", "Reiniciar el sistema", "Verificar el estado"];
  // Progreso persistente (sobrevive a los re-renders por cambio de estado):
  // id -> { done: pasos completados, busy: paso en curso (-1 si ninguno) }
  var repairProgress = {};
  var repairIds = [];
  function slugOf(id) { return String(id).replace(/^mod-[a-f]-/, ""); }
  function stepsFor(id) {
    var base = REPAIR_STEPS[slugOf(id)] || REPAIR_GENERIC;
    if (getStatus(id) === "crit") return base.concat([REPAIR_CRIT_EXTRA]);
    return base;
  }
  function repairSection(ids) {
    repairIds = ids.slice();
    var box = document.getElementById("repairBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "repairBox";
      var mission = document.getElementById("missionBox");
      if (mission && mission.parentNode) mission.parentNode.insertBefore(box, mission);
      else if (document.body) document.body.appendChild(box);
      if (!box._repairBound) {
        box._repairBound = true;
        box.addEventListener("click", function (e) {
          var b = e.target && e.target.closest ? e.target.closest(".repair-step") : null;
          if (!b || b.disabled) return;
          var modId = b.getAttribute("data-mod");
          var stepIdx = parseInt(b.getAttribute("data-step"), 10);
          var prog = repairProgress[modId];
          if (!prog || stepIdx !== prog.done || prog.busy !== -1) return;
          prog.busy = stepIdx;
          repairSection(repairIds);
          setTimeout(function () {
            var p2 = repairProgress[modId];
            if (!p2) return;
            p2.done += 1;
            p2.busy = -1;
            var steps = stepsFor(modId);
            if (p2.done >= steps.length) {
              delete repairProgress[modId];
              try { if (window.stationStore) stationStore.setModuleStatus(modId, "ok"); } catch (err) {}
            }
            repairSection(repairIds);
          }, REPAIR_STEP_MS);
        });
      }
    }
    var html = "";
    var anyFail = false;
    ids.forEach(function (id) {
      var st = getStatus(id);
      var info = (window.XONIDU_MODULE_INFO || {})[id];
      var name = info ? info.name : id;
      if (st === "ok") { delete repairProgress[id]; return; }
      anyFail = true;
      var steps = stepsFor(id);
      var prog = repairProgress[id] || (repairProgress[id] = { done: 0, busy: -1 });
      if (prog.done > steps.length) prog.done = steps.length;
      var pct = Math.round((prog.done / steps.length) * 100);
      html += '<div class="mod-sec mod-repair ' + st + '"><h2>⚠ Reparación necesaria — ' + esc(name) + helpHTML("repair", id) + helpHTML("module", id) + '</h2>'
        + '<p>Estado: <span class="mod-state ' + st + '">' + LABEL[st] + '</span> — completa el procedimiento para restablecer el módulo. Cada paso tarda un momento: es trabajo real de tripulación, no un clic.</p>'
        + '<div class="repair-bar-wrap"><div class="repair-bar" style="width:' + pct + '%"></div></div>'
        + '<ol class="repair-steps">'
        + steps.map(function (s, i) {
            var done = i < prog.done;
            var busy = i === prog.busy;
            var dis = (!done && !busy && i === prog.done) ? "" : " disabled";
            var cls = done ? " done" : (busy ? " busy" : "");
            var mark = done ? "✓ Hecho" : (busy ? "… Trabajando" : (i === prog.done ? "▶ Hacer" : "—"));
            return '<li><button type="button" class="repair-step' + cls + '" data-mod="' + esc(id) + '" data-step="' + i + '"' + dis + '>'
              + (i + 1) + ". " + esc(s) + '<span class="st">' + mark + "</span></button></li>";
          }).join("")
        + "</ol>"
        + "<p class=\"muted\">Al completar los pasos, el módulo vuelve a Normal y la anomalía queda atendida.</p></div>";
    });
    if (!anyFail) {
      html = '<div class="mod-sec"><h2>Estado del módulo</h2><p>Sistema nominal — sin fallas. Si aparece una anomalía (datos reales de la NASA), aquí saldrá el procedimiento de reparación.</p></div>';
    }
    box.innerHTML = html;
  }

  // ---- Valores en vivo de la NASA (reto 13: el juego se apega a la
  // realidad) ---- Cada modulo muestra los valores REALES que lo afectan,
  // leidos de /api/nasa/live (el backend los saca de las APIs de la NASA).
  // Si una fuente falla, ese valor sale como "—" (no se inventa nada).
  // El numero se muestra junto a su fuente, para que el jugador vea que
  // es dato real y no simulacion.
  var LIVE_VALUES = {
    "energy": [
      { key: "cme_speed", label: "Velocidad del último CME", unit: " km/s", source: "DONKI / NASA" },
      { key: "solar_wind", label: "Viento solar (DSCOVR)", unit: " km/s", source: "SWPC / NOAA" }
    ],
    "radiation": [
      { key: "kp", label: "Índice Kp (tormenta geomagnética)", unit: "", source: "SWPC / NOAA" },
      { key: "flare", label: "Última llamarada solar", unit: "", source: "DONKI / NASA" }
    ],
    "comms": [
      { key: "dsn_stations", label: "Estaciones DSN activas", unit: "", source: "DSN Now / NASA" },
      { key: "flare", label: "Última llamarada solar", unit: "", source: "DONKI / NASA" }
    ],
    "navigation": [
      { key: "neo_count", label: "Objetos cercanos a la Tierra (7 días)", unit: "", source: "NeoWs / NASA" },
      { key: "iss_lat", label: "Latitud de la ISS", unit: "°", source: "Where The ISS At" }
    ],
    "thermal": [
      { key: "solar_wind", label: "Viento solar (DSCOVR)", unit: " km/s", source: "SWPC / NOAA" },
      { key: "mag_bt", label: "Campo magnético total", unit: " nT", source: "SWPC / NOAA" }
    ],
    "eclss": [
      { key: "kp", label: "Índice Kp (radiación para la tripulación)", unit: "", source: "SWPC / NOAA" },
      { key: "solar_wind", label: "Viento solar", unit: " km/s", source: "SWPC / NOAA" }
    ],
    "command": [
      { key: "dsn_stations", label: "Estaciones DSN activas", unit: "", source: "DSN Now / NASA" },
      { key: "kp", label: "Índice Kp", unit: "", source: "SWPC / NOAA" }
    ],
    "robotics": [
      { key: "neo_count", label: "Objetos cercanos (riesgo de debris)", unit: "", source: "NeoWs / NASA" },
      { key: "iss_alt", label: "Altitud de la ISS", unit: " km", source: "Where The ISS At" }
    ],
    "robotics-eva": [
      { key: "kp", label: "Índice Kp (radiación durante EVA)", unit: "", source: "SWPC / NOAA" },
      { key: "flare", label: "Última llamarada solar", unit: "", source: "DONKI / NASA" }
    ],
    "structure": [
      { key: "neo_count", label: "Objetos cercanos (riesgo de debris)", unit: "", source: "NeoWs / NASA" },
      { key: "cme_speed", label: "Velocidad del último CME", unit: " km/s", source: "DONKI / NASA" }
    ],
    "science": [
      { key: "iss_lat", label: "Latitud de la ISS", unit: "°", source: "Where The ISS At" },
      { key: "neo_count", label: "Objetos cercanos (7 días)", unit: "", source: "NeoWs / NASA" }
    ],
    "propulsion": [
      { key: "iss_alt", label: "Altitud de la ISS", unit: " km", source: "Where The ISS At" },
      { key: "neo_count", label: "Objetos cercanos", unit: "", source: "NeoWs / NASA" }
    ],
    "fire": [
      { key: "solar_wind", label: "Viento solar", unit: " km/s", source: "SWPC / NOAA" },
      { key: "kp", label: "Índice Kp", unit: "", source: "SWPC / NOAA" }
    ],
    "health": [
      { key: "kp", label: "Índice Kp (dosis de radiación)", unit: "", source: "SWPC / NOAA" },
      { key: "flare", label: "Última llamarada solar", unit: "", source: "DONKI / NASA" }
    ],
    "habitability": [
      { key: "kp", label: "Índice Kp", unit: "", source: "SWPC / NOAA" },
      { key: "solar_wind", label: "Viento solar", unit: " km/s", source: "SWPC / NOAA" }
    ],
    "food": [
      { key: "iss_lat", label: "Latitud de la ISS", unit: "°", source: "Where The ISS At" },
      { key: "solar_wind", label: "Viento solar", unit: " km/s", source: "SWPC / NOAA" }
    ]
  };
  var liveCache = null;
  var liveTimer = null;
  function fmtLive(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return (Math.round(v * 100) / 100).toString();
    return String(v);
  }
  function liveSection(ids) {
    var box = document.getElementById("liveBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "liveBox";
      var mission = document.getElementById("missionBox");
      if (mission && mission.parentNode) mission.parentNode.insertBefore(box, mission);
      else if (document.body) document.body.appendChild(box);
    }
    function renderLive(data) {
      var html = "";
      ids.forEach(function (id) {
        var info = (window.XONIDU_MODULE_INFO || {})[id];
        var name = info ? info.name : id;
        var rows = LIVE_VALUES[slugOf(id)] || [];
        html += '<div class="mod-sec"><h2>' + esc(name) + ' — Valores en vivo (NASA)' + helpHTML("live", id) + '</h2>';
        if (!data) {
          html += '<p class="muted">Sin conexión al backend: los valores reales no están disponibles ahora mismo. El estado del módulo (Normal / Anomalía / Crítico) sí sigue en vivo desde el store.</p>';
        } else {
          rows.forEach(function (r) {
            var v = fmtLive(data[r.key]);
            html += '<div class="live-val"><span class="lv-name">' + esc(r.label)
              + '<span class="lv-src">Fuente: ' + esc(r.source) + '</span></span>'
              + '<span class="lv-num' + (v === null ? ' na' : '') + '">' + (v === null ? "—" : esc(v) + esc(r.unit)) + '</span></div>';
          });
          html += '<p class="muted">Valores reales de las APIs de la NASA (no simulados). Se actualizan cada 60 s.</p>';
        }
        html += "</div>";
      });
      box.innerHTML = html;
    }
    if (liveCache) renderLive(liveCache);
    else renderLive(null);
    if (!liveTimer && typeof fetch === "function") {
      var fetchLive = function () {
        fetch("/api/nasa/live").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          if (d && d.data) { liveCache = d.data; renderLive(liveCache); }
        }).catch(function () {});
      };
      fetchLive();
      liveTimer = setInterval(fetchLive, 60000);
    }
  }

  // ---- Ayuda "?" (v11) ---- Cada apartado y cada modulo tiene un "?"
  // que explica: que es, su importancia y como arreglarlo (jugar).
  var MODULE_HELP = {
    "energy": { que: "El sistema eléctrico de la estación: paneles solares, baterías e inversores que distribuyen la energía.", importancia: "Sin energía no funciona nada: ni la vida, ni las comunicaciones, ni los experimentos. Es el módulo más crítico.", como: "Cuando falle, completa la tarea de reparación: aislar el circuito, reiniciar el inversor y verificar la tensión del bus." },
    "eclss": { que: "El sistema de soporte vital: controla el oxígeno, el CO2, la humedad y la presión del aire que respira la tripulación.", importancia: "Sin ECLSS la tripulación no puede respirar. Es el sistema que mantiene la cabina habitable.", como: "Completa la tarea: cerrar la válvula, purgar el conducto y verificar O2 y CO2." },
    "thermal": { que: "El control térmico: radiadores y bombas de refrigerante que sacan el calor de la estación al espacio.", importancia: "Sin control térmico la estación se sobrecalienta y los equipos fallan.", como: "Aislar el lazo, reiniciar la bomba y verificar la temperatura." },
    "comms": { que: "Las comunicaciones: antenas y enlaces con la Tierra (vía la red DSN de la NASA).", importancia: "Sin comms no hay telemetría ni órdenes desde el control de misión.", como: "Reorientar la antena, restablecer el enlace y verificar la señal." },
    "radiation": { que: "La protección contra la radiación: sensores y blindaje que miden la dosis que recibe la tripulación.", importancia: "Las tormentas solares suben la radiación y ponen en riesgo a la tripulación, sobre todo en un EVA.", como: "Cerrar las persianas, verificar el blindaje y confirmar la dosis." },
    "command": { que: "El centro de mando: el controlador que coordina los sistemas y ejecuta las órdenes de la tripulación.", importancia: "Es el cerebro de la estación: si falla, los demás sistemas no se coordinan.", como: "Reiniciar el controlador, verificar la telemetría y confirmar el enlace de mando." },
    "navigation": { que: "La navegación: giroscopios y sensores que mantienen la actitud (orientación) y la órbita de la estación.", importancia: "Sin navegación la estación pierde su orientación y no puede apuntar los paneles ni las antenas.", como: "Recalibrar el giroscopio, verificar la actitud y confirmar la órbita." },
    "robotics": { que: "El brazo robótico: captura naves de carga, mueve módulos y apoya los paseos espaciales.", importancia: "Sin el brazo no se puede capturar la Dragon/Cygnus ni hacer mantenimiento en órbita.", como: "Detener el brazo, reiniciar el controlador y verificar el agarre." },
    "robotics-eva": { que: "El soporte para paseos espaciales (EVA): trajes, esclusa y herramientas para trabajar fuera de la estación.", importancia: "Las EVA son las misiones más arriesgadas: el traje es la única protección del astronauta.", como: "Asegurar el traje, verificar el soporte vital y confirmar la esclusa." },
    "structure": { que: "La estructura: el esqueleto de la estación, segmentos, pernos y paneles.", importancia: "Si la estructura falla, hay riesgo de descompresión y de pérdida de módulos.", como: "Inspeccionar el segmento, asegurar los pernos y verificar la integridad." },
    "science": { que: "Los experimentos científicos: microgravedad, cultivos y observación de la Tierra.", importancia: "La ciencia es la razón de ser de la estación: genera datos que no se pueden obtener en la Tierra.", como: "Guardar los datos, reiniciar el experimento y verificar la telemetría." },
    "propulsion": { que: "La propulsión: motores y propelente que mantienen la órbita de la estación.", importancia: "Sin propulsión la estación pierde altitud y cae.", como: "Cerrar la válvula, purgar la línea y verificar la presión." },
    "fire": { que: "La detección y extinción de incendios: sensores de humo y extintores.", importancia: "Un incendio en el espacio es letal: no hay a dónde escapar y el humo no se disipa.", como: "Cerrar la compuerta, descargar el extintor y verificar que no haya humo." },
    "health": { que: "La salud de la tripulación: signos vitales y primeros auxilios.", importancia: "La tripulación es lo más importante: sin ellos no hay misión.", como: "Revisar los signos vitales, administrar primeros auxilios y verificar a la tripulación." },
    "habitability": { que: "La habitabilidad: dormitorios, comedor, higiene y confort de la tripulación.", importancia: "Una tripulación que no descansa ni come bien comete errores.", como: "Ventilar el módulo, verificar la presurización y confirmar el confort." },
    "food": { que: "Los cultivos y alimentos: las cámaras de crecimiento (Veggie) y las provisiones.", importancia: "La comida fresca es salud y moral: en misiones largas no se puede depender solo de provisiones.", como: "Revisar las cámaras, ajustar la iluminación y verificar el riego." }
  };
  var SECTION_HELP = {
    "repair": { que: "La tarea de reparación: el procedimiento que debes completar para restablecer un módulo en anomalía.", importancia: "Ya no basta con un clic: reparar es el corazón del juego. Cada módulo que falla exige trabajo real, y mientras no lo repares puede escalar a crítico.", como: "Haz clic en los pasos en orden. Cada paso tarda ~1 s. Al completar todos, el módulo vuelve a Normal." },
    "live": { que: "Los valores reales de la NASA que afectan a este módulo, leídos de las APIs en vivo.", importancia: "Son datos reales, no simulados: lo que ves es lo que la NASA está midiendo ahora mismo. Por eso el juego cambia con el clima espacial real.", como: "Si un valor sale de rango, el módulo puede entrar en anomalía. Vigila los valores y repara el módulo cuando falle." },
    "mission": { que: "La misión que elegiste en el menú: sus pasos, sus puntos y los módulos que necesita.", importancia: "Cada misión tiene pasos que valen 100 puntos y un bonus al completarla. Los módulos marcados como clave son los que necesitas para esa misión.", como: "Sigue los pasos de la misión. Los pasos con '← este módulo' dependen de este módulo: mantenlo en Normal." },
    "metrics": { que: "Las métricas del módulo y sus umbrales de alerta (warn / crit).", importancia: "Los umbrales te dicen cuándo un valor está fuera de rango. El estado en vivo (Normal / Anomalía / Crítico) resume si el módulo está bien.", como: "Si el estado es Anomalía o Crítico, ve a la sección de reparación y completa la tarea." }
  };
  var helpOpen = {};
  function helpHTML(kind, modId) {
    var h = null;
    if (kind === "module") h = MODULE_HELP[slugOf(modId)] || null;
    else h = SECTION_HELP[kind] || null;
    if (!h) return "";
    var id = "help-" + kind + "-" + String(modId || "x").replace(/[^a-z0-9-]/gi, "");
    var open = !!helpOpen[id];
    return '<button type="button" class="help-btn" data-target="' + id + '" title="¿Qué es esto?">?</button>'
      + '<div class="help-box" id="' + id + '"' + (open ? "" : " hidden") + '>'
      + "<p><b>Qué es:</b> " + esc(h.que) + "</p>"
      + "<p><b>Importancia:</b> " + esc(h.importancia) + "</p>"
      + "<p><b>Cómo arreglar (jugar):</b> " + esc(h.como) + "</p></div>";
  }
  function bindHelpToggle() {
    if (window._xoniduHelpBound || !document.addEventListener) return;
    window._xoniduHelpBound = true;
    document.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest(".help-btn") : null;
      if (!b) return;
      var target = b.getAttribute("data-target");
      var hb = target ? document.getElementById(target) : null;
      if (!hb) return;
      helpOpen[target] = !helpOpen[target];
      hb.hidden = !helpOpen[target];
    });
  }

  function missionSection(moduleIds) {
    var box = document.getElementById("missionBox");
    if (!box) return;
    var chosen = getChosenMission();
    var html = "";
    if (chosen) {
      var m = chosen.mission, sel = chosen.chosen;
      var isKey = m.modules === "ALL" || moduleIds.some(function (id) { return m.modules.indexOf(id) !== -1; });
      var fit = "";
      if (sel.orbita) fit += "Órbita elegida: <b>" + esc(sel.orbita) + "</b> (recomendada: " + esc(m.orbit) + (m.orbitAlt ? " o " + esc(m.orbitAlt) : "") + ")";
      if (sel.lanzador) fit += (fit ? " · " : "") + "Lanzador elegido: <b>" + esc(sel.lanzador) + "</b> (recomendado: " + esc(m.launcher.join(" o ")) + ")";
      html += '<div class="mod-sec"><h2>Misión elegida' + helpHTML("mission", "mision") + '</h2>'
        + "<p><b>" + esc(m.name) + "</b> — " + esc(m.desc) + "</p>"
        + '<p><span class="mod-key ' + (isKey ? "yes" : "no") + '">' + (isKey ? "★ Módulo clave para esta misión" : "Este módulo no es clave para la misión, pero mantiene la estación en marcha") + "</span></p>"
        + (fit ? "<p>" + fit + "</p>" : "")
        + "<p>100 puntos por paso · +" + m.bonus + " al completar" + (m.datos ? " · +" + m.datos + " DATA" : "") + "</p>"
        + "<h3>Pasos de la misión</h3><ol class=\"mod-steps\">"
        + m.steps.map(function (s, i) {
            var here = s.modules && s.modules.some(function (id) { return moduleIds.indexOf(id) !== -1; });
            return "<li" + (here ? ' class="here"' : "") + ">" + esc(s.text)
              + (here ? ' <span class="tag">← este módulo</span>' : "") + "</li>";
          }).join("")
        + "</ol>"
        + "<h3>Eventos que la amenazan</h3><p>" + esc(m.threats) + "</p></div>";
    } else {
      var using = [];
      moduleIds.forEach(function (id) {
        (window.XONIDU_MISSIONS_FOR_MODULE || function () { return []; })(id).forEach(function (mm) {
          if (using.indexOf(mm) === -1) using.push(mm);
        });
      });
      html += '<div class="mod-sec"><h2>Misión' + helpHTML("mission", "mision") + '</h2>'
        + "<p>No hay misión elegida todavía. Elígela en el menú (Mission Objectives) y vuelve aquí: esta pantalla te dirá si el módulo es clave para ella, qué pasos dependen de él y qué eventos la amenazan.</p>"
        + (using.length ? "<h3>Este módulo participa en:</h3><ul class=\"mod-mission-list\">"
          + using.map(function (mm) { return "<li><b>" + esc(mm.name) + "</b> — " + esc(mm.desc) + "</li>"; }).join("")
          + "</ul>" : "")
        + "</div>";
    }
    box.innerHTML = html;
  }

  function metricsSection(moduleIds) {
    var box = document.getElementById("metricsBox");
    if (!box) return;
    var html = "";
    moduleIds.forEach(function (id) {
      var info = (window.XONIDU_MODULE_INFO || {})[id];
      if (!info) return;
      var st = getStatus(id);
      html += '<div class="mod-sec"><h2>' + esc(info.name) + ' — Métricas' + helpHTML("metrics", id) + helpHTML("module", id) + '</h2>'
        + "<p>" + esc(info.blurb) + "</p>"
        + '<p>Estado en vivo: <span class="mod-state ' + st + '">' + LABEL[st] + "</span>"
        + ' <span class="muted">(ok = dentro de rango · warn = fuera de rango · crit = fuera de rango grave)</span></p>'
        + info.metrics.map(function (mt) {
            return '<div class="mod-metric"><span class="m-name">' + esc(mt.name)
              + (mt.unit ? " (" + esc(mt.unit) + ")" : "") + '</span><span class="m-thr">warn <b>' + esc(mt.warn)
              + "</b> · crit <i>" + esc(mt.crit) + "</i></span></div>";
          }).join("")
        + "</div>";
    });
    box.innerHTML = html;
  }

  function refreshBadge(moduleIds) {
    var el = document.getElementById("mStatus");
    if (!el) return;
    var worst = "ok";
    moduleIds.forEach(function (id) {
      var st = getStatus(id);
      if (RANK[st] > RANK[worst]) worst = st;
    });
    el.textContent = LABEL[worst];
    el.className = "status " + worst;
    var list = document.getElementById("mParts");
    if (list) {
      list.innerHTML = moduleIds.map(function (id) {
        var info = (window.XONIDU_MODULE_INFO || {})[id];
        return "<li>" + esc(info ? info.name : id) + ": " + LABEL[getStatus(id)] + "</li>";
      }).join("");
    }
  }

  window.renderModuleScreen = function (moduleIds, title, zoneLabel) {
    ensureStyles();
    bindHelpToggle();
    var ids = Array.isArray(moduleIds) ? moduleIds : [moduleIds];
    function render() {
      refreshBadge(ids);
      repairSection(ids);
      liveSection(ids);
      missionSection(ids);
      metricsSection(ids);
    }
    window.addEventListener("station:modulestatuschange", render);
    render();
  };
})();

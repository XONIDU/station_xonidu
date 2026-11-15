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
  var LABEL = { ok: "Normal", pre: "Señal temprana", warn: "Anomalía", crit: "Crítico" };
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
      ".diag-box{border:1px solid #f1c40f;border-radius:8px;padding:12px;margin:10px 0;background:rgba(241,196,15,.06)}",
      ".diag-opt{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border-radius:8px;border:1px solid #24324d;background:#1a2540;color:#e8eefc;cursor:pointer;font:inherit}",
      ".diag-opt:hover{border-color:#00e5ff;background:#16414f}",
      ".diag-wrong{color:#e74c3c;font-weight:700}",
      ".diag-bad{border-color:#e74c3c !important;background:#3d0f0f !important;animation:diagPulseRed 0.8s infinite}",
      "@keyframes diagPulseRed{0%,100%{box-shadow:0 0 0 0 rgba(231,76,60,.0)}50%{box-shadow:0 0 14px 3px rgba(231,76,60,.8)}}",
      ".diag-good{border-color:#2ecc71 !important;background:#0f2e1a !important}",
      ".flow-hint{background:#0e1a2e;border:1px solid #1e4a5a;border-radius:8px;padding:10px 12px;margin-bottom:12px;color:#cfe3ff}",
      ".pre-box{background:#2e2208;border:1px solid #f5b041;border-radius:8px;padding:10px 12px;margin:10px 0;color:#ffe9b0}",
      ".mod-sec.shielded{border-color:#00e5ff !important;background:#0e2233 !important}",
      ".mod-sec.shielded h2{color:#7ff3ff}",
      ".mod-sec.shielded .pre-box{color:#7ff3ff}",
      ".reinforce-btn{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border-radius:8px;border:1px solid #f5b041;background:#2e2208;color:#ffe9b0;cursor:pointer;font:inherit}",
      ".reinforce-btn:hover{border-color:#ffd166;background:#3d2f0a}",
      ".reinforce-btn:disabled{opacity:.45;cursor:default}",
      ".cal-box{background:#0e1a2e;border:1px solid #1e4a5a;border-radius:8px;padding:12px;margin:10px 0}",
      ".cal-slider{width:100%;margin:10px 0}",
      ".cal-target{color:#2ecc71;font-weight:700}",
      ".cal-bad{color:#e74c3c;font-weight:700}",
      ".seq-btn{display:inline-block;margin:4px;padding:10px 14px;border-radius:8px;border:1px solid #24324d;background:#1a2540;color:#e8eefc;cursor:pointer;font:inherit}",
      ".seq-btn:hover{border-color:#00e5ff;background:#16414f}",
      ".seq-btn.done{border-color:#2ecc71;background:#0f2e1a;color:#2ecc71}",
      ".seq-btn.bad{border-color:#e74c3c !important;background:#3d0f0f !important;animation:diagPulseRed 0.8s infinite}",
      ".hold-btn{display:block;width:100%;padding:14px;border-radius:8px;border:1px solid #24324d;background:#1a2540;color:#e8eefc;cursor:pointer;font:inherit;text-align:left}",
      ".hold-btn.holding{border-color:#00e5ff;background:#16414f}",
      ".hold-bar{height:8px;background:#0e1a2e;border-radius:4px;margin-top:8px;overflow:hidden}",
      ".hold-fill{height:100%;width:0%;background:#00e5ff;transition:width .1s linear}",
      ".hold-hint{font-size:13px;color:#9fb3c8;margin-top:6px}",
      ".keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:260px;margin:10px 0}",
      ".keypad-btn{padding:14px;font-size:18px;font-weight:700;border-radius:8px;border:1px solid #24324d;background:#1a2540;color:#e8eefc;cursor:pointer}",
      ".keypad-btn:active{background:#16414f;border-color:#00e5ff}",
      ".keypad-display{font-size:24px;letter-spacing:8px;text-align:center;background:#0e1a2e;border:1px solid #24324d;border-radius:8px;padding:10px;margin:8px 0;color:#7ff3ff;font-variant-numeric:tabular-nums}",
      ".keypad-display.bad{border-color:#e74c3c;color:#ff8a7a}",
      ".wire-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}",
      ".wire-btn{display:block;width:100%;padding:12px;border-radius:8px;border:1px solid #24324d;background:#1a2540;color:#e8eefc;cursor:pointer;font:inherit;text-align:left;margin-bottom:6px}",
      ".wire-btn.sel{border-color:#00e5ff;background:#16414f}",
      ".wire-btn.done{border-color:#2ecc71;background:#0f2e1a;color:#8ff5b0}",
      ".wire-btn.bad{border-color:#e74c3c;background:#3d0f0f;animation:diagPulseRed 0.8s infinite}",
      ".dial-wrap{display:flex;align-items:center;gap:16px;margin:10px 0}",
      ".dial{width:110px;height:110px;border-radius:50%;border:3px solid #24324d;background:radial-gradient(circle at 35% 30%,#1a2540,#0e1a2e);position:relative;flex:0 0 auto;cursor:grab}",
      ".dial-pointer{position:absolute;left:50%;top:50%;width:4px;height:46px;background:#00e5ff;border-radius:2px;transform-origin:50% 0}",
      ".dial-val{font-size:26px;font-weight:800;color:#7ff3ff}",
      ".arm-row{display:flex;align-items:center;gap:10px;margin:8px 0}",
      ".arm-row label{flex:0 0 90px;font-size:13px;color:#9fb3c8}",
      ".arm-row input[type=range]{flex:1}",
      ".arm-val{flex:0 0 64px;text-align:right;font-weight:700;color:#7ff3ff}",
      ".quiz-opt{display:block;width:100%;padding:12px;border-radius:8px;border:1px solid #24324d;background:#1a2540;color:#e8eefc;cursor:pointer;font:inherit;text-align:left;margin-bottom:8px}",
      ".quiz-opt.bad{border-color:#e74c3c;background:#3d0f0f}",
      ".mech-code{font-size:15px;color:#7ff3ff;background:#0e1a2e;border:1px solid #24324d;border-radius:8px;padding:10px;margin:8px 0;text-align:center}",
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
  // ---- Diagnostico de la causa (v13) ----
  // Antes de reparar hay que PENSAR: que causo la falla? Las 3 opciones
  // son plausibles para ese modulo; la correcta se deduce de los valores
  // en vivo de la NASA (liveCache) que se muestran en la seccion de
  // "Valores en vivo". Si el jugador se equivoca, se le dice que revise
  // los valores y puede reintentarlo. Sin diagnostico no hay reparacion.
  // v16: calibracion (slider) — cada modulo tiene un parametro real
  // que hay que ajustar a su zona verde. No es un clic: hay que MOVER
  // el slider y aplicar. Valores de la ISS real (orden de magnitud).
  var CALIBRATE = {
    energy:     { param: "Tensión del bus", unit: "V", min: 0, max: 50, lo: 27, hi: 29 },
    eclss:      { param: "Presión de O2", unit: "kPa", min: 0, max: 200, lo: 98, hi: 104 },
    thermal:    { param: "Flujo de refrigerante", unit: "%", min: 0, max: 100, lo: 45, hi: 55 },
    comms:      { param: "Potencia de transmisión", unit: "W", min: 0, max: 40, lo: 18, hi: 22 },
    command:    { param: "Carga del procesador", unit: "%", min: 0, max: 100, lo: 30, hi: 60 },
    navigation: { param: "Precisión de posición", unit: "m", min: 0, max: 100, lo: 0, hi: 10 },
    robotics:   { param: "Par del brazo", unit: "N·m", min: 0, max: 200, lo: 80, hi: 120 },
    "robotics-eva": { param: "Presión del traje", unit: "kPa", min: 0, max: 60, lo: 28, hi: 32 },
    structure:  { param: "Tensión estructural", unit: "%", min: 0, max: 100, lo: 40, hi: 60 },
    fire:       { param: "Concentración de O2", unit: "%", min: 0, max: 40, lo: 19, hi: 23 },
    radiation:  { param: "Dosis acumulada", unit: "mSv/día", min: 0, max: 10, lo: 0, hi: 1 },
    health:     { param: "Frecuencia cardíaca", unit: "lpm", min: 0, max: 180, lo: 60, hi: 100 },
    habitability: { param: "Humedad de la cabina", unit: "%", min: 0, max: 100, lo: 40, hi: 60 },
    food:       { param: "Temperatura del cultivo", unit: "°C", min: 0, max: 40, lo: 20, hi: 25 },
    science:    { param: "Enfoque del instrumento", unit: "%", min: 0, max: 100, lo: 90, hi: 100 },
    propulsion: { param: "Presión del tanque", unit: "bar", min: 0, max: 300, lo: 180, hi: 220 }
  };
  // v16: secuencia (orden correcto) — el ultimo paso de una falla critica
  // es ordenar 3 acciones en su orden logico. Si te equivocas, se reinicia.
  var SEQUENCE = {
    energy:     ["Aislar el circuito", "Reiniciar el inversor", "Verificar la tensión"],
    eclss:      ["Cerrar la válvula", "Purgar la línea", "Restablecer el flujo"],
    thermal:    ["Cerrar el bypass", "Reiniciar la bomba", "Verificar la temperatura"],
    comms:      ["Cambiar de banda", "Realinear la antena", "Verificar la señal"],
    command:    ["Reiniciar el módulo", "Sincronizar el reloj", "Verificar los datos"],
    navigation: ["Recalibrar el GPS", "Actualizar la efeméride", "Verificar la posición"],
    robotics:   ["Frenar el brazo", "Recalibrar los ejes", "Verificar el par"],
    "robotics-eva": ["Cerrar la escotilla", "Presurizar el traje", "Verificar el sello"],
    structure:  ["Asegurar el panel", "Apretar los pernos", "Verificar la tensión"],
    fire:       ["Cerrar la compuerta", "Activar el extintor", "Ventilar la zona"],
    radiation:  ["Cerrar el escudo", "Verificar el dosímetro", "Registrar la dosis"],
    health:     ["Estabilizar al tripulante", "Revisar los signos", "Registrar el parte"],
    habitability: ["Ajustar la ventilación", "Verificar la humedad", "Registrar el ambiente"],
    food:       ["Ajustar el riego", "Verificar la temperatura", "Registrar el cultivo"],
    science:    ["Recalibrar el instrumento", "Enfocar de nuevo", "Verificar los datos"],
    propulsion: ["Cerrar la válvula", "Purgar la línea", "Verificar la presión"]
  };
  var seqOrder = {};     // modulo -> orden barajado de los 3 botones
  var seqProgress = {};  // modulo -> cuantos aciertos seguidos lleva
  var seqWrong = {};     // modulo -> ultimo intento mal (brilla en rojo)
  var calVal = {};       // modulo -> valor actual del slider
  var calBad = {};       // modulo -> ultimo intento fuera de rango
  var holdState = {};    // v18: modulo -> { timer, interval, start } del hold
  var HOLD_MS = 2000;    // v18: hay que mantener presionado 2 s para cargar
  // v19: estado de las mecanicas nuevas (se limpia al volver a ok).
  var keypadInput = {};  // modulo -> digitos tecleados ("")
  var keypadBad = {};    // modulo -> ultimo codigo mal introducido
  var keypadCode = {};   // v19.3: modulo -> codigo aleatorio de 4 digitos del intento actual
  var dialTarget = {};   // v19.3: modulo -> objetivo aleatorio del potenciometro 1
  var dialTarget2 = {};  // v19.3: modulo -> objetivo aleatorio del potenciometro 2
  var dialVal2 = {};     // v19.3: modulo -> valor actual del potenciometro 2
  var armVal = {};       // modulo -> [angulo hombro, angulo codo]
  var dialVal = {};      // modulo -> valor actual del potenciometro
  var wireSel = {};      // modulo -> fuente seleccionada (o null)
  var wireDone = {};     // modulo -> { "fuente": true } pares conectados
  var wireBad = {};      // modulo -> ultimo par mal conectado
  var wireOrder = {};    // modulo -> orden barajado de los destinos
  var quizWrong = {};    // modulo -> opcion mal elegida

  var DIAGNOSE = {
    "energy": { options: ["Eyección de masa coronal (CME)", "Llamarada solar", "Fallo del inversor"], cause: function (d) { return (d && d.cme_speed != null && d.cme_speed > 300) ? 0 : 2; } },
    "radiation": { options: ["Tormenta geomagnética (Kp alto)", "Llamarada solar", "Fallo del dosímetro"], cause: function (d) { if (d && d.kp != null && d.kp >= 5) return 0; if (d && d.flare && /^[MX]/.test(String(d.flare))) return 1; return 2; } },
    "comms": { options: ["Llamarada solar", "Tormenta geomagnética", "Fallo de la antena"], cause: function (d) { if (d && d.flare && /^[MX]/.test(String(d.flare))) return 0; if (d && d.kp != null && d.kp >= 5) return 1; return 2; } },
    "navigation": { options: ["Asteroide cercano / debris", "Tormenta solar", "Fallo del giroscopio"], cause: function (d) { if (d && d.neo_count != null && d.neo_count > 0) return 0; if (d && d.kp != null && d.kp >= 5) return 1; return 2; } },
    "thermal": { options: ["Viento solar alto", "Fallo de la bomba de refrigerante", "Llamarada solar"], cause: function (d) { return (d && d.solar_wind != null && d.solar_wind > 400) ? 0 : 1; } },
    "eclss": { options: ["Tormenta geomagnética", "Fuga de aire", "Fallo del filtro de CO2"], cause: function (d) { return (d && d.kp != null && d.kp >= 5) ? 0 : 1; } },
    "command": { options: ["Tormenta geomagnética", "Fallo del controlador", "Pérdida de enlace DSN"], cause: function (d) { if (d && d.kp != null && d.kp >= 5) return 0; if (d && d.dsn_stations != null && d.dsn_stations === 0) return 2; return 1; } },
    "robotics": { options: ["Asteroide cercano / debris", "Fallo del controlador", "Tormenta solar"], cause: function (d) { if (d && d.neo_count != null && d.neo_count > 0) return 0; if (d && d.kp != null && d.kp >= 5) return 2; return 1; } },
    "robotics-eva": { options: ["Tormenta geomagnética (radiación)", "Fallo del traje EVA", "Fuga de aire"], cause: function (d) { return (d && d.kp != null && d.kp >= 5) ? 0 : 1; } },
    "structure": { options: ["Asteroide cercano / debris", "Micrometeorito", "Fallo estructural"], cause: function (d) { return (d && d.neo_count != null && d.neo_count > 0) ? 0 : 1; } },
    "science": { options: ["Tormenta solar", "Fallo del experimento", "Pérdida de enlace"], cause: function (d) { if (d && (d.kp != null && d.kp >= 5)) return 0; if (d && d.flare && /^[MX]/.test(String(d.flare))) return 0; return 1; } },
    "propulsion": { options: ["Asteroide cercano / debris", "Fuga de propelente", "Fallo de la válvula"], cause: function (d) { return (d && d.neo_count != null && d.neo_count > 0) ? 0 : 1; } },
    "fire": { options: ["Cortocircuito eléctrico", "Tormenta solar (CME)", "Fallo del detector"], cause: function (d) { return (d && d.cme_speed != null && d.cme_speed > 300) ? 1 : 0; } },
    "health": { options: ["Tormenta geomagnética (radiación)", "Fallo del ECLSS", "Estrés de la tripulación"], cause: function (d) { return (d && d.kp != null && d.kp >= 5) ? 0 : 1; } },
    "habitability": { options: ["Fuga de aire", "Tormenta geomagnética", "Fallo del sistema de agua"], cause: function (d) { return (d && d.kp != null && d.kp >= 5) ? 1 : 0; } },
    "food": { options: ["Tormenta solar (radiación)", "Fallo de iluminación LED", "Falta de agua/nutrientes"], cause: function (d) { if (d && d.kp != null && d.kp >= 5) return 0; if (d && d.flare && /^[MX]/.test(String(d.flare))) return 0; return 1; } }
  };
  var DIAG_GENERIC = { options: ["Evento de clima espacial", "Fallo de hardware", "Error de software"], cause: function () { return 1; } };
  var diagDone = {};
  var diagWrongPick = {};   // modulo -> indice de la opcion mal elegida (brilla en rojo)
  var diagCorrect = {};     // modulo -> el diagnostico fue correcto (brilla en verde)
  var reinforceProgress = {}; // modulo -> {done, busy}
  var reinforced = {};      // modulo -> ya reforzado
  var diagWrong = {};
  function diagnoseFor(id) {
    var d = DIAGNOSE[slugOf(id)] || DIAG_GENERIC;
    var idx = 0;
    try { idx = d.cause(liveCache) || 0; } catch (e) { idx = 0; }
    return { options: d.options, correct: idx };
  }
  // Progreso persistente (sobrevive a los re-renders por cambio de estado):
  // id -> { done: pasos completados, busy: paso en curso (-1 si ninguno) }
  var repairProgress = {};
  var repairIds = [];
  function slugOf(id) { return String(id).replace(/^mod-[a-f]-/, ""); }
  // v19: MECANICAS POR MODULO (reales, no solo clics). Cada modulo tiene
  // su propia mecanica, apegada a como se trabaja de verdad en la ISS:
  // - keypad (teclado numerico): introducir un codigo de autorizacion de
  //   4 digitos, derivado de los valores reales de la NASA (el codigo se
  //   muestra en el monitor en facil/medio; en dificil hay que deducirlo
  //   de los valores en vivo). Como el codigo de mando de la ISS.
  // - arm (brazo robotico): mover el brazo a una posicion objetivo con
  //   angulos de articulacion (hombro/codo). Como el Canadarm2.
  // - dial (potenciometro): girar un mando circular hasta el valor
  //   objetivo. Como los potenciometros de un panel de control.
  // - wires (conexiones): conectar cada cable a su puerto correcto
  //   (panel de conexiones). Como el cableado de la ISS.
  // - quiz (preguntas): responder una pregunta real sobre el modulo
  //   antes de seguir reparando. Como el entrenamiento de tripulacion.
  var MECHANIC = {
    "energy": "keypad", "eclss": "dial", "thermal": "hold", "comms": "wires",
    "radiation": "quiz", "command": "keypad", "navigation": "dial",
    "robotics": "arm", "robotics-eva": "wires", "structure": "wires",
    "science": "quiz", "propulsion": "dial", "fire": "keypad",
    "health": "quiz", "habitability": "dial", "food": "quiz"
  };
  // Codigo del teclado: aleatorio de 4 digitos por intento (v19.3).
  var KEYPAD = {
    "energy":  { label: "Código de autorización del bus de energía" },
    "command": { label: "Código de mando de la estación" },
    "fire":    { label: "Código de supresión de incendios" }
  };
  // Brazo robotico: articulaciones y objetivo (grados).
  var ARM = {
    "robotics": { joints: [
      { name: "Hombro", min: 0, max: 180, target: 45 },
      { name: "Codo", min: 0, max: 180, target: 90 }
    ]}
  };
  // Potenciometro: parametro, rango y RANGO del objetivo (v19.3: el
  // objetivo es ALEATORIO en cada intento, entre tmin y tmax, para que el
  // potenciometro no pida siempre el mismo angulo/valor).
  var DIAL = {
    "eclss":        { param: "Flujo de O2", unit: "L/min", min: 0, max: 10, tmin: 5, tmax: 9 },
    "navigation":   { param: "Calibración del giroscopio", unit: "°", min: 0, max: 360, tmin: 30, tmax: 330 },
    "propulsion":   { param: "Válvula de combustible", unit: "%", min: 0, max: 100, tmin: 40, tmax: 80 },
    "habitability": { param: "Presión de cabina", unit: "kPa", min: 0, max: 120, tmin: 95, tmax: 108 }
  };
  // v19.3: SEGUNDO potenciometro (medio/dificil) — mas diversion, dos
  // mandos que ajustar en el mismo paso.
  var DIAL2 = {
    "eclss":        { param: "Depurador de CO2", unit: "%", min: 0, max: 100, tmin: 40, tmax: 70 },
    "navigation":   { param: "Altímetro orbital", unit: "km", min: 300, max: 500, tmin: 380, tmax: 450 },
    "propulsion":   { param: "Empuje del motor", unit: "%", min: 0, max: 100, tmin: 50, tmax: 90 },
    "habitability": { param: "Temperatura de cabina", unit: "°C", min: 10, max: 30, tmin: 18, tmax: 24 }
  };
  // Objetivos aleatorios por intento (se fijan al abrir el paso).
  function dialTargetFor(slug, id) {
    if (id && dialTarget[id] !== undefined) return dialTarget[id];
    var dl = DIAL[slug] || DIAL.eclss;
    var v = dl.tmin + Math.floor(Math.random() * (dl.tmax - dl.tmin + 1));
    if (id) dialTarget[id] = v;
    return v;
  }
  function dialTarget2For(slug, id) {
    if (id && dialTarget2[id] !== undefined) return dialTarget2[id];
    var dl = DIAL2[slug] || DIAL2.eclss;
    var v = dl.tmin + Math.floor(Math.random() * (dl.tmax - dl.tmin + 1));
    if (id) dialTarget2[id] = v;
    return v;
  }
  // Conexiones: pares fuente -> destino (se barajan al mostrar).
  var WIRES = {
    "comms":       [["Antena A", "Transceptor 1"], ["Antena B", "Transceptor 2"], ["Antena C", "Transceptor 3"], ["Antena D", "Transceptor 4"]],
    "robotics-eva":[["Traje EVA", "Umbilical 1"], ["Casco", "Umbilical 2"], ["Mochila PLSS", "Umbilical 3"]],
    "structure":   [["Sensor A", "Bus de datos 1"], ["Sensor B", "Bus de datos 2"], ["Sensor C", "Bus de datos 3"]]
  };
  // Preguntas reales sobre el modulo (entrenamiento de tripulacion).
  var QUIZ = {
    "radiation": { q: "¿Qué protege mejor a la tripulación de una tormenta solar?",
      options: ["El blindaje de la estación y refugiarse en el módulo más protegido", "Abrir las ventanas para verla mejor", "Apagar todas las luces"], correct: 0 },
    "science":   { q: "¿Por qué los experimentos en microgravedad son valiosos?",
      options: ["Porque en microgravedad los fluidos y las llamas se comportan distinto y se aprende física nueva", "Porque pesan menos y caben más", "Porque no necesitan electricidad"], correct: 0 },
    "health":    { q: "¿Qué deben hacer los astronautas a diario para no perder masa muscular?",
      options: ["Ejercicio resistido unas 2 horas al día", "Dormir 12 horas", "No comer"], correct: 0 },
    "food":      { q: "¿Qué necesitan las plantas del invernadero Veggie para crecer en la ISS?",
      options: ["Luz LED, agua y nutrientes (sin suelo)", "Solo oscuridad", "Tierra de la Luna"], correct: 0 }
  };
  // v18: el juego CAMBIA segun la dificultad (lo pidio Darian: facil para
  // ninos, medio amigable y no tan complicado, dificil tecnico).
  // La dificultad la guarda el menu en localStorage (xonidu-difficulty-v1).
  function getDifficulty() {
    try {
      var d = localStorage.getItem("xonidu-difficulty-v1");
      if (d === "facil" || d === "medio" || d === "dificil") return d;
    } catch (e) {}
    return "medio";
  }
  // Pasos de reparacion por dificultad (kind: slider/click/hold/sequence).
  // Facil (ninos): 2 pasos, sin diagnostico, sin penalizacion, sin
  // secuencia; el slider tiene la zona verde MAS ANCHA. Medio (amigable):
  // 3 pasos, diagnostico SIN penalizacion, sin secuencia. Dificil
  // (tecnico): todo — diagnostico con -10, slider, hold y secuencia en crit.
  // v19.3: el codigo del teclado es ALEATORIO de 4 digitos en cada
  // intento de reparacion. Antes salia de un valor en vivo (CME/Kp/
  // viento solar) y casi siempre era el mismo (0303), asi que el jugador
  // lo memorizaba. Ahora se genera al abrir la reparacion y se guarda en
  // keypadCode[id] hasta que el modulo vuelve a ok.
  // Facil/medio: el codigo se muestra en el monitor (solo hay que
  // teclearlo). Dificil: hay que buscarlo en "Valores en vivo" (abajo),
  // donde aparece como "Codigo de autorizacion" en la telemetria.
  function keypadCodeFor(slug, id) {
    if (id && keypadCode[id]) return keypadCode[id];
    var code = String(1000 + Math.floor(Math.random() * 9000));
    if (id) keypadCode[id] = code;
    return code;
  }
  function stepsFor(id) {
    var base = REPAIR_STEPS[slugOf(id)] || REPAIR_GENERIC;
    var diff = getDifficulty();
    var st = getStatus(id);
    var mech = MECHANIC[slugOf(id)] || "click";
    var mechStep = { kind: mech, text: base[1] || base[0] || "Reparar" };
    var steps = [];
    if (diff === "facil") {
      // v19: 2 pasos — ajustar + la mecanica del modulo (simplificada).
      steps = [
        { kind: "slider", text: base[0] || "Ajustar" },
        mechStep,
      ];
    } else if (diff === "medio") {
      steps = [
        { kind: "slider", text: base[0] || "Ajustar" },
        mechStep,
        { kind: "click", text: base[2] || base[1] || "Verificar" },
      ];
    } else {
      steps = [
        { kind: "slider", text: base[0] || "Ajustar" },
        mechStep,
        { kind: "click", text: base[2] || base[1] || "Verificar" },
      ];
      if (st === "crit") steps.push({ kind: "sequence", text: REPAIR_CRIT_EXTRA });
    }
    return steps;
  }
  // Zona verde del slider por dificultad (facil = mas ancha, mas facil).
  function calRangeFor(slug) {
    var cal = CALIBRATE[slug] || CALIBRATE.energy;
    if (getDifficulty() !== "facil") return cal;
    var span = cal.hi - cal.lo;
    var lo = Math.max(cal.min, Math.round(cal.lo - span * 0.5));
    var hi = Math.min(cal.max, Math.round(cal.hi + span * 0.5));
    return { param: cal.param, unit: cal.unit, min: cal.min, max: cal.max, lo: lo, hi: hi };
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
        // v16: el slider (Ajustar) dispara "input" al arrastrar.
        box.addEventListener("input", function (e) {
          var sl = e.target && e.target.closest ? e.target.closest(".cal-slider") : null;
          if (!sl) {
            // v19: sliders del brazo robotico (articulaciones).
            var as = e.target && e.target.closest ? e.target.closest(".arm-slider") : null;
            if (!as) return;
            var amod = as.getAttribute("data-mod");
            var aji = parseInt(as.getAttribute("data-joint"), 10);
            if (!armVal[amod]) armVal[amod] = [90, 90];
            armVal[amod][aji] = parseInt(as.value, 10);
            var albl = document.getElementById("armVal-" + amod + "-" + aji);
            if (albl) albl.textContent = String(armVal[amod][aji]) + "°";
            return;
          }
          var smod = sl.getAttribute("data-mod");
          calVal[smod] = parseInt(sl.value, 10);
          var lbl = document.getElementById("calVal-" + smod);
          if (lbl) lbl.textContent = String(calVal[smod]);
        });
        // v18: MANTENER — mousedown/touchstart empieza la carga (2 s),
        // mouseup/touchend/mouseleave la cancela. Sin esto no hay hold.
        function holdStart(e) {
          var hb = e.target && e.target.closest ? e.target.closest(".hold-btn") : null;
          if (!hb || hb.disabled) return;
          var hmod = hb.getAttribute("data-mod");
          var hstep = parseInt(hb.getAttribute("data-step"), 10);
          var hp = repairProgress[hmod];
          if (!hp || hstep !== hp.done || hp.busy !== -1) return;
          if (holdState[hmod] && holdState[hmod].timer) return;
          hb.classList.add("holding");
          var fill = document.getElementById("holdFill-" + hmod);
          var started = Date.now();
          var iv = setInterval(function () {
            var pct = Math.min(100, Math.round(((Date.now() - started) / HOLD_MS) * 100));
            if (fill) fill.style.width = pct + "%";
          }, 50);
          var tm = setTimeout(function () {
            clearInterval(iv);
            delete holdState[hmod];
            var p2 = repairProgress[hmod];
            if (!p2) return;
            p2.done += 1;
            p2.busy = -1;
            var steps = stepsFor(hmod);
            if (p2.done >= steps.length) {
              delete repairProgress[hmod];
              try { if (window.stationStore) stationStore.setModuleStatus(hmod, "ok"); } catch (err) {}
            }
            repairSection(repairIds);
          }, HOLD_MS);
          holdState[hmod] = { timer: tm, interval: iv, start: started };
        }
        function holdCancel(e) {
          var hb = e.target && e.target.closest ? e.target.closest(".hold-btn") : null;
          if (!hb) return;
          var hmod = hb.getAttribute("data-mod");
          var hs = holdState[hmod];
          if (!hs) return;
          clearTimeout(hs.timer);
          clearInterval(hs.interval);
          delete holdState[hmod];
          hb.classList.remove("holding");
          var fill = document.getElementById("holdFill-" + hmod);
          if (fill) fill.style.width = "0%";
        }
        box.addEventListener("mousedown", holdStart);
        box.addEventListener("touchstart", holdStart, { passive: true });
        box.addEventListener("mouseup", holdCancel);
        box.addEventListener("mouseleave", holdCancel);
        box.addEventListener("touchend", holdCancel);
        box.addEventListener("touchcancel", holdCancel);

        // v20: POTENCIOMETRO — girar el mando con el mouse o el dedo (arrastrar).
        var dialDragging = null;
        function dialStart(e) {
          var dial = e.target && e.target.closest ? e.target.closest(".dial") : null;
          if (!dial) return;
          var id = dial.getAttribute("data-mod");
          var step = dial.getAttribute("data-step");
          var ap = repairProgress[id];
          if (!ap || parseInt(step, 10) !== ap.done || ap.busy !== -1) return;
          e.preventDefault();
          e.stopPropagation();
          var wrap = dial.closest(".dial-wrap");
          var valEl = wrap ? wrap.querySelector(".dial-val") : null;
          var is2 = valEl && valEl.id && valEl.id.indexOf("dialVal2-") === 0;
          var n = is2 ? "2" : "1";
          var dl = (n === "2") ? (DIAL2[slugOf(id)] || DIAL2.eclss) : (DIAL[slugOf(id)] || DIAL.eclss);
          var store = (n === "2") ? dialVal2 : dialVal;
          var cur = (store[id] !== undefined) ? store[id] : Math.round((dl.min + dl.max) / 2);
          var rect = dial.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          var px = (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;
          var py = (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;
          var startAng = Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI;
          if (startAng > 180) startAng -= 360;
          if (startAng < -180) startAng += 360;
          dialDragging = { id: id, n: n, dl: dl, dial: dial, startAngle: startAng, startValue: cur };
        }
        box.addEventListener("mousedown", dialStart);
        box.addEventListener("touchstart", dialStart, { passive: false });
        function dialMove(e) {
          if (!dialDragging) return;
          e.preventDefault();
          var px = (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;
          var py = (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;
          var rect = dialDragging.dial.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          var ang = Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI;
          if (ang > 180) ang -= 360;
          if (ang < -180) ang += 360;
          var delta = ang - dialDragging.startAngle;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          var dl = dialDragging.dl;
          var span = dl.max - dl.min;
          var val = dialDragging.startValue + Math.round((delta / 270) * span);
          val = Math.max(dl.min, Math.min(dl.max, val));
          var store = (dialDragging.n === "2") ? dialVal2 : dialVal;
          store[dialDragging.id] = val;
          var a2 = -135 + ((val - dl.min) / Math.max(1, span)) * 270;
          var ptr = dialDragging.dial.querySelector(".dial-pointer");
          if (ptr) ptr.style.transform = "rotate(" + a2 + "deg)";
          var vid = (dialDragging.n === "2") ? ("dialVal2-" + esc(dialDragging.id)) : ("dialVal-" + esc(dialDragging.id));
          var ve = document.getElementById(vid);
          if (ve) ve.textContent = String(val) + " " + esc(dl.unit);
        }
        function dialEnd() {
          dialDragging = null;
        }
        document.addEventListener("mousemove", dialMove);
        document.addEventListener("touchmove", dialMove, { passive: false });
        document.addEventListener("mouseup", dialEnd);
        document.addEventListener("touchend", dialEnd);
        document.addEventListener("touchcancel", dialEnd);
        box.addEventListener("click", function (e) {
          // v19: TECLADO NUMERICO — teclear el codigo de 4 digitos.
          var kb = e.target && e.target.closest ? e.target.closest(".keypad-btn[data-key]") : null;
          if (kb && !kb.disabled) {
            var kmod = kb.getAttribute("data-mod");
            var kstep = parseInt(kb.getAttribute("data-step"), 10);
            var kp = repairProgress[kmod];
            if (!kp || kstep !== kp.done || kp.busy !== -1) return;
            var key = kb.getAttribute("data-key");
            var cur = keypadInput[kmod] || "";
            if (key === "C") { keypadInput[kmod] = ""; delete keypadBad[kmod]; }
            else if (key === "↵") {
              var code = keypadCodeFor(slugOf(kmod), kmod);
              if (cur === code) {
                delete keypadInput[kmod]; delete keypadBad[kmod];
                kp.done += 1; kp.busy = -1;
                var ks = stepsFor(kmod);
                if (kp.done >= ks.length) {
                  delete repairProgress[kmod];
                  try { if (window.stationStore) stationStore.setModuleStatus(kmod, "ok"); } catch (err) {}
                }
              } else {
                keypadBad[kmod] = true; keypadInput[kmod] = "";
              }
            } else if (cur.length < 4) { keypadInput[kmod] = cur + key; }
            repairSection(repairIds);
            return;
          }
          // v19: POTENCIOMETRO — botones + / -.
          var db = e.target && e.target.closest ? e.target.closest(".keypad-btn[data-dial]") : null;
          if (db && !db.disabled) {
            var dmod = db.getAttribute("data-mod");
            var dnum = db.getAttribute("data-dial-n") || "1";
            var dl = (dnum === "2") ? (DIAL2[slugOf(dmod)] || DIAL2.eclss) : (DIAL[slugOf(dmod)] || DIAL.eclss);
            var dstore = (dnum === "2") ? dialVal2 : dialVal;
            var dv = (dstore[dmod] !== undefined) ? dstore[dmod] : Math.round((dl.min + dl.max) / 2);
            dv = Math.max(dl.min, Math.min(dl.max, dv + parseInt(db.getAttribute("data-dial"), 10)));
            dstore[dmod] = dv;
            repairSection(repairIds);
            return;
          }
          // v19: POTENCIOMETRO — Aplicar valor.
          var da = e.target && e.target.closest ? e.target.closest("[data-dial-apply]") : null;
          if (da && !da.disabled) {
            var amod = da.getAttribute("data-mod");
            var astep = parseInt(da.getAttribute("data-step"), 10);
            var ap = repairProgress[amod];
            if (!ap || astep !== ap.done || ap.busy !== -1) return;
            var adl = DIAL[slugOf(amod)] || DIAL.eclss;
            var adiff = getDifficulty();
            var atol = adiff === "facil" ? 2 : (adiff === "medio" ? 1 : 0);
            var av = (dialVal[amod] !== undefined) ? dialVal[amod] : Math.round((adl.min + adl.max) / 2);
            if (Math.abs(av - dialTargetFor(slugOf(amod), amod)) > atol) { repairSection(repairIds); return; }
            // v19.3: medio/dificil tienen SEGUNDO potenciometro: tambien
            // hay que dejarlo en su objetivo.
            if (adiff !== "facil") {
              var adl2 = DIAL2[slugOf(amod)] || DIAL2.eclss;
              var av2 = (dialVal2[amod] !== undefined) ? dialVal2[amod] : Math.round((adl2.min + adl2.max) / 2);
              if (Math.abs(av2 - dialTarget2For(slugOf(amod), amod)) > atol) { repairSection(repairIds); return; }
            }
            ap.done += 1; ap.busy = -1;
            var as = stepsFor(amod);
            if (ap.done >= as.length) {
              delete repairProgress[amod];
              try { if (window.stationStore) stationStore.setModuleStatus(amod, "ok"); } catch (err) {}
            }
            repairSection(repairIds);
            return;
          }
          // v19: BRAZO ROBOTICO — Aplicar posicion.
          var ab = e.target && e.target.closest ? e.target.closest("[data-arm]") : null;
          if (ab && !ab.disabled) {
            var bmod = ab.getAttribute("data-mod");
            var bstep = parseInt(ab.getAttribute("data-step"), 10);
            var bp = repairProgress[bmod];
            if (!bp || bstep !== bp.done || bp.busy !== -1) return;
            var barm = ARM[slugOf(bmod)] || ARM.robotics;
            var bdiff = getDifficulty();
            var btol = bdiff === "facil" ? 10 : (bdiff === "medio" ? 5 : 2);
            var bvals = armVal[bmod] || barm.joints.map(function (j) { return Math.round((j.min + j.max) / 2); });
            var bjoints = (bdiff === "facil" || bdiff === "medio") ? barm.joints.slice(0, 1) : barm.joints;
            var bok = bjoints.every(function (j, ji) { return Math.abs(bvals[ji] - j.target) <= btol; });
            if (!bok) { repairSection(repairIds); return; }
            bp.done += 1; bp.busy = -1;
            var bs = stepsFor(bmod);
            if (bp.done >= bs.length) {
              delete repairProgress[bmod];
              try { if (window.stationStore) stationStore.setModuleStatus(bmod, "ok"); } catch (err) {}
            }
            repairSection(repairIds);
            return;
          }
          // v19: CONEXIONES — elegir un cable (fuente).
          var ws = e.target && e.target.closest ? e.target.closest("[data-wire-src]") : null;
          if (ws && !ws.disabled) {
            var wmod = ws.getAttribute("data-mod");
            var src = ws.getAttribute("data-wire-src");
            if ((wireDone[wmod] || {})[src]) return;
            wireSel[wmod] = (wireSel[wmod] === src) ? null : src;
            repairSection(repairIds);
            return;
          }
          // v19: CONEXIONES — conectar al puerto (destino).
          var wd = e.target && e.target.closest ? e.target.closest("[data-wire-dst]") : null;
          if (wd && !wd.disabled) {
            var dmod2 = wd.getAttribute("data-mod");
            var dst = wd.getAttribute("data-wire-dst");
            var sel2 = wireSel[dmod2];
            if (!sel2) return;
            var wp = WIRES[slugOf(dmod2)] || WIRES.comms;
            var pair = wp.filter(function (pp) { return pp[0] === sel2; })[0];
            if (pair && pair[1] === dst) {
              if (!wireDone[dmod2]) wireDone[dmod2] = {};
              wireDone[dmod2][sel2] = true;
              delete wireBad[dmod2];
              wireSel[dmod2] = null;
              var wdiff2 = getDifficulty();
              var npairs = wdiff2 === "facil" ? 2 : (wdiff2 === "medio" ? 3 : wp.length);
              var allDone = wp.slice(0, npairs).every(function (pp) { return (wireDone[dmod2] || {})[pp[0]]; });
              if (allDone) {
                var wprog = repairProgress[dmod2];
                // El paso de conexiones es el paso actual (done).
                var wsteps = stepsFor(dmod2);
                var widx = wsteps.findIndex(function (s) { return s.kind === "wires"; });
                if (wprog && widx >= 0 && wprog.done === widx) {
                  wprog.done += 1; wprog.busy = -1;
                  if (wprog.done >= wsteps.length) {
                    delete repairProgress[dmod2];
                    try { if (window.stationStore) stationStore.setModuleStatus(dmod2, "ok"); } catch (err) {}
                  }
                }
              }
            } else {
              wireBad[dmod2] = dst;
              wireSel[dmod2] = null;
            }
            repairSection(repairIds);
            return;
          }
          // v19: PREGUNTAS — responder.
          var qq = e.target && e.target.closest ? e.target.closest(".quiz-opt") : null;
          if (qq && !qq.disabled) {
            var qmod = qq.getAttribute("data-mod");
            var qstep = parseInt(qq.getAttribute("data-step"), 10);
            var qprog = repairProgress[qmod];
            if (!qprog || qstep !== qprog.done || qprog.busy !== -1) return;
            var qz = QUIZ[slugOf(qmod)] || QUIZ.radiation;
            var pick = parseInt(qq.getAttribute("data-quiz"), 10);
            if (pick === qz.correct) {
              delete quizWrong[qmod];
              qprog.done += 1; qprog.busy = -1;
              var qs = stepsFor(qmod);
              if (qprog.done >= qs.length) {
                delete repairProgress[qmod];
                try { if (window.stationStore) stationStore.setModuleStatus(qmod, "ok"); } catch (err) {}
              }
            } else {
              quizWrong[qmod] = pick;
            }
            repairSection(repairIds);
            return;
          }
          var dg = e.target && e.target.closest ? e.target.closest(".diag-opt") : null;
          if (dg) {
            var modId = dg.getAttribute("data-mod");
            var pick = parseInt(dg.getAttribute("data-idx"), 10);
            var d = diagnoseFor(modId);
            if (pick === d.correct) {
              diagDone[modId] = true;
              diagCorrect[modId] = true;
              delete diagWrong[modId];
              delete diagWrongPick[modId];
            } else {
              diagWrong[modId] = true;
              diagWrongPick[modId] = pick;
              // v15/v18: la opcion mal elegida brilla en rojo. Solo en
              // DIFICIL baja puntos (-10); en medio es amigable (sin
              // penalizacion) y en facil ni hay diagnostico.
              if (getDifficulty() === "dificil") {
                try { if (window.stationStore && stationStore.addPenalty) stationStore.addPenalty(10); } catch (err) {}
              }
            }
            repairSection(repairIds);
            return;
          }
          var rf = e.target && e.target.closest ? e.target.closest(".reinforce-btn") : null;
          if (rf && !rf.disabled) {
            var rmod = rf.getAttribute("data-mod");
            var rstep = parseInt(rf.getAttribute("data-step"), 10);
            var rp = reinforceProgress[rmod];
            if (!rp || rstep !== rp.done || rp.busy !== -1) return;
            rp.busy = rstep;
            repairSection(repairIds);
            setTimeout(function () {
              var p2 = reinforceProgress[rmod];
              if (!p2) return;
              p2.done += 1;
              p2.busy = -1;
              if (p2.done >= 2) {
                delete reinforceProgress[rmod];
                reinforced[rmod] = true;
                try { if (window.stationStore && stationStore.reinforce) stationStore.reinforce(rmod); } catch (err) {}
              }
              repairSection(repairIds);
            }, REPAIR_STEP_MS);
            return;
          }
          // v16: el slider guarda su valor al moverlo (sin completar el paso).
          var sl = e.target && e.target.closest ? e.target.closest(".cal-slider") : null;
          if (sl) {
            var smod = sl.getAttribute("data-mod");
            calVal[smod] = parseInt(sl.value, 10);
            var lbl = document.getElementById("calVal-" + smod);
            if (lbl) lbl.textContent = String(calVal[smod]);
            return;
          }
          // v16: secuencia — pulsar las 3 acciones en su orden logico.
          var sq = e.target && e.target.closest ? e.target.closest(".seq-btn") : null;
          if (sq) {
            var qmod = sq.getAttribute("data-mod");
            var qidx = parseInt(sq.getAttribute("data-seq"), 10);
            var qprog = repairProgress[qmod];
            if (!qprog) return;
            var last = stepsFor(qmod).length - 1;
            if (qprog.done !== last) return;
            var cur = seqProgress[qmod] || 0;
            if (qidx === cur) {
              seqProgress[qmod] = cur + 1;
              delete seqWrong[qmod];
              if (seqProgress[qmod] >= 3) {
                // Secuencia completa: es el ultimo paso, el modulo se repara.
                delete repairProgress[qmod];
                delete seqOrder[qmod];
                delete seqProgress[qmod];
                try { if (window.stationStore) stationStore.setModuleStatus(qmod, "ok"); } catch (err) {}
              }
            } else {
              // Orden incorrecto: se reinicia y el boton brilla en rojo.
              seqProgress[qmod] = 0;
              seqWrong[qmod] = qidx;
            }
            repairSection(repairIds);
            return;
          }
          var b = e.target && e.target.closest ? e.target.closest(".repair-step") : null;
          if (!b || b.disabled) return;
          var modId = b.getAttribute("data-mod");
          var stepIdx = parseInt(b.getAttribute("data-step"), 10);
          var prog = repairProgress[modId];
          if (!prog || stepIdx !== prog.done || prog.busy !== -1) return;
          // v16: el paso 0 es el slider — Aplicar solo si esta en la zona verde.
          // v18: la zona verde es la de calRangeFor (ancha en facil).
          if (b.getAttribute("data-cal")) {
            var cal = calRangeFor(slugOf(modId));
            var v = (calVal[modId] !== undefined) ? calVal[modId] : Math.round((cal.min + cal.max) / 2);
            if (v < cal.lo || v > cal.hi) {
              calBad[modId] = true;
              repairSection(repairIds);
              return;
            }
            delete calBad[modId];
            prog.done += 1;
            repairSection(repairIds);
            return;
          }
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
    // v15: pista de flujo para que el juego sea intuitivo (se ve solo
    // cuando hay algo que atender).
    ids.forEach(function (id) {
      if (getStatus(id) !== "ok") anyFail = true;
    });
    if (anyFail) {
      var _diff = getDifficulty();
      var _hint = _diff === "facil"
        ? '<div class="flow-hint">🧭 <b>Cómo jugar:</b> 1️⃣ Mira el módulo en amarillo o rojo · 2️⃣ <b>Repara</b>: mueve el slider 🎚️ a la zona verde y haz la tarea del módulo (teclear el código 🔢, mover el brazo 🦾, girar el mando 🎛️, conectar los cables 🔌 o responder la pregunta ❓). ¡Tú puedes! Si el módulo solo está en <b>PRE</b> (ámbar), aún no falló: puedes <b>reforzarlo</b> 🛡 para ganar tiempo — y cuando lo refuerces se pondrá <b>azul 🛡 Protegido</b>.</div>'
        : _diff === "medio"
        ? '<div class="flow-hint">🧭 <b>Cómo jugar:</b> 1️⃣ Lee las señales y los valores en vivo · 2️⃣ <b>Diagnostica</b> la causa (si te equivocas, la opción brilla en rojo, pero no pierdes puntos) · 3️⃣ <b>Repara</b>: ajusta el slider 🎚️ a la zona verde y haz la tarea del módulo (código 🔢, brazo 🦾, mando 🎛️, cables 🔌 o pregunta ❓), luego verifica. Si el módulo solo está en <b>PRE</b>, aún no falló: puedes <b>reforzarlo</b> 🛡 para ganar tiempo — y cuando lo refuerces se pondrá <b>azul 🛡 Protegido</b>.</div>'
        : '<div class="flow-hint">🧭 <b>Cómo jugar:</b> 1️⃣ Lee las señales y los valores en vivo · 2️⃣ <b>Diagnostica</b> la causa (si te equivocas, la opción brilla en rojo y pierdes 10 pts) · 3️⃣ <b>Repara</b>: ajusta el slider 🎚️ a la zona verde, haz la tarea del módulo (código 🔢, brazo 🦾, mando 🎛️, cables 🔌 o pregunta ❓), verifica y, si es crítico, ordena la secuencia 🔢. Si el módulo solo está en <b>PRE</b>, aún no falló: puedes <b>reforzarlo</b> 🛡 para ganar tiempo — y cuando lo refuerces se pondrá <b>azul 🛡 Protegido</b>.</div>';
      html += _hint;
    }
    ids.forEach(function (id) {
      var st = getStatus(id);
      var info = (window.XONIDU_MODULE_INFO || {})[id];
      var name = info ? info.name : id;
      if (st === "ok") { delete repairProgress[id]; delete diagDone[id]; delete diagWrong[id]; delete diagWrongPick[id]; delete diagCorrect[id]; delete reinforceProgress[id]; delete reinforced[id]; delete seqOrder[id]; delete seqProgress[id]; delete seqWrong[id]; delete calVal[id]; delete calBad[id]; delete holdState[id]; delete keypadInput[id]; delete keypadBad[id]; delete keypadCode[id]; delete armVal[id]; delete dialVal[id]; delete dialVal2[id]; delete dialTarget[id]; delete dialTarget2[id]; delete wireSel[id]; delete wireDone[id]; delete wireBad[id]; delete wireOrder[id]; delete quizWrong[id]; return; }
      // v15: senal temprana (PRE) — la falla se ve venir, aun no ocurrio.
      if (st === "pre") {
        var isShielded = reinforced[id] || (window.stationStore && stationStore.isReinforced && stationStore.isReinforced(id));
        html += '<div class="mod-sec mod-repair ' + (isShielded ? "shielded" : "pre") + '"><h2>' + (isShielded ? "🛡 Protegido — " : "⚠ Señal temprana — ") + esc(name) + helpHTML("repair", id) + helpHTML("module", id) + '</h2>'
          + '<div class="pre-box">' + preSignalFor(id) + '</div>'
          + (isShielded
              ? '<p><b>🛡 Reforzado ✓ — PROTEGIDO</b> — el módulo ya está reforzado: si falla, tendrás el <b>doble de tiempo</b> para atenderlo antes de que pase a crítico. Ya no hace falta reforzar más.</p>'
              : (function () {
                  var rp = reinforceProgress[id] || (reinforceProgress[id] = { done: 0, busy: -1 });
                  var steps = ["Cerrar válvulas de aislamiento", "Activar escudos y redundancia"];
                  return '<p><b>🛡 Reforzar</b> (2 pasos, ~2 s): prepárate para la falla antes de que llegue.</p>'
                    + steps.map(function (s, i) {
                        var dis = (i !== rp.done || rp.busy !== -1) ? " disabled" : "";
                        var lbl = (rp.busy === i) ? "⏳ " : (i < rp.done ? "✓ " : (i + 1) + ". ");
                        return '<button type="button" class="reinforce-btn" data-mod="' + esc(id) + '" data-step="' + i + '"' + dis + '>' + lbl + esc(s) + "</button>";
                      }).join("");
                })())
          + "</div>";
        return;
      }
      // v18: en FACIL no hay diagnostico (es para ninos: se va directo a
      // reparar). En medio y dificil si hay que pensar la causa.
      if (getDifficulty() === "facil") diagDone[id] = true;
      if (!diagDone[id]) {
        var dg = diagnoseFor(id);
        html += '<div class="mod-sec mod-repair ' + st + '"><h2>🔍 Diagnóstico — ' + esc(name) + helpHTML("repair", id) + helpHTML("module", id) + '</h2>'
          + '<p>Estado: <span class="mod-state ' + st + '">' + LABEL[st] + '</span> — antes de reparar hay que <b>pensar</b>: ¿qué causó esta falla? Lee los <b>valores en vivo</b> de la NASA (abajo) y elige. Sin el diagnóstico correcto no se desbloquea la reparación.</p>'
          + (diagWrong[id] ? (getDifficulty() === "dificil"
              ? '<p class="diag-wrong">❌ Esa no es la causa — <b>−10 pts</b>. Revisa los valores en vivo (CME, Kp, llamarada, DSN, NeoWs) e inténtalo de nuevo.</p>'
              : '<p class="diag-wrong">❌ Esa no es la causa — revisa los valores en vivo (CME, Kp, llamarada, DSN, NeoWs) e inténtalo de nuevo.</p>') : "")
          + dg.options.map(function (o, i) {
              var cls = "diag-opt";
              if (diagWrongPick[id] === i) cls += " diag-bad";
              return '<button type="button" class="' + cls + '" data-mod="' + esc(id) + '" data-idx="' + i + '">' + (i + 1) + ". " + esc(o) + "</button>";
            }).join("")
          + "</div>";
        return;
      }
      var steps = stepsFor(id);
      var prog = repairProgress[id] || (repairProgress[id] = { done: 0, busy: -1 });
      if (diagCorrect[id]) {
        html += '<p class="diag-good">✓ Diagnóstico correcto — ahora repara paso a paso.</p>';
      }
      if (prog.done > steps.length) prog.done = steps.length;
      var pct = Math.round((prog.done / steps.length) * 100);
      html += '<div class="mod-sec mod-repair ' + st + '"><h2>⚠ Reparación necesaria — ' + esc(name) + helpHTML("repair", id) + helpHTML("module", id) + '</h2>'
        + '<p>Estado: <span class="mod-state ' + st + '">' + LABEL[st] + '</span> — completa el procedimiento para restablecer el módulo. Cada paso tarda un momento: es trabajo real de tripulación, no un clic.</p>'
        + '<div class="repair-bar-wrap"><div class="repair-bar" style="width:' + pct + '%"></div></div>'
        + '<ol class="repair-steps">'
        + steps.map(function (s, i) {
            var done = i < prog.done;
            var busy = i === prog.busy;
            // v16: el primer paso es AJUSTAR (slider, no un clic) y el
            // ultimo paso de una falla critica es una SECUENCIA (ordenar).
            if (s.kind === "slider") {
              var cal = calRangeFor(slugOf(id));
              var v = (calVal[id] !== undefined) ? calVal[id] : Math.round((cal.min + cal.max) / 2);
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="0" disabled>1. 🎚️ Ajustar ' + esc(cal.param) + ' <span class="st">✓ Hecho</span></button></li>';
              var bad = calBad[id] ? '<p class="cal-bad">❌ Fuera de rango — el valor debe estar entre ' + cal.lo + " y " + cal.hi + " " + esc(cal.unit) + ".</p>" : "";
              return '<li><div class="cal-box"><b>🎚️ Paso 1 — Ajustar ' + esc(cal.param) + '</b>'
                + '<p>Mueve el slider hasta la zona verde (' + cal.lo + "–" + cal.hi + " " + esc(cal.unit) + ") y pulsa Aplicar.</p>"
                + '<input type="range" class="cal-slider" data-mod="' + esc(id) + '" min="' + cal.min + '" max="' + cal.max + '" step="1" value="' + v + '">'
                + '<p>Valor actual: <b id="calVal-' + esc(id) + '">' + v + "</b> " + esc(cal.unit)
                + ' · zona verde: <span class="cal-target">' + cal.lo + "–" + cal.hi + " " + esc(cal.unit) + "</span></p>"
                + bad
                + '<button type="button" class="repair-step" data-mod="' + esc(id) + '" data-step="0" data-cal="1">Aplicar ajuste</button></div></li>';
            }
            if (s.kind === "sequence") {
              var seq = SEQUENCE[slugOf(id)] || SEQUENCE.energy;
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🔢 Secuencia correcta <span class="st">✓ Hecho</span></button></li>';
              if (!seqOrder[id]) {
                // Barajar el orden de los 3 botones (una vez por modulo).
                seqOrder[id] = [0, 1, 2].sort(function () { return Math.random() - 0.5; });
              }
              var order = seqOrder[id];
              var progSeq = seqProgress[id] || 0;
              var wrong = seqWrong[id];
              return '<li><button type="button" class="repair-step" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🔢 Secuencia <span class="st">▶ Hacer</span></button><div class="cal-box"><b>🔢 Paso ' + (i + 1) + " — Ordena la secuencia</b>"
                + '<p>Pulsa las 3 acciones en su <b>orden lógico</b> (la pista: ' + esc(seq[0]) + " → " + esc(seq[1]) + " → " + esc(seq[2]) + "). Si te equivocas, se reinicia.</p>"
                + (wrong !== undefined ? '<p class="cal-bad">❌ Orden incorrecto — vuelve a empezar.</p>' : "")
                + order.map(function (idx) {
                    var cls = idx < progSeq ? " done" : (wrong === idx ? " bad" : "");
                    return '<button type="button" class="seq-btn' + cls + '" data-mod="' + esc(id) + '" data-seq="' + idx + '">' + esc(seq[idx]) + "</button>";
                  }).join("")
                + "</div></li>";
            }
            if (s.kind === "hold") {
              // v18: MANTENER — mantener presionado 2 s para cargar.
              // No es un clic: hay que AGUANTAR. Si sueltas antes, se reinicia.
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🔋 ' + esc(s.text) + ' <span class="st">✓ Hecho</span></button></li>';
              var holdDis = (i === prog.done) ? "" : " disabled";
              return '<li><button type="button" class="hold-btn" data-mod="' + esc(id) + '" data-step="' + i + '"' + holdDis + '>'
                + "🔋 Paso " + (i + 1) + " — Mantén presionado para cargar: " + esc(s.text)
                + '<span class="hold-bar"><span class="hold-fill" id="holdFill-' + esc(id) + '"></span></span>'
                + '<span class="hold-hint">Aguanta 2 segundos sin soltar. Si sueltas antes, la carga se pierde.</span></button></li>';
            }
            // v19: TECLADO NUMERICO — el monitor muestra un codigo de 4
            // digitos (de los valores reales de la NASA) y hay que teclearlo.
            if (s.kind === "keypad") {
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🔢 Código introducido <span class="st">✓ Hecho</span></button></li>';
              var kp = KEYPAD[slugOf(id)] || KEYPAD.energy;
              var code = keypadCodeFor(slugOf(id), id);
              var inp = keypadInput[id] || "";
              var showCode = getDifficulty() !== "dificil";
              var disp = (inp + "____").slice(0, 4);
              var kdis = (i === prog.done) ? "" : " disabled";
              return '<li><div class="cal-box"><b>🔢 Paso ' + (i + 1) + " — " + esc(kp.label) + '</b>'
                + (showCode
                    ? '<p class="mech-code">Código en el monitor: <b>' + code + '</b></p>'
                    : '<p>El código es <b>aleatorio</b> y cambia en cada intento — búscalo en <b>Valores en vivo</b> (abajo), en "Código de autorización", y teclea los 4 dígitos.</p>')
                + '<div class="keypad-display' + (keypadBad[id] ? " bad" : "") + '">' + disp + '</div>'
                + (keypadBad[id] ? '<p class="cal-bad">❌ Código incorrecto — vuelve a intentarlo.</p>' : "")
                + '<div class="keypad">'
                + ["1","2","3","4","5","6","7","8","9","C","0","↵"].map(function (k) {
                    return '<button type="button" class="keypad-btn" data-mod="' + esc(id) + '" data-step="' + i + '" data-key="' + k + '"' + kdis + '>' + k + '</button>';
                  }).join("")
                + '</div></div></li>';
            }
            // v19: BRAZO ROBOTICO — mover las articulaciones al objetivo.
            if (s.kind === "arm") {
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🦾 Brazo en posición <span class="st">✓ Hecho</span></button></li>';
              var arm = ARM[slugOf(id)] || ARM.robotics;
              var diff = getDifficulty();
              var joints = (diff === "facil" || diff === "medio") ? arm.joints.slice(0, 1) : arm.joints;
              var tol = diff === "facil" ? 10 : (diff === "medio" ? 5 : 2);
              var vals = armVal[id] || (armVal[id] = arm.joints.map(function (j) { return Math.round((j.min + j.max) / 2); }));
              var adis = (i === prog.done) ? "" : " disabled";
              return '<li><div class="cal-box"><b>🦾 Paso ' + (i + 1) + " — Controla el brazo robótico</b>"
                + '<p>Mueve cada articulación a su posición objetivo (tolerancia ±' + tol + '°).</p>'
                + joints.map(function (j, ji) {
                    return '<div class="arm-row"><label>' + esc(j.name) + ' → ' + j.target + '°</label>'
                      + '<input type="range" class="arm-slider" data-mod="' + esc(id) + '" data-joint="' + ji + '" min="' + j.min + '" max="' + j.max + '" step="1" value="' + vals[ji] + '"' + adis + '>'
                      + '<span class="arm-val" id="armVal-' + esc(id) + '-' + ji + '">' + vals[ji] + '°</span></div>';
                  }).join("")
                + '<button type="button" class="repair-step" data-mod="' + esc(id) + '" data-step="' + i + '" data-arm="1"' + adis + '>Aplicar posición</button></div></li>';
            }
            // v19: POTENCIOMETRO — girar el mando hasta el valor objetivo.
            if (s.kind === "dial") {
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🎛️ Potenciómetro ajustado <span class="st">✓ Hecho</span></button></li>';
              var dl = DIAL[slugOf(id)] || DIAL.eclss;
              var ddiff = getDifficulty();
              var dtol = ddiff === "facil" ? 2 : (ddiff === "medio" ? 1 : 0);
              var dtarget = dialTargetFor(slugOf(id), id);
              var dv = (dialVal[id] !== undefined) ? dialVal[id] : Math.round((dl.min + dl.max) / 2);
              var ddis = (i === prog.done) ? "" : " disabled";
              var angle = -135 + ((dv - dl.min) / Math.max(1, dl.max - dl.min)) * 270;
              var dhtml = '<li><div class="cal-box"><b>🎛️ Paso ' + (i + 1) + " — " + esc(dl.param) + '</b>'
                + '<p>Gira el potenciómetro hasta <b>' + dtarget + " " + esc(dl.unit) + '</b> (tolerancia ±' + dtol + "). El objetivo cambia en cada intento.</p>"
                + '<div class="dial-wrap"><div class="dial" data-mod="' + esc(id) + '" data-step="' + i + '"' + ddis + '><div class="dial-pointer" style="transform:rotate(' + angle + 'deg)"></div></div>'
                + '<div><div class="dial-val" id="dialVal-' + esc(id) + '">' + dv + " " + esc(dl.unit) + '</div>'
                + '<div><button type="button" class="keypad-btn" data-mod="' + esc(id) + '" data-dial="-1" data-dial-n="1"' + ddis + '>−</button> '
                + '<button type="button" class="keypad-btn" data-mod="' + esc(id) + '" data-dial="1" data-dial-n="1"' + ddis + '>+</button></div></div></div>';
              // v19.3: SEGUNDO potenciometro (medio/dificil).
              if (ddiff !== "facil") {
                var dl2 = DIAL2[slugOf(id)] || DIAL2.eclss;
                var dtarget2 = dialTarget2For(slugOf(id), id);
                var dv2 = (dialVal2[id] !== undefined) ? dialVal2[id] : Math.round((dl2.min + dl2.max) / 2);
                var angle2 = -135 + ((dv2 - dl2.min) / Math.max(1, dl2.max - dl2.min)) * 270;
                dhtml += '<b>🎛️ Segundo potenciómetro — ' + esc(dl2.param) + '</b>'
                  + '<p>Gira el segundo potenciómetro hasta <b>' + dtarget2 + " " + esc(dl2.unit) + '</b> (tolerancia ±' + dtol + ").</p>"
                  + '<div class="dial-wrap"><div class="dial" data-mod="' + esc(id) + '" data-step="' + i + '"' + ddis + '><div class="dial-pointer" style="transform:rotate(' + angle2 + 'deg)"></div></div>'
                  + '<div><div class="dial-val" id="dialVal2-' + esc(id) + '">' + dv2 + " " + esc(dl2.unit) + '</div>'
                  + '<div><button type="button" class="keypad-btn" data-mod="' + esc(id) + '" data-dial="-1" data-dial-n="2"' + ddis + '>−</button> '
                  + '<button type="button" class="keypad-btn" data-mod="' + esc(id) + '" data-dial="1" data-dial-n="2"' + ddis + '>+</button></div></div></div>';
              }
              dhtml += '<button type="button" class="repair-step" data-mod="' + esc(id) + '" data-step="' + i + '" data-dial-apply="1"' + ddis + '>Aplicar valor</button></div></li>';
              return dhtml;
            }
            // v19: CONEXIONES — conectar cada cable a su puerto correcto.
            if (s.kind === "wires") {
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. 🔌 Cables conectados <span class="st">✓ Hecho</span></button></li>';
              var wp = WIRES[slugOf(id)] || WIRES.comms;
              var wdiff = getDifficulty();
              var npairs = wdiff === "facil" ? 2 : (wdiff === "medio" ? 3 : wp.length);
              var pairs = wp.slice(0, npairs);
              if (!wireOrder[id]) wireOrder[id] = pairs.map(function (p) { return p[1]; }).sort(function () { return Math.random() - 0.5; });
              var wdone = wireDone[id] || {};
              var sel = wireSel[id];
              var wdis = (i === prog.done) ? "" : " disabled";
              var left = pairs.map(function (p) {
                var cls = wdone[p[0]] ? " done" : (sel === p[0] ? " sel" : "");
                return '<button type="button" class="wire-btn' + cls + '" data-mod="' + esc(id) + '" data-wire-src="' + esc(p[0]) + '"' + wdis + '>' + esc(p[0]) + '</button>';
              }).join("");
              var right = wireOrder[id].map(function (dst) {
                var src = pairs.filter(function (p) { return p[1] === dst; })[0][0];
                var cls = wdone[src] ? " done" : (wireBad[id] === dst ? " bad" : "");
                return '<button type="button" class="wire-btn' + cls + '" data-mod="' + esc(id) + '" data-wire-dst="' + esc(dst) + '"' + wdis + '>' + esc(dst) + '</button>';
              }).join("");
              return '<li><div class="cal-box"><b>🔌 Paso ' + (i + 1) + " — Conecta los cables</b>"
                + '<p>Toca un cable de la izquierda y luego su puerto de la derecha.</p>'
                + (wireBad[id] ? '<p class="cal-bad">❌ Esa conexión no es — revisa el diagrama.</p>' : "")
                + '<div class="wire-cols"><div>' + left + '</div><div>' + right + '</div></div></div></li>';
            }
            // v19: PREGUNTAS — responder una pregunta real sobre el modulo.
            if (s.kind === "quiz") {
              if (done) return '<li><button type="button" class="repair-step done" data-mod="' + esc(id) + '" data-step="' + i + '" disabled>' + (i + 1) + '. ❓ Pregunta correcta <span class="st">✓ Hecho</span></button></li>';
              var qz = QUIZ[slugOf(id)] || QUIZ.radiation;
              var qdiff = getDifficulty();
              var opts = qdiff === "facil" ? qz.options.slice(0, 2) : qz.options;
              var qdis = (i === prog.done) ? "" : " disabled";
              return '<li><div class="cal-box"><b>❓ Paso ' + (i + 1) + " — Pregunta de tripulación</b>"
                + '<p>' + esc(qz.q) + '</p>'
                + opts.map(function (o, oi) {
                    var cls = (quizWrong[id] === oi) ? " bad" : "";
                    return '<button type="button" class="quiz-opt' + cls + '" data-mod="' + esc(id) + '" data-step="' + i + '" data-quiz="' + oi + '"' + qdis + '>' + (oi + 1) + ". " + esc(o) + '</button>';
                  }).join("")
                + '</div></li>';
            }
            var dis = (!done && !busy && i === prog.done) ? "" : " disabled";
            var cls = done ? " done" : (busy ? " busy" : "");
            var mark = done ? "✓ Hecho" : (busy ? "… Trabajando" : (i === prog.done ? "▶ Hacer" : "—"));
            return '<li><button type="button" class="repair-step' + cls + '" data-mod="' + esc(id) + '" data-step="' + i + '"' + dis + '>'
              + (i + 1) + ". " + esc(s.text) + '<span class="st">' + mark + "</span></button></li>";
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
          // v19.3: en dificil el codigo del teclado (aleatorio) se busca
          // aqui, en la telemetria, como "Codigo de autorizacion".
          if (getDifficulty() === "dificil" && (MECHANIC[slugOf(id)] === "keypad") && keypadCode[id]) {
            html += '<div class="live-val"><span class="lv-name">Código de autorización<span class="lv-src">Fuente: telemetría de la estación</span></span>'
              + '<span class="lv-num">' + esc(keypadCode[id]) + '</span></div>';
          }
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

  // v14: cada modulo muestra el componente que el jugador eligio para
  // ese sistema (sin tocar las imagenes: es texto en la mini-web).
  var MODULE_COMPONENT = {
    "energy": "power", "comms": "comms", "thermal": "thermal",
    "propulsion": "propulsion", "science": "instruments",
    "navigation": "spacecraft", "robotics": "spacecraft",
    "structure": "spacecraft", "command": "spacecraft"
  };
  var COMPONENT_LABEL = {
    "spacecraft": "Nave espacial", "instruments": "Instrumentos científicos",
    "power": "Sistema de potencia", "comms": "Comunicaciones",
    "thermal": "Control térmico", "propulsion": "Propulsión"
  };
  function savedComponents() {
    try {
      var saved = JSON.parse(localStorage.getItem("xonidu-mission-v1") || "null");
      return (saved && saved.components) || {};
    } catch (e) { return {}; }
  }
  function componentLine(id) {
    var sys = MODULE_COMPONENT[slugOf(id)];
    if (!sys) return "";
    var comps = savedComponents();
    var chosen = comps[sys];
    if (!chosen) return '<p class="muted">Tu diseño: aún no elegiste el sistema de ' + COMPONENT_LABEL[sys] + ' (menú → 🧩 Componentes).</p>';
    return '<p><strong>Tu diseño — ' + COMPONENT_LABEL[sys] + ':</strong> ' + esc(chosen) + '</p>';
  }

  // v15: que senal temprana se esta viendo (desde los valores en vivo).
  function preSignalFor(id) {
    var d = (typeof liveCache !== "undefined" && liveCache) || null;
    var slug = slugOf(id);
    var parts = [];
    if (d) {
      if (d.cme_speed != null) parts.push("la velocidad del CME es <b>" + d.cme_speed + " km/s</b> y sigue subiendo");
      if (d.kp != null) parts.push("el índice Kp es <b>" + d.kp + "</b> (tormenta geomagnética en camino)");
      if (d.flare) parts.push("hay una llamarada <b>" + esc(d.flare) + "</b>");
      if (d.neo_count) parts.push("hay <b>" + d.neo_count + "</b> asteroides cercanos hoy");
    }
    if (!parts.length) parts.push("los valores en vivo de la NASA están subiendo");
    return "⚠ <b>Se acerca una anomalía</b> en este módulo: " + parts.join("; ") + ". Aún no falló — vigila los valores en vivo o refuérzalo ahora.";
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
        + componentLine(id)
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

/* ============ XONIDU — Datos del juego: 9 misiones + métricas por módulo ============ */
// Fuente: mecanicas-reto-13-xonidu.md §2 (misiones) y §5 (variables por módulo).
// Los ids de misión son los mismos del menú (menu/app.js MISSIONS).
// Los números son valores de JUEGO para la demo, no datos reales de ingeniería.
// Las pantallas de módulos (zone-*/modulos/*.html) leen este archivo con
// module-screen.js para mostrar la misión elegida y las métricas del módulo.

window.XONIDU_MISSIONS = [
  {
    id: "SATELLITE REPAIR",
    name: "Mantenimiento y reparación de satélites en órbita",
    desc: "Acercarse a un satélite, capturarlo con el brazo, acoplarse y repararlo o reabastecerlo.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 0,
    modules: ["mod-d-robotics", "mod-d-navigation", "mod-f-propulsion", "mod-f-structure", "mod-e-robotics-eva"],
    steps: [
      { text: "Acercamiento al satélite", modules: ["mod-d-navigation"] },
      { text: "Captura con el brazo robótico", modules: ["mod-d-robotics"] },
      { text: "Acoplamiento a la estructura", modules: ["mod-f-structure"] },
      { text: "Reparación / reabastecimiento", modules: ["mod-f-propulsion"] }
    ],
    threats: "Nauka 2021 (actitud) · ASAT 2021 (debris en navegación)"
  },
  {
    id: "CARGO CAPTURE",
    name: "Captura de naves de carga",
    desc: "Atrapar con el brazo una nave como Dragon o Cygnus y acoplarla a la estación.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 0,
    modules: ["mod-d-robotics", "mod-d-comms", "mod-e-structure", "mod-c-command"],
    steps: [
      { text: "Aproximación", modules: ["mod-d-comms", "mod-c-command"] },
      { text: "Captura con el brazo", modules: ["mod-d-robotics"] },
      { text: "Acoplamiento", modules: ["mod-e-structure"] },
      { text: "Descarga de la carga", modules: ["mod-e-structure"] }
    ],
    threats: "Soyuz MS-18 2021 (actitud durante acoplamiento) · Nauka 2021"
  },
  {
    id: "SPACEWALK (EVA)",
    name: "Salidas espaciales (EVA)",
    desc: "Los astronautas salen a reparar, instalar equipos o recoger muestras.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 0,
    modules: ["mod-e-robotics-eva", "mod-a-eclss", "mod-a-radiation", "mod-d-robotics"],
    steps: [
      { text: "Preparación: checklist y O2 de trajes", modules: ["mod-e-robotics-eva"] },
      { text: "Salida (ECLSS ok)", modules: ["mod-a-eclss"] },
      { text: "Trabajo con apoyo del brazo", modules: ["mod-d-robotics"] },
      { text: "Regreso a la esclusa", modules: ["mod-e-robotics-eva"] }
    ],
    threats: "Tormenta solar (radiación: abortar la EVA si sube la dosis) · Agua en el casco 2022. Si hay tormenta solar durante la EVA y no se aborta: -100 y cae la salud de la tripulación."
  },
  {
    id: "CUBESAT DEPLOY",
    name: "Despliegue de CubeSats desde la esclusa",
    desc: "Diseñar, desplegar y seguir un satélite pequeño desde la estación.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 40,
    modules: ["mod-e-structure", "mod-f-science", "mod-f-comms", "mod-d-navigation"],
    steps: [
      { text: "Diseño del CubeSat", modules: ["mod-f-science"] },
      { text: "Carga en la esclusa", modules: ["mod-e-structure"] },
      { text: "Despliegue", modules: ["mod-e-structure"] },
      { text: "Seguimiento (genera DATA)", modules: ["mod-f-comms", "mod-d-navigation"] }
    ],
    threats: "ASAT 2021 (debris en seguimiento) · Tormenta solar (comms degradado)"
  },
  {
    id: "MICROGRAVITY SCIENCE",
    name: "Experimentos científicos en microgravedad",
    desc: "Cultivos con Veggie y APH, y estudios de combustión con BASS y SAFFIRE.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 40,
    modules: ["mod-b-food", "mod-b-thermal", "mod-f-science", "mod-c-thermal"],
    steps: [
      { text: "Preparar experimento", modules: ["mod-b-food", "mod-b-thermal"] },
      { text: "Ejecutar experimento", modules: ["mod-f-science"] },
      { text: "Recoger datos (genera DATA)", modules: ["mod-f-science", "mod-c-thermal"] }
    ],
    threats: "Fuga de amoníaco 2013 (thermal) · Fuga del carguero Progress 2023 (thermal)"
  },
  {
    id: "EARTH OBSERVATION",
    name: "Observación de la Tierra y desastres naturales",
    desc: "Monitorear incendios, huracanes e inundaciones y enviar los datos a equipos en tierra.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 40,
    modules: ["mod-f-science", "mod-f-comms", "mod-d-navigation", "mod-d-comms"],
    steps: [
      { text: "Apuntar", modules: ["mod-d-navigation"] },
      { text: "Capturar imágenes", modules: ["mod-f-science"] },
      { text: "Transmitir", modules: ["mod-f-comms", "mod-d-comms"] },
      { text: "Datos a tierra (genera DATA)", modules: ["mod-f-comms"] }
    ],
    threats: "Tormenta solar (comms degradado)"
  },
  {
    id: "MOON & MARS TECH",
    name: "Pruebas de tecnología para la Luna y Marte",
    desc: "Probar en la estación todo lo que servirá en misiones futuras. Usa las 6 zonas.",
    orbit: "LEO", orbitAlt: "HELIOCENTRIC", launcher: ["ATLAS V"], bonus: 300, datos: 0,
    modules: "ALL",
    steps: [
      { text: "Instalar prototipo", modules: [] },
      { text: "Probar", modules: [] },
      { text: "Reportar datos", modules: [] }
    ],
    threats: "Cualquiera del catálogo (es la misión más expuesta porque usa todos los módulos)"
  },
  {
    id: "SATELLITE LIFE EXTENSION",
    name: "Extensión de vida de satélites",
    desc: "Acoplarse a un satélite viejo para reabastecerlo de combustible o reemplazar componentes.",
    orbit: "GEO", launcher: ["ATLAS V", "ARIANE 5"], bonus: 200, datos: 0,
    modules: ["mod-f-propulsion", "mod-f-structure", "mod-d-navigation", "mod-d-robotics"],
    steps: [
      { text: "Acercamiento", modules: ["mod-d-navigation"] },
      { text: "Acoplamiento", modules: ["mod-f-structure"] },
      { text: "Reabastecimiento o reemplazo", modules: ["mod-f-propulsion", "mod-d-robotics"] },
      { text: "Verificación", modules: ["mod-d-navigation"] }
    ],
    threats: "Starliner 2024 (fugas de helio en propulsión) · Soyuz MS-22 2022 (fuga de refrigerante)"
  },
  {
    id: "ASTRONOMY",
    name: "Observación astronómica desde la estación",
    desc: "Aprovechar la posición en órbita para observar el espacio con menos interferencia atmosférica.",
    orbit: "LEO", launcher: ["FALCON 9"], bonus: 200, datos: 40,
    modules: ["mod-f-science", "mod-f-comms", "mod-a-radiation", "mod-d-navigation"],
    steps: [
      { text: "Apuntar", modules: ["mod-d-navigation"] },
      { text: "Observar", modules: ["mod-f-science"] },
      { text: "Transmitir datos (genera DATA)", modules: ["mod-f-comms", "mod-a-radiation"] }
    ],
    threats: "Tormenta solar (radiación interfiere con las observaciones)"
  }
];

/* Métricas por módulo (mecanicas-reto-13 §5). El estado del módulo es el peor
   nivel de sus métricas. Los valores numéricos en vivo no los da el backend:
   la pantalla muestra los umbrales y el estado en vivo (ok/warn/crit) del
   módulo, que es lo que el backend sí reporta con datos reales de la NASA. */
window.XONIDU_MODULE_INFO = {
  "mod-a-habitability": { name: "Habitability", zone: "A", blurb: "Dormitorios, comedor e higiene de la tripulación.",
    metrics: [
      { name: "Agua potable", unit: "%", warn: "< 50", crit: "< 25" },
      { name: "Humedad", unit: "%", warn: "> 70", crit: "> 85" } ] },
  "mod-a-health": { name: "Health", zone: "A", blurb: "Salud de la tripulación. Baja si ECLSS o radiación están en crit.",
    metrics: [
      { name: "Salud de la tripulación", unit: "%", warn: "< 80", crit: "< 60" } ] },
  "mod-a-eclss": { name: "ECLSS", zone: "A", blurb: "Aire y agua para la tripulación: O2, CO2 y reciclaje.",
    metrics: [
      { name: "O2", unit: "%", warn: "< 19.5", crit: "< 18" },
      { name: "CO2", unit: "ppm", warn: "> 1000", crit: "> 5000" },
      { name: "Agua reciclada", unit: "%", warn: "< 50", crit: "< 25" } ] },
  "mod-a-fire": { name: "Fire", zone: "A", blurb: "Detección y extinción de incendios en el hábitat.",
    metrics: [
      { name: "Detectores activos", unit: "n/8", warn: "< 8", crit: "< 6" },
      { name: "CO", unit: "ppm", warn: "> 50", crit: "> 100" },
      { name: "FM-200", unit: "%", warn: "< 50", crit: "< 25" } ] },
  "mod-a-radiation": { name: "Radiation", zone: "A", blurb: "Dosis de radiación de la tripulación y viento solar.",
    metrics: [
      { name: "Dosis acumulada", unit: "mSv", warn: "> 50", crit: "> 100" },
      { name: "Viento solar", unit: "km/s", warn: "> 500", crit: "> 800" } ] },
  "mod-b-food": { name: "Food", zone: "B", blurb: "Cultivos Veggie / APH y alimentos de la tripulación.",
    metrics: [
      { name: "Salud de cultivos", unit: "%", warn: "< 50", crit: "< 25" },
      { name: "Agua / nutrientes", unit: "%", warn: "< 40", crit: "< 20" } ] },
  "mod-b-thermal": { name: "Thermal", zone: "B", blurb: "Temperatura del laboratorio y los cultivos.",
    metrics: [
      { name: "Temp. laboratorio", unit: "°C", warn: "> 28 o < 18", crit: "> 35 o < 10" } ] },
  "mod-b-energy": { name: "Energy", zone: "B", blurb: "Energía del laboratorio: luces LED y batería.",
    metrics: [
      { name: "Consumo LED", unit: "W", warn: "> 400", crit: "> 600" },
      { name: "Batería", unit: "%", warn: "< 40", crit: "< 20" } ] },
  "mod-b-fire": { name: "Fire", zone: "B", blurb: "Detección y extinción de incendios en el laboratorio.",
    metrics: [
      { name: "Detectores", unit: "n/8", warn: "< 8", crit: "< 6" },
      { name: "CO", unit: "ppm", warn: "> 50", crit: "> 100" } ] },
  "mod-c-eclss": { name: "ECLSS", zone: "C", blurb: "Aire, agua y presión del compartimiento técnico.",
    metrics: [
      { name: "O2", unit: "%", warn: "< 19.5", crit: "< 18" },
      { name: "CO2", unit: "%", warn: "> 0.5", crit: "> 1" },
      { name: "Presión", unit: "hPa", warn: "< 950", crit: "< 900" },
      { name: "Agua recuperada", unit: "%", warn: "< 50", crit: "< 25" } ] },
  "mod-c-energy": { name: "Energy", zone: "C", blurb: "Distribución eléctrica: potencia, batería y bus.",
    metrics: [
      { name: "Potencia generada", unit: "kW", warn: "< 5", crit: "< 2" },
      { name: "Batería (SOC)", unit: "%", warn: "< 40", crit: "< 20" },
      { name: "Voltaje del bus", unit: "V", warn: "< 110", crit: "< 100" } ] },
  "mod-c-thermal": { name: "Thermal", zone: "C", blurb: "Control térmico: radiadores y lazo de amoníaco.",
    metrics: [
      { name: "Temp. interna", unit: "°C", warn: "> 28 o < 18", crit: "> 35 o < 10" },
      { name: "Radiador", unit: "%", warn: "< 40", crit: "< 20" },
      { name: "Flujo NH3", unit: "L/min", warn: "< 2", crit: "< 1" } ] },
  "mod-c-command": { name: "Command", zone: "C", blurb: "Red de datos y comandos de la estación.",
    metrics: [
      { name: "Latencia", unit: "s", warn: "> 2", crit: "> 5" },
      { name: "Throughput", unit: "Gb/s", warn: "< 1", crit: "< 0.5" } ] },
  "mod-d-command": { name: "Command", zone: "D", blurb: "Consola de comandos: la PC desde la que se dan las órdenes.",
    metrics: [
      { name: "Latencia de enlace", unit: "s", warn: "> 2", crit: "> 5" },
      { name: "Sesión", unit: "", warn: "inestable", crit: "congelada" } ] },
  "mod-d-navigation": { name: "Navigation", zone: "D", blurb: "Posición, velocidad y seguimiento de debris.",
    metrics: [
      { name: "Altitud", unit: "km", warn: "< 400", crit: "< 380" },
      { name: "Velocidad", unit: "km/s", warn: "< 7.5", crit: "< 7" },
      { name: "Objetos rastreados", unit: "", warn: "> 100", crit: "> 500" },
      { name: "Alerta de debris", unit: "", warn: "cerca", crit: "trayectoria" } ] },
  "mod-d-comms": { name: "Comms", zone: "D", blurb: "Comunicaciones con Tierra y enlace DSN.",
    metrics: [
      { name: "Señal por antena", unit: "dB", warn: "< -80", crit: "< -100" },
      { name: "Latencia", unit: "s", warn: "> 2", crit: "> 5" },
      { name: "Enlace DSN", unit: "", warn: "degradado", crit: "caído" } ] },
  "mod-d-robotics": { name: "Robotics", zone: "D", blurb: "Brazo robótico: ángulos, carga y conexión.",
    metrics: [
      { name: "Ángulos J1/J2/J3", unit: "°", warn: "fuera de rango", crit: "límite" },
      { name: "Carga", unit: "kg", warn: "> 500", crit: "> 800" },
      { name: "Brazo", unit: "", warn: "atascado", crit: "desconectado" } ] },
  "mod-e-structure": { name: "Structure", zone: "E", blurb: "Estructura del nodo y la esclusa, presión e impactos.",
    metrics: [
      { name: "Integridad", unit: "%", warn: "< 80", crit: "< 60" },
      { name: "Presión", unit: "hPa", warn: "< 950", crit: "< 900" },
      { name: "Micrometeoritos", unit: "", warn: "impacto leve", crit: "impacto grave" } ] },
  "mod-e-robotics-eva": { name: "Robotics / EVA", zone: "E", blurb: "Preparación de salidas espaciales: trajes, herramientas y checklist.",
    metrics: [
      { name: "O2 de trajes", unit: "%", warn: "< 80", crit: "< 60" },
      { name: "Herramientas listas", unit: "", warn: "incompletas", crit: "faltan" },
      { name: "Checklist", unit: "n/5", warn: "< 5", crit: "< 3" } ] },
  "mod-e-fire": { name: "Fire", zone: "E", blurb: "Extinción de incendios en el nodo y la esclusa.",
    metrics: [
      { name: "FM-200", unit: "%", warn: "< 50", crit: "< 25" },
      { name: "Detectores", unit: "n/6", warn: "< 6", crit: "< 4" } ] },
  "mod-f-energy": { name: "Energy", zone: "F", blurb: "Paneles solares y batería del exterior.",
    metrics: [
      { name: "Salida de paneles", unit: "kW", warn: "< 5", crit: "< 2" },
      { name: "Batería", unit: "%", warn: "< 40", crit: "< 20" } ] },
  "mod-f-thermal": { name: "Thermal", zone: "F", blurb: "Radiadores y temperatura exterior.",
    metrics: [
      { name: "Radiador", unit: "%", warn: "< 40", crit: "< 20" },
      { name: "Temp. externa", unit: "°C", warn: "> 60 o < -60", crit: "> 80 o < -80" } ] },
  "mod-f-comms": { name: "Comms", zone: "F", blurb: "Antenas exteriores y datos transmitidos.",
    metrics: [
      { name: "Señal", unit: "dB", warn: "< -80", crit: "< -100" },
      { name: "Datos transmitidos", unit: "MB", warn: "< 100", crit: "< 10" } ] },
  "mod-f-science": { name: "Science", zone: "F", blurb: "Instrumentos científicos: alimentan el DATA global.",
    metrics: [
      { name: "Datos recogidos", unit: "MB", warn: "< 50", crit: "< 10" } ] },
  "mod-f-structure": { name: "Structure", zone: "F", blurb: "Estructura exterior: integridad e impactos.",
    metrics: [
      { name: "Integridad", unit: "%", warn: "< 80", crit: "< 60" },
      { name: "Impactos", unit: "", warn: "leve", crit: "grave" } ] },
  "mod-f-propulsion": { name: "Propulsion", zone: "F", blurb: "Propulsores: combustible y empuje disponible.",
    metrics: [
      { name: "Combustible", unit: "%", warn: "< 40", crit: "< 20" },
      { name: "Empuje disponible", unit: "%", warn: "< 50", crit: "< 25" } ] },
  "mod-f-radiation": { name: "Radiation", zone: "F", blurb: "Radiación exterior: dosis y viento solar.",
    metrics: [
      { name: "Dosis", unit: "mSv", warn: "> 50", crit: "> 100" },
      { name: "Viento solar", unit: "km/s", warn: "> 500", crit: "> 800" } ] }
};

window.XONIDU_MISSIONS_FOR_MODULE = function (moduleId) {
  return (window.XONIDU_MISSIONS || []).filter(m =>
    m.modules === "ALL" || (Array.isArray(m.modules) && m.modules.indexOf(moduleId) !== -1));
};

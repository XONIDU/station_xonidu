# MODULE IDS — Space Mission Design Game (XONIDU / NASA Space Apps 2026)

Esquema de IDs estable (usado en todo el codigo: atributo `data-module-id` de los hotspots, claves del store de estado e IDs de las pantallas de modulo):

- Zonas: `zone-a`, `zone-b`, `zone-c`, `zone-d`, `zone-e`, `zone-f`
- Modulos: `mod-<zona>-<slug>` en ingles, minusculas y con guiones. Ejemplos: `mod-a-eclss`, `mod-b-food`, `mod-d-comms`, `mod-e-robotics-eva`, `mod-f-propulsion`.

El mismo modulo en distintas zonas es una instancia distinta, con su propio ID (por ejemplo `mod-a-fire`, `mod-b-fire` y `mod-e-fire` son modulos distintos).

No hay datos de simulacion: solo identificacion (zona, modulo, ID, etiqueta visible).

| Zona | ID de zona | Modulo | ID de modulo | Etiqueta visible |
|------|------------|--------|--------------|------------------|
| A | zone-a | Habitability | mod-a-habitability | Module: Habitability |
| A | zone-a | Health | mod-a-health | Module: Health |
| A | zone-a | ECLSS | mod-a-eclss | Module: ECLSS |
| A | zone-a | Fire | mod-a-fire | Module: Fire |
| A | zone-a | Radiation | mod-a-radiation | Module: Radiation |
| B | zone-b | Food | mod-b-food | Module: Food |
| B | zone-b | Thermal | mod-b-thermal | Module: Thermal |
| B | zone-b | Energy | mod-b-energy | Module: Energy |
| B | zone-b | Fire | mod-b-fire | Module: Fire |
| C | zone-c | ECLSS | mod-c-eclss | Module: ECLSS |
| C | zone-c | Energy | mod-c-energy | Module: Energy |
| C | zone-c | Thermal | mod-c-thermal | Module: Thermal |
| C | zone-c | Command | mod-c-command | Module: Command |
| D | zone-d | Command | mod-d-command | Module: Command |
| D | zone-d | Navigation | mod-d-navigation | Module: Navigation |
| D | zone-d | Comms | mod-d-comms | Module: Comms |
| D | zone-d | Robotics | mod-d-robotics | Module: Robotics |
| E | zone-e | Structure | mod-e-structure | Module: Structure |
| E | zone-e | Robotics/EVA | mod-e-robotics-eva | Module: Robotics/EVA |
| E | zone-e | Fire | mod-e-fire | Module: Fire |
| F | zone-f | Energy | mod-f-energy | Module: Energy |
| F | zone-f | Thermal | mod-f-thermal | Module: Thermal |
| F | zone-f | Comms | mod-f-comms | Module: Comms |
| F | zone-f | Science | mod-f-science | Module: Science |
| F | zone-f | Structure | mod-f-structure | Module: Structure |
| F | zone-f | Propulsion | mod-f-propulsion | Module: Propulsion |
| F | zone-f | Radiation | mod-f-radiation | Module: Radiation |

Total: 6 zonas, 27 modulos.

## Inconsistencias encontradas y como se resolvieron

1. **Zona F no tiene pagina.** El mapa la lista (Exterior Assembly) pero no existe `zona-f`. Se creo `zone-f/index.html` (con `style.css` y `app.js` en el mismo formato que las demas zonas) con los 7 modulos del mapa. No existe `zone-f.png`, así que usa el fondo oscuro de respaldo igual que el resto si falta la imagen.
2. **Modulos del mapa en espanol vs slugs en ingles en las zonas.** `ZONES` del mapa trae nombres en espanol (Energia, Termico, Comms, Ciencia, Estructura, Propulsion, Radiacion). Los IDs se normalizaron a slugs en ingles segun el esquema exigido; las etiquetas visibles se mantienen en ingles (`Module: ...`) y el resto de la interfaz de las paginas se dejo en espanol, como esta en el codigo existente.
3. **Nombres repetidos entre zonas.** `fire` esta en A, B y E; `command` en C y D; `eclss` en A y C; `energy` en B y C; `thermal` en B y C; `robotics` en D y `robotics/EVA` en E. Son instancias distintas por zona, cada una con su propio `mod-z-<slug>` ID, como exige el objetivo 1.
4. **Zona F con `url: null` en el mapa.** El boton MAP de F no navegaba a ninguna pagina. Se asigno `../zone-f/index.html`.
5. **El contexto describe `web/zona-*.html`, `abrirModulo()` y `toggleMonitor()`, pero el codigo real usa `zone-*/index.html`, poligonos SVG como hotspots, `mapBtn`/`mapHot` y navegacion por hash.** La implementacion se adapto a lo que esta en el codigo y se reporta aqui.
6. **Backend.** `station-backend.py` no tenía entradas de modulos para las zonas `a` ni `f`; se agrego la zona `f`. La zona `a` no usa WebSocket (como antes).

## Archivos implementados

- `store.js` (nuevo): tienda compartida y unica de estado `moduleId -> ok|warn|crit`, persistente en `localStorage` (clave `station-module-status-v1`), expone `window.stationStore` y `window.setModuleStatus(id, 'ok'|'warn'|'crit')` para depuracion.
- `zone-a/...` a `zone-e/...`: tienda cargada primero, pantallas de modulo overlay (`#moduleScreen`), boton `EXIT` con `✕`, `ESC` cierra, boton MAP parpadea segun el estado de la zona y navega con `?alert=Z&level=L`.
- `zone-f/...` (nuevo): misma estructura para la Zona F.
- `station-map/index.html` y `app.js`: lee `store.js`, parpadea las zonas con alerta (estado guardado o parametro URL), el click en una zona parpadeante la marca como vista y navega a ella; `station-zones-v2` y el modo edicion no cambian.
- `station-backend.py`: estado inicial de modulos de la zona F.

## Cambios 2026-11-14 (flujo de fallas)

- **Reiniciar simulaciones:** nuevo botón en el panel del simulador del mapa
  (`#simResetBtn`): cancela todos los temporizadores, pone los 27 módulos en
  `ok` y limpia alertas guardadas y zonas vistas.
- **Escalado:** al elegir un fallo el módulo parpadea en amarillo (`warn`); si
  nadie lo atiende antes del tiempo de revisión pasa a rojo (`crit`).
- **Parpadeo por color:** amarillo 1.2 s, rojo 0.5 s (más rápido). Aplica al
  módulo (polígono), al botón MAP de la zona y a la zona en el mapa.
- **Atender:** SOLO con clic en el módulo que parpadea, dentro de su zona.
  Se quitaron el botón "Resolver falla" y los botones de estado de las
  páginas de zona. Hacer clic en la zona en el mapa ya no atiende ni cancela
  la simulación (solo navega a la zona).
- **Zona F:** sus 4 pantallas agrupadas se sincronizan con la tienda
  (`energy_propulsion` = peor de `energy`/`propulsion`, etc.) y el clic en
  una pantalla que parpadea resuelve sus módulos en la tienda.
- **Corrección:** el slug de un módulo se extrae con
  `moduleId.replace(/^mod-[a-f]-/, "")` (antes `split("-").pop()` devolvía
  `"eva"` para `mod-e-robotics-eva` y el enlace profundo del mapa no abría nada).
- **Corrección:** los polígonos de las zonas A–E ahora se sincronizan con la
  tienda (antes `m.status` quedaba siempre en `ok` y el módulo nunca
  parpadeaba), y el botón MAP de cada zona parpadea solo con sus propias
  alertas (antes era global).

## Cambios 2026-11-14 (2): parpadeo global y pantallas por módulo

- **Parpadeo global:** `updateMapBlink()` ahora usa
  `stationStore.getAnyAlertStatus()` (peor estado de TODA la estación). El
  botón MAP y TODOS los módulos (`.poly`) de la zona actual parpadean con ese
  nivel: amarillo 1.2 s, rojo 0.5 s. Clases nuevas en el CSS de las 6 zonas:
  `.station-alert-warn` y `.station-alert-crit` sobre el SVG.
- **Clic en cualquier módulo abre su pantalla expandida:** se quitó la
  restricción `if (st === "ok") return;` de `openModule()` en las zonas A–E
  (estaba impidiendo abrir la pantalla de un módulo normal). La Zona F ahora
  también tiene overlay (`#moduleScreen` + `#moduleFrame`).
- **Subcarpetas `modulos/`:** cada zona tiene `modulos/<slug>.html`, una
  pantalla básica por módulo (24 archivos en total) con su estado en vivo
  desde la tienda y un espacio para controles y gráficos. El overlay carga
  esa página en un iframe (`#moduleFrame`).
- La apertura automática con `?mod=` sigue desactivada a propósito: el
  jugador abre el módulo haciendo clic en el mapa de la zona.

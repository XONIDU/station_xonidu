/* ===== XONIDU · sonido =====
   - Música de ambiente (audio/ambientacion.mp3) en bucle, continua entre páginas.
   - Sonido de botón (audio/boton.mp3) al hacer clic en botones, zonas y enlaces.
   - Controles de volumen (slider + silenciar) SOLO en el menú, debajo de Datos NASA.
   - Dentro de los iframes de módulos solo suena el botón (sin segunda música).
   - Volumen y silencio se recuerdan en localStorage y se comparten entre pestañas/iframes.
   No modifica ninguna otra lógica del juego ni el backend. */
(function () {
  "use strict";
  var script = document.currentScript;
  var AUDIO = new URL("audio/", new URL("./", script ? script.src : location.href)).href;
  var isFrame = false;
  try { isFrame = window.top !== window.self; } catch (e) { isFrame = true; }

  // Solo el menú muestra los controles de volumen visibles.
  var isMenu = location.pathname.indexOf("/menu/") !== -1;

  var muted = false;
  try { muted = localStorage.getItem("xonidu-muted") === "1"; } catch (e) {}
  var volume = 0.35;
  try { volume = parseFloat(localStorage.getItem("xonidu-volume")) || 0.35; } catch (e) {}
  if (volume < 0) volume = 0; if (volume > 1) volume = 1;

  var amb = null, started = false, playRetries = 0;

  function setMuted(m) {
    muted = m;
    if (amb) amb.muted = muted;
    try { localStorage.setItem("xonidu-muted", muted ? "1" : "0"); } catch (e) {}
    try { localStorage.setItem("xonidu-muted-ts", String(Date.now())); } catch (e) {}
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (amb) amb.volume = volume;
    try { localStorage.setItem("xonidu-volume", String(volume)); } catch (e) {}
    try { localStorage.setItem("xonidu-volume-ts", String(Date.now())); } catch (e) {}
  }

  function startAmbient() {
    if (started || !amb) return;
    var p = amb.play();
    if (p && p.then) {
      p.then(function () { started = true; playRetries = 0; })
       .catch(function () {
         started = false;
         if (playRetries < 3) { playRetries++; setTimeout(startAmbient, 600); }
       });
    } else {
      started = true;
    }
  }

  if (!isFrame) {
    amb = new Audio();
    amb.loop = true;
    amb.volume = volume;
    amb.preload = "auto";
    amb.muted = muted;

    var T_KEY = "xonidu-amb-t";
    var savePos = function () {
      try { if (amb.currentTime > 0) localStorage.setItem(T_KEY, JSON.stringify({ t: amb.currentTime, at: Date.now() })); } catch (e) {}
    };
    var restorePos = function () {
      try {
        var s = JSON.parse(localStorage.getItem(T_KEY) || "null");
        if (!s || !amb.duration) return;
        var t = (s.t + Math.min((Date.now() - s.at) / 1000, 5)) % amb.duration;
        if (isFinite(t)) amb.currentTime = t;
      } catch (e) {}
    };
    amb.addEventListener("loadedmetadata", function () { restorePos(); startAmbient(); });
    setInterval(savePos, 500);
    window.addEventListener("pagehide", savePos);

    // Carga como blob para retomar posicion sin depender de Range del servidor.
    function loadAudio() {
      fetch(AUDIO + "ambientacion.mp3").then(function (r) {
        if (!r.ok) throw 0;
        return r.blob();
      }).then(function (b) {
        amb.src = URL.createObjectURL(b);
      }).catch(function () {
        amb.src = AUDIO + "ambientacion.mp3";
      });
    }
    loadAudio();

    // Los navegadores exigen un gesto del usuario: al primer toque/clic arranca la musica.
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, function once() { startAmbient(); if (started) window.removeEventListener(ev, once, true); }, true);
    });

    // Si volvemos a esta pestaña y la musica ya habia empezado, reintenta reproducir.
    window.addEventListener("focus", function () {
      if (muted) return;
      startAmbient();
    });

    // -------- Controles de volumen (SOLO en el menú, debajo de Datos NASA) --------
    if (isMenu) {
      var css = document.createElement("style");
      css.textContent =
        ".fx-vol-top{display:flex;align-items:center;gap:8px;" +
        "padding:clamp(5px,.5cqw,10px) clamp(9px,1cqw,16px);" +
        "border:1px solid #1e4a5a;background:rgba(8,14,28,.85);color:#dff6ff;" +
        "border-radius:0.8cqw;cursor:default;font-family:inherit;" +
        "font-size:clamp(11px,1.15cqw,16px);text-align:left}" +
        ".fx-vol-top:hover{border-color:#00e5ff;background:#16414f}" +
        ".fx-vol-top .fx-mute{width:auto;height:auto;border-radius:6px;" +
        "border:1px solid #1e4a5a;background:rgba(8,14,28,.8);color:#dff6ff;" +
        "font-size:16px;line-height:1;cursor:pointer;padding:4px 8px}" +
        ".fx-vol-top .fx-mute:hover{border-color:#00e5ff}" +
        ".fx-vol-top .fx-vol-lbl{min-width:30px;text-align:right}" +
        ".fx-vol-top .fx-vol{width:90px;cursor:pointer;accent-color:#00e5ff};" +
        "@media(max-width:820px) and (orientation:portrait){.fx-vol-top{grid-column:1 / 3;width:100%}}";
      document.documentElement.appendChild(css);

      document.addEventListener("DOMContentLoaded", function () {
        var panel = document.querySelector(".top-right-btns");
        if (!panel) return;

        var wrap = document.createElement("div");
        wrap.id = "fx-controls";
        wrap.className = "fx-vol-top";

        var mute = document.createElement("button");
        mute.id = "fx-mute";
        mute.type = "button";
        mute.setAttribute("aria-label", "Silenciar o activar el sonido");

        var lbl = document.createElement("span");
        lbl.id = "fx-vol-lbl";
        lbl.textContent = Math.round(volume * 100) + "%";

        var slider = document.createElement("input");
        slider.id = "fx-vol";
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.value = Math.round(volume * 100);

        var paint = function () {
          mute.textContent = muted ? "🔇" : "🔊";
          lbl.textContent = Math.round(volume * 100) + "%";
        };

        mute.addEventListener("click", function () {
          setMuted(!muted);
          paint();
          if (!muted) startAmbient();
        });

        slider.addEventListener("input", function () {
          setVolume(slider.value / 100);
          muted = false;
          paint();
          startAmbient();
        });

        wrap.appendChild(mute);
        wrap.appendChild(lbl);
        wrap.appendChild(slider);
        paint();

        // Insertar debajo del boton Datos NASA (refreshTopBtn).
        var refresh = document.getElementById("refreshTopBtn");
        if (refresh && refresh.parentNode === panel) {
          panel.appendChild(wrap);
        } else {
          panel.appendChild(wrap);
        }
      });
    }
  }

  // El silencio y el volumen se comparten entre la pagina y los iframes de modulos.
  var _lastMutedTs = null, _lastVolTs = null;
  try { _lastMutedTs = localStorage.getItem("xonidu-muted-ts"); } catch (e) {}
  try { _lastVolTs = localStorage.getItem("xonidu-volume-ts"); } catch (e) {}
  window.addEventListener("storage", function (e) {
    if (e.key === "xonidu-muted") { muted = e.newValue === "1"; if (amb) amb.muted = muted; }
    if (e.key === "xonidu-muted-ts" && e.newValue !== _lastMutedTs) {
      _lastMutedTs = e.newValue;
      try { muted = localStorage.getItem("xonidu-muted") === "1"; } catch (e) {}
      if (amb) amb.muted = muted;
      if (!muted) startAmbient();
    }
    if (e.key === "xonidu-volume") { volume = parseFloat(e.newValue) || 0.35; if (amb) amb.volume = volume; }
    if (e.key === "xonidu-volume-ts" && e.newValue !== _lastVolTs) {
      _lastVolTs = e.newValue;
      try { volume = parseFloat(localStorage.getItem("xonidu-volume")) || 0.35; } catch (e) {}
      if (amb) amb.volume = volume;
    }
  });

  /* ---------- Sonido de boton ---------- */
  var click = new Audio(AUDIO + "boton.mp3");
  click.preload = "auto"; click.volume = 0.7;
  var SEL = "button,a[href],select,summary,.zone,.poly,.maphot,.btn,.zone-grid-btn,.diff-opt,[role=button]";
  document.addEventListener("click", function (e) {
    if (muted || !e.target.closest) return;
    var el = e.target.closest(SEL);
    if (!el || el.disabled || el.id === "fx-mute" || el.id === "fx-vol") return;
    try { var s = click.cloneNode(); s.volume = click.volume; s.play().catch(function () {}); } catch (err) {}
  }, true);
})();

/* Cosmoboard mobile diagnostics probe.
 *
 * Why this exists: the open crash report is "crashing on mobile if you zoom out
 * and in too fast", and it does not reproduce under desktop emulation. On a
 * phone there is usually no inspector attached, and on iOS there is no
 * window.onerror at all when the system kills the WebContent process. So the
 * page has to measure itself, write what it saw somewhere that outlives the
 * crash, and say on the next load that the last session never exited cleanly.
 *
 * Loaded three ways, all equivalent:
 *   1. scripts/mobile-diag-server.mjs injects it when the URL carries ?diag=1
 *   2. a bookmarklet that appends this script tag
 *   3. a plain <script src> in any page
 *
 * It touches no board internals. It reads the DOM, the standard timing APIs and
 * the touch events, nothing else, so it cannot change what it is measuring
 * beyond its own cost. Its own cost is one rAF callback, one localStorage write
 * per second and one beacon every five seconds.
 */
(function () {
  "use strict";

  if (window.__cosmoDiag) return;

  var script = document.currentScript;
  var base = (script && script.src) || window.__cosmoDiagSrc || location.href;
  var SINK = new URL("/diag", base).href;

  var KEY_LIVE = "cosmoDiag:live";
  var KEY_LOG = "cosmoDiag:log";
  var MAX_SAMPLES = 150;
  var BEACON_MS = 5000;
  var LOG_WRITE_MS = 3000;

  // The script a person follows while holding the phone. The phase index rides
  // along in every sample, so the file on the desktop says which step the run
  // was on when it went quiet.
  var PHASES = [
    "1. idle, board just loaded",
    "2. pinch out slowly, all the way",
    "3. pinch in slowly, all the way",
    "4. pinch out and in FAST, 20 times, do not stop",
    "5. drag the board around fast while zoomed out",
    "6. free play, use it normally"
  ];

  var sid = String(Date.now().toString(36)) + "-" + Math.random().toString(36).slice(2, 7);
  var t0 = performance.now();
  var phase = 0;
  var samples = [];
  var events = [];
  var pending = [];
  // Cumulative for the whole session. The per second window keeps its own
  // counts in win, because a summary whose numbers get reset every second is a
  // summary that lies.
  var counters = {
    touchstart: 0, touchmove: 0, touchend: 0, touchcancel: 0,
    maxTouches: 0, gestures: 0, errors: 0, resourceErrors: 0
  };
  var win = { moves: 0, maxTouches: 0 };
  var scaleSeen = { min: Infinity, max: -Infinity };
  var worstFrameEver = 0;
  var peakHeap = 0;

  // ---------------------------------------------------------------- capability
  // Say what is actually readable on this device rather than assuming. Chromium
  // gives performance.memory and navigator.deviceMemory. WebKit on iOS gives
  // neither, so on an iPhone the memory columns are empty by design and frame
  // timing plus the crash breadcrumb are the whole instrument.
  function caps() {
    var c = {
      jsHeap: !!(performance && performance.memory && performance.memory.usedJSHeapSize),
      deviceMemory: typeof navigator.deviceMemory === "number",
      measureUserAgentSpecificMemory: typeof performance.measureUserAgentSpecificMemory === "function",
      crossOriginIsolated: !!window.crossOriginIsolated,
      longTaskObserver: false,
      visualViewport: !!window.visualViewport,
      sendBeacon: typeof navigator.sendBeacon === "function",
      pointerEvents: typeof window.PointerEvent === "function",
      maxTouchPoints: navigator.maxTouchPoints || 0
    };
    try {
      var types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
      c.longTaskObserver = types.indexOf("longtask") !== -1;
      c.entryTypes = Array.prototype.slice.call(types);
    } catch (e) { /* older engines throw on the static read */ }
    return c;
  }

  function env() {
    var vv = window.visualViewport;
    return {
      ua: navigator.userAgent,
      platform: navigator.platform || "",
      dpr: window.devicePixelRatio || 1,
      screen: [screen.width, screen.height],
      inner: [window.innerWidth, window.innerHeight],
      visualViewport: vv ? [Math.round(vv.width), Math.round(vv.height), vv.scale] : null,
      deviceMemoryGB: typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null,
      cores: navigator.hardwareConcurrency || null,
      standalone: navigator.standalone === true,
      url: location.href,
      caps: caps()
    };
  }

  // -------------------------------------------------------------- crash record
  // The whole point of the localStorage record. It is rewritten once a second
  // with clean:false, and only pagehide sets clean:true. A load that finds
  // clean:false left behind means the last session died where it stood: a tab
  // crash, an out-of-memory kill, or the browser being force quit. That is the
  // only signal iOS gives you without a Mac attached.
  var previous = null;
  try {
    var rawPrev = localStorage.getItem(KEY_LIVE);
    if (rawPrev) previous = JSON.parse(rawPrev);
  } catch (e) { /* private mode or a corrupt record, ignore */ }
  var suspectedCrash = !!(previous && previous.clean === false);

  function writeLive(clean) {
    try {
      localStorage.setItem(KEY_LIVE, JSON.stringify({
        sid: sid,
        clean: !!clean,
        at: new Date().toISOString(),
        t: Math.round(performance.now() - t0),
        phase: phase,
        phaseText: PHASES[phase],
        last: samples.length ? samples[samples.length - 1] : null,
        worstFrame: worstFrameEver,
        peakHeapMB: peakHeap || null,
        errors: counters.errors,
        scale: [
          scaleSeen.min === Infinity ? null : round(scaleSeen.min, 3),
          scaleSeen.max === -Infinity ? null : round(scaleSeen.max, 3)
        ],
        ua: navigator.userAgent
      }));
    } catch (e) { /* quota, private mode */ }
  }

  function writeLog() {
    try {
      localStorage.setItem(KEY_LOG, JSON.stringify({ sid: sid, env: env(), samples: samples, events: events }));
    } catch (e) { /* quota */ }
  }

  // ------------------------------------------------------------------ transport
  function send(records) {
    if (!records.length) return;
    var body = JSON.stringify({ sid: sid, records: records });
    // sendBeacon is the only transport that survives the page going away, which
    // is exactly the case being measured. text/plain keeps it a simple request
    // so it works even when the probe was loaded from another origin.
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(SINK, new Blob([body], { type: "text/plain" }))) return;
    } catch (e) { /* fall through */ }
    try {
      fetch(SINK, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
    } catch (e) { /* offline or no collector, the on-screen log still holds it */ }
  }

  function push(rec) {
    rec.t = Math.round(performance.now() - t0);
    rec.phase = phase;
    pending.push(rec);
    if (rec.kind === "sample") {
      samples.push(rec);
      if (samples.length > MAX_SAMPLES) samples.shift();
    } else {
      events.push(rec);
      if (events.length > 60) events.shift();
      send(pending.splice(0, pending.length)); // errors and phase changes go out at once
    }
  }

  function round(n, d) {
    var f = Math.pow(10, d || 1);
    return Math.round(n * f) / f;
  }

  // ------------------------------------------------------------- frame sampler
  var frames = 0;
  var worst = 0;
  var jank = 0;
  var lastFrame = performance.now();
  var windowStart = lastFrame;

  function boardScale() {
    var el = document.querySelector(".braindump-canvas");
    if (!el) return null;
    var m = /scale\(([\d.]+)\)/.exec(el.style.transform || "");
    return m ? Number(m[1]) : null;
  }

  function heapMB() {
    try {
      if (performance.memory && performance.memory.usedJSHeapSize) {
        return round(performance.memory.usedJSHeapSize / 1048576, 1);
      }
    } catch (e) { /* not Chromium */ }
    return null;
  }

  var domNodes = 0;
  function tick(now) {
    var dt = now - lastFrame;
    lastFrame = now;
    frames++;
    if (dt > worst) worst = dt;
    if (dt > 50) jank++;
    if (dt > worstFrameEver) worstFrameEver = Math.round(dt);

    var s = boardScale();
    if (s !== null) {
      if (s < scaleSeen.min) scaleSeen.min = s;
      if (s > scaleSeen.max) scaleSeen.max = s;
    }

    if (now - windowStart >= 1000) {
      var span = now - windowStart;
      domNodes = document.getElementsByTagName("*").length;
      var h = heapMB();
      if (h && h > peakHeap) peakHeap = h;
      push({
        kind: "sample",
        fps: round(frames * 1000 / span, 1),
        worst: Math.round(worst),
        jank: jank,
        heapMB: h,
        nodes: domNodes,
        scale: s === null ? null : round(s, 3),
        vvScale: window.visualViewport ? round(window.visualViewport.scale, 2) : null,
        touches: win.maxTouches,
        moves: win.moves
      });
      frames = 0; worst = 0; jank = 0; windowStart = now;
      win.maxTouches = 0;
      win.moves = 0;
      writeLive(false);
      paint();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  var lastBeacon = performance.now();
  var lastLogWrite = performance.now();
  setInterval(function () {
    var now = performance.now();
    if (now - lastBeacon >= BEACON_MS && pending.length) {
      send(pending.splice(0, pending.length));
      lastBeacon = now;
    }
    if (now - lastLogWrite >= LOG_WRITE_MS) {
      writeLog();
      lastLogWrite = now;
    }
  }, 1000);

  // ---------------------------------------------------------------- error trap
  // Capture phase, because a resource that fails to load does not bubble. That
  // also means this listener sees two different things: a thrown script error
  // and an <img> or <script> that 404ed. They are counted apart, or a board
  // with one missing asset reads as a board throwing errors.
  window.addEventListener("error", function (e) {
    var target = e && e.target;
    if (target && target !== window && target.tagName) {
      counters.resourceErrors++;
      push({
        kind: "resource",
        tag: String(target.tagName).toLowerCase(),
        src: String(target.currentSrc || target.src || target.href || "")
      });
      paint();
      return;
    }
    counters.errors++;
    push({
      kind: "error",
      msg: e && e.message ? String(e.message) : "error",
      src: e && e.filename ? String(e.filename) : "",
      line: e && e.lineno
    });
    paint();
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    counters.errors++;
    var r = e && e.reason;
    push({ kind: "rejection", msg: String((r && (r.message || r)) || "rejection") });
    paint();
  });

  // --------------------------------------------------------------- touch trace
  // Passive listeners in the capture phase, so nothing here can change how the
  // board reacts to a gesture.
  function touch(name) {
    return function (e) {
      counters[name]++;
      var n = e.touches ? e.touches.length : 0;
      if (n > counters.maxTouches) counters.maxTouches = n;
      if (n > win.maxTouches) win.maxTouches = n;
      if (name === "touchmove") win.moves++;
      if (name === "touchstart" && n === 2) counters.gestures++;
    };
  }
  ["touchstart", "touchmove", "touchend", "touchcancel"].forEach(function (name) {
    window.addEventListener(name, touch(name), { capture: true, passive: true });
  });

  // --------------------------------------------------------------- page events
  ["pagehide", "freeze", "resume", "visibilitychange"].forEach(function (name) {
    window.addEventListener(name, function () {
      var clean = name === "pagehide";
      push({ kind: "lifecycle", event: name, visibility: document.visibilityState });
      if (clean) {
        writeLog();
        writeLive(true);
        send(pending.splice(0, pending.length));
      }
    });
  });

  // ---------------------------------------------------------------------- HUD
  var hud = null, badge = null, panel = null, dump = null;

  function css(el, text) { el.style.cssText = text; }

  function buildHud() {
    if (hud || !document.body) return;
    hud = document.createElement("div");
    hud.id = "cosmo-diag-hud";
    css(hud, "position:fixed;top:6px;left:6px;z-index:2147483647;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;" +
      "color:#d7fff4;pointer-events:none;max-width:min(92vw,420px)");

    badge = document.createElement("button");
    badge.type = "button";
    css(badge, "pointer-events:auto;display:block;margin:0;padding:4px 7px;border:1px solid #1f6f63;border-radius:6px;" +
      "background:rgba(8,20,18,.86);color:#7fe9d2;font:inherit;text-align:left;white-space:pre;-webkit-tap-highlight-color:transparent");
    badge.textContent = "diag";
    badge.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) refreshDump();
      paint();
    });

    panel = document.createElement("div");
    panel.hidden = true;
    css(panel, "pointer-events:auto;margin-top:4px;padding:7px;border:1px solid #1f6f63;border-radius:6px;" +
      "background:rgba(8,20,18,.94);max-height:62vh;overflow:auto;-webkit-overflow-scrolling:touch");

    var row = document.createElement("div");
    css(row, "display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px");
    row.appendChild(button("next step", function () {
      phase = (phase + 1) % PHASES.length;
      push({ kind: "phase", text: PHASES[phase] });
      paint();
    }));
    row.appendChild(button("copy", function () {
      var text = reportText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { flash("copied"); }, function () { selectDump(); });
      } else { selectDump(); }
    }));
    row.appendChild(button("save file", function () {
      var blob = new Blob([reportText()], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "cosmo-diag-" + sid + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }));
    row.appendChild(button("send now", function () {
      send(samples.concat(events).concat([{ kind: "manual", t: Math.round(performance.now() - t0), phase: phase }]));
      flash("sent");
    }));
    row.appendChild(button("clear crash flag", function () {
      try { localStorage.removeItem(KEY_LIVE); } catch (e) {}
      suspectedCrash = false;
      paint();
    }));
    panel.appendChild(row);

    dump = document.createElement("textarea");
    dump.readOnly = true;
    css(dump, "width:100%;min-height:150px;background:#04100e;color:#9ff0dd;border:1px solid #14453d;border-radius:4px;" +
      "font:10px/1.3 ui-monospace,Menlo,Consolas,monospace;padding:5px;-webkit-user-select:text;user-select:text");
    panel.appendChild(dump);

    hud.appendChild(badge);
    hud.appendChild(panel);
    document.body.appendChild(hud);
    paint();
  }

  function button(label, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    css(b, "pointer-events:auto;padding:5px 8px;border:1px solid #1f6f63;border-radius:5px;background:#0d2622;color:#7fe9d2;" +
      "font:inherit;-webkit-tap-highlight-color:transparent");
    b.addEventListener("click", fn);
    return b;
  }

  function flash(text) {
    var was = badge.textContent;
    badge.textContent = text;
    setTimeout(function () { badge.textContent = was; paint(); }, 900);
  }

  function selectDump() {
    dump.focus();
    dump.setSelectionRange(0, dump.value.length);
  }

  function paint() {
    if (!badge) return;
    var s = samples.length ? samples[samples.length - 1] : null;
    var lines = [
      (suspectedCrash ? "CRASHED LAST RUN  " : "") + PHASES[phase],
      "fps " + (s ? s.fps : "-") +
        "  worst " + (s ? s.worst + "ms" : "-") +
        (s && s.heapMB ? "  heap " + s.heapMB + "MB" : "  heap n/a"),
      "scale " + (s && s.scale !== null ? s.scale : "-") +
        "  nodes " + (s ? s.nodes : "-") +
        "  err " + counters.errors +
        (counters.resourceErrors ? "  404s " + counters.resourceErrors : "")
    ];
    badge.textContent = lines.join("\n");
    badge.style.borderColor = counters.errors || suspectedCrash ? "#c2554a" : "#1f6f63";
    if (panel && !panel.hidden) refreshDump();
  }

  function report() {
    return {
      sid: sid,
      at: new Date().toISOString(),
      env: env(),
      previousSession: previous,
      suspectedCrash: suspectedCrash,
      phase: PHASES[phase],
      counters: counters,
      worstFrameMs: worstFrameEver,
      peakHeapMB: peakHeap || null,
      scaleRange: [
        scaleSeen.min === Infinity ? null : round(scaleSeen.min, 3),
        scaleSeen.max === -Infinity ? null : round(scaleSeen.max, 3)
      ],
      events: events,
      samples: samples
    };
  }

  function reportText() { return JSON.stringify(report(), null, 1); }
  function refreshDump() { if (dump) dump.value = reportText(); }

  if (document.body) buildHud();
  else document.addEventListener("DOMContentLoaded", buildHud);

  // Opening record. Carries the environment and, if the last run died, what it
  // was doing when it did.
  push({ kind: "hello", env: env(), previousSession: previous, suspectedCrash: suspectedCrash });
  writeLive(false);

  window.__cosmoDiag = {
    report: report,
    samples: samples,
    events: events,
    counters: counters,
    phases: PHASES,
    setPhase: function (i) { phase = i % PHASES.length; push({ kind: "phase", text: PHASES[phase] }); paint(); },
    flush: function () { send(pending.splice(0, pending.length)); },
    suspectedCrash: function () { return suspectedCrash; }
  };
})();

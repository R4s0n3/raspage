/*
 * Touch becomes water.
 *
 * A coarse height field runs the 2D wave equation. Pointer strokes deposit
 * small drops along their path; each drop spreads, overlaps, and fades. The
 * shader samples the surface to bend the clouds and light the crests, and the
 * light streams ride the surface slope.
 *
 * The same drops can come from another person in the room: realtime.js feeds
 * remote drops and strokes through addDrop() and addStroke(). All amplitudes
 * live in mood.js.
 */
(() => {
  "use strict";

  const mood = window.MOOD || {};
  const settings = mood.interaction || {};
  const config = {
    rows: settings.rows ?? 96,
    radius: settings.radius ?? 2.8,
    drop: settings.drop ?? 0.06,
    tap: settings.tap ?? 0.6,
    spacing: settings.spacing ?? 2.2,
    speed: settings.speed ?? 0.27,
    damping: settings.damping ?? 0.996,
    streamPush: settings.streamPush ?? 900,
    warp: settings.warp ?? 1.0,
    glow: settings.glow ?? 0.2,
    reducedMotionScale: settings.reducedMotionScale ?? 0.35,
    ink: settings.ink ?? 0,
    inkRadius: settings.inkRadius ?? (settings.radius ?? 2.8) * 0.6,
    inkFade: settings.inkFade ?? 0.996,
    inkSpread: settings.inkSpread ?? 0.08,
    inkFlow: settings.inkFlow ?? 2.5,
  };

  // The surface gradient is stored next to the height so the shader can
  // interpolate smooth normals instead of differencing 8-bit heights.
  const GRADIENT_SCALE = 3;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    width: window.innerWidth,
    height: window.innerHeight,
    drawing: false,
    motionScale: reduce.matches ? config.reducedMotionScale : 1,
    wave: null,
    // Where the water was last touched (local or remote), normalized 0..1.
    touch: null,
  };

  const remember = (nx, ny) => {
    state.touch = { x: clamp(nx, 0, 1), y: clamp(ny, 0, 1), at: performance.now() };
  };

  const localListeners = new Set();
  const onLocalGesture = (listener) => {
    localListeners.add(listener);
    return () => localListeners.delete(listener);
  };
  const emitLocal = (gesture) => {
    for (const listener of localListeners) {
      try {
        listener(gesture);
      } catch {
        // A broken listener must not stop the water.
      }
    }
  };

  let waveWidth = 0;
  let waveHeight = 0;
  let current = null;
  let previous = null;
  let next = null;
  let ink = null;
  let inkNext = null;
  let inkLevel = 0;
  let data = null;
  let accumulator = 0;
  let activePointer = null;
  let lastX = 0;
  let lastY = 0;
  let lastSentX = 0;
  let lastSentY = 0;
  let lastSentAt = 0;
  let active = true;
  let last = performance.now();
  let raf = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const allocate = () => {
    const aspect = state.width / Math.max(state.height, 1);
    const rows = clamp(Math.round(config.rows), 48, 160);
    const cols = clamp(Math.round(rows * aspect), 48, 220);

    if (cols === waveWidth && rows === waveHeight) {
      return;
    }

    waveWidth = cols;
    waveHeight = rows;
    const size = cols * rows;
    current = new Float32Array(size);
    previous = new Float32Array(size);
    next = new Float32Array(size);
    ink = new Float32Array(size);
    inkNext = new Float32Array(size);
    inkLevel = 0;
    data = new Uint8Array(size * 4);

    for (let i = 0; i < size; i += 1) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = 0;
    }

    state.wave = { width: cols, height: rows, data };
    accumulator = 0;
  };

  // R: height, G/B: slope, A: ink. All centred on 0.5 except ink.
  const encode = () => {
    if (!data) {
      return;
    }
    const d = data;
    const cols = waveWidth;
    const rows = waveHeight;
    for (let y = 0; y < rows; y += 1) {
      const row = y * cols;
      const up = y > 0 ? row - cols : row;
      const down = y < rows - 1 ? row + cols : row;
      for (let x = 0; x < cols; x += 1) {
        const i = row + x;
        const left = x > 0 ? i - 1 : i;
        const right = x < cols - 1 ? i + 1 : i;
        const gx = (current[right] - current[left]) * 0.5;
        const gy = (current[down + x] - current[up + x]) * 0.5;
        const o = i * 4;
        d[o] = Math.round(clamp(0.5 + current[i], 0, 1) * 255);
        d[o + 1] = Math.round(clamp(0.5 + gx * GRADIENT_SCALE, 0, 1) * 255);
        d[o + 2] = Math.round(clamp(0.5 + gy * GRADIENT_SCALE, 0, 1) * 255);
        d[o + 3] = Math.round(clamp(ink[i], 0, 1) * 255);
      }
    }
  };

  // Ink drawn into the water: it runs down the slope of the ripples,
  // spreads a little, and fades. Nothing stays.
  const stepInk = () => {
    if (inkLevel <= 0) {
      return;
    }

    const cols = waveWidth;
    const rows = waveHeight;
    const fade = config.inkFade;
    const spread = config.inkSpread;
    const flow = config.inkFlow;
    let level = 0;

    for (let y = 1; y < rows - 1; y += 1) {
      const row = y * cols;
      for (let x = 1; x < cols - 1; x += 1) {
        const i = row + x;
        const gx = (current[i + 1] - current[i - 1]) * 0.5;
        const gy = (current[i + cols] - current[i - cols]) * 0.5;

        // Trace back against the flow and read what was there.
        const sx = clamp(x + gx * flow, 0, cols - 1.001);
        const sy = clamp(y + gy * flow, 0, rows - 1.001);
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;
        const j = iy * cols + ix;
        const top = ink[j] + (ink[j + 1] - ink[j]) * fx;
        const bottom = ink[j + cols] + (ink[j + cols + 1] - ink[j + cols]) * fx;
        const carried = top + (bottom - top) * fy;

        const around =
          (ink[i - 1] + ink[i + 1] + ink[i - cols] + ink[i + cols]) * 0.25;
        const value = Math.max(
          0,
          (carried + (around - carried) * spread) * fade - 0.0003,
        );
        inkNext[i] = value;
        if (value > level) {
          level = value;
        }
      }
    }

    const swap = ink;
    ink = inkNext;
    inkNext = swap;
    inkLevel = level;
  };

  const depositInk = (nx, ny, amount, radiusScale = 1) => {
    if (!ink || amount <= 0) {
      return;
    }

    const cx = clamp(nx, 0, 1) * (waveWidth - 1);
    const cy = clamp(ny, 0, 1) * (waveHeight - 1);
    const radius = Math.max(0.6, config.inkRadius * radiusScale);
    const reach = Math.ceil(radius * 2);
    const sigma = radius * radius;

    for (let y = Math.round(cy) - reach; y <= Math.round(cy) + reach; y += 1) {
      if (y < 1 || y >= waveHeight - 1) {
        continue;
      }
      for (let x = Math.round(cx) - reach; x <= Math.round(cx) + reach; x += 1) {
        if (x < 1 || x >= waveWidth - 1) {
          continue;
        }
        const dx = x - cx;
        const dy = y - cy;
        const distance = (dx * dx + dy * dy) / sigma;
        if (distance > 4) {
          continue;
        }
        const i = y * waveWidth + x;
        ink[i] = Math.min(1, ink[i] + amount * Math.exp(-distance * 1.6));
        if (ink[i] > inkLevel) {
          inkLevel = ink[i];
        }
      }
    }
  };

  const stepWave = () => {
    const cols = waveWidth;
    const rows = waveHeight;
    const c2 = config.speed;
    const damping = config.damping;
    const edge = 6;

    for (let y = 1; y < rows - 1; y += 1) {
      const row = y * cols;
      for (let x = 1; x < cols - 1; x += 1) {
        const i = row + x;
        const laplacian =
          current[i - 1] +
          current[i + 1] +
          current[i - cols] +
          current[i + cols] -
          4 * current[i];
        let value =
          (2 * current[i] - previous[i] + c2 * laplacian) * damping;

        if (
          x < edge ||
          x > cols - 1 - edge ||
          y < edge ||
          y > rows - 1 - edge
        ) {
          value *= 0.96;
        }

        next[i] = value;
      }

      next[row] = 0;
      next[row + cols - 1] = 0;
    }

    for (let x = 0; x < cols; x += 1) {
      next[x] = 0;
      next[(rows - 1) * cols + x] = 0;
    }

    const swap = previous;
    previous = current;
    current = next;
    next = swap;
  };

  const deposit = (nx, ny, amplitude) => {
    if (!current) {
      return;
    }

    const cx = clamp(nx, 0, 1) * (waveWidth - 1);
    const cy = clamp(ny, 0, 1) * (waveHeight - 1);
    const radius = Math.max(0.8, config.radius);
    const reach = Math.ceil(radius * 2);
    const centerX = Math.round(cx);
    const centerY = Math.round(cy);
    const sigma = radius * radius;

    for (let y = centerY - reach; y <= centerY + reach; y += 1) {
      if (y < 1 || y >= waveHeight - 1) {
        continue;
      }
      for (let x = centerX - reach; x <= centerX + reach; x += 1) {
        if (x < 1 || x >= waveWidth - 1) {
          continue;
        }

        const dx = x - cx;
        const dy = y - cy;
        const distance = (dx * dx + dy * dy) / sigma;
        if (distance > 4) {
          continue;
        }

        const falloff = Math.exp(-distance * 1.8);
        const i = y * waveWidth + x;
        current[i] += amplitude * falloff;
        previous[i] += amplitude * falloff;
      }
    }
  };

  const addDrop = (nx, ny, multiplier = 1) => {
    remember(nx, ny);
    deposit(nx, ny, config.tap * clamp(multiplier, 0, 1));
    depositInk(nx, ny, config.ink * 0.9 * clamp(multiplier, 0, 1), 1.5);
    encode();
  };

  const addStroke = (x0, y0, x1, y1, multiplier = 1) => {
    if (!current) {
      return;
    }
    remember(x1, y1);

    const dx = (x1 - x0) * (waveWidth - 1);
    const dy = (y1 - y0) * (waveHeight - 1);
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.8, config.spacing)));
    const amplitude = config.drop * clamp(multiplier, 0, 1);

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      deposit(x, y, amplitude);
      depositInk(x, y, config.ink * 0.6 * clamp(multiplier, 0, 1));
    }

    encode();
  };

  const point = (event) => ({
    x: clamp(event.clientX / Math.max(state.width, 1), 0, 1),
    y: clamp(event.clientY / Math.max(state.height, 1), 0, 1),
  });

  const onPointerDown = (event) => {
    if (activePointer !== null) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointer = event.pointerId;
    state.drawing = true;
    const p = point(event);
    lastX = p.x;
    lastY = p.y;
    lastSentX = p.x;
    lastSentY = p.y;
    lastSentAt = performance.now();

    addDrop(p.x, p.y, 1);
    emitLocal({ t: "drop", x: p.x, y: p.y, s: 1 });

    try {
      document.documentElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nicety; dragging still works without it.
    }
  };

  const onPointerMove = (event) => {
    if (!state.drawing || event.pointerId !== activePointer) {
      return;
    }

    const p = point(event);
    if (Math.hypot(p.x - lastX, p.y - lastY) < 0.0005) {
      return;
    }

    addStroke(lastX, lastY, p.x, p.y, 1);
    lastX = p.x;
    lastY = p.y;

    const now = performance.now();
    if (now - lastSentAt > 20) {
      emitLocal({
        t: "stroke",
        x0: lastSentX,
        y0: lastSentY,
        x1: p.x,
        y1: p.y,
        s: 1,
      });
      lastSentX = p.x;
      lastSentY = p.y;
      lastSentAt = now;
    }
  };

  const finishPointer = (event, canceled) => {
    if (event.pointerId !== activePointer) {
      return;
    }

    if (!canceled && (lastSentX !== lastX || lastSentY !== lastY)) {
      emitLocal({
        t: "stroke",
        x0: lastSentX,
        y0: lastSentY,
        x1: lastX,
        y1: lastY,
        s: 1,
      });
    }

    state.drawing = false;
    activePointer = null;

    try {
      document.documentElement.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released.
    }
  };

  const onPointerUp = (event) => finishPointer(event, false);
  const onPointerCancel = (event) => finishPointer(event, true);

  const release = () => {
    state.drawing = false;
    activePointer = null;
  };

  const onResize = () => {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    allocate();
  };

  const frame = (now) => {
    if (!active) {
      return;
    }

    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    state.motionScale = reduce.matches ? config.reducedMotionScale : 1;

    const timeScale = reduce.matches ? 0.6 : 1;
    accumulator += dt * timeScale;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 4) {
      stepWave();
      stepInk();
      accumulator -= 1 / 60;
      steps += 1;
    }
    if (steps > 0) {
      encode();
    }

    raf = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (active) {
      return;
    }
    active = true;
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  };

  const stop = () => {
    active = false;
    window.cancelAnimationFrame(raf);
  };

  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
      release();
      accumulator = 0;
    } else {
      start();
    }
  });

  reduce.addEventListener("change", () => {
    state.motionScale = reduce.matches ? config.reducedMotionScale : 1;
    last = performance.now();
  });

  allocate();

  window.MOODPAGE_INTERACTION = {
    state,
    config,
    addDrop,
    addStroke,
    onLocalGesture,
  };

  raf = window.requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();

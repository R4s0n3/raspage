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
 * live in the mood.
 *
 * MOODPAGE.createWater(element, mood, options) makes one surface for one
 * element. Pointers are read relative to that element, so several moodpages
 * can live on one screen.
 */
(() => {
  "use strict";

  const MOODPAGE = (window.MOODPAGE = window.MOODPAGE || {});

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const configFrom = (mood) => {
    const settings = mood.interaction || {};
    return {
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
  };

  // Each person in a room draws in their own colour. The relay assigns a
  // slot; the colours come from the mood (water.inkColors), or a single
  // light-to-glow blend when the mood does not name any.
  const hexToRgb = (hex) => {
    let value = String(hex || "").replace("#", "").trim();
    if (value.length === 3) {
      value = value.split("").map((part) => part + part).join("");
    }
    const number = Number.parseInt(value || "ffffff", 16);
    return [
      ((number >> 16) & 255) / 255,
      ((number >> 8) & 255) / 255,
      (number & 255) / 255,
    ];
  };
  const inkColorsFrom = (mood) => {
    const named = mood.water?.inkColors;
    if (Array.isArray(named) && named.length > 0) {
      return named.map(hexToRgb);
    }
    const light = hexToRgb(mood.palette?.light ?? "#e8e4d4");
    const glow = hexToRgb(mood.palette?.glow ?? "#ffc080");
    return [light.map((value, i) => value + (glow[i] - value) * 0.35)];
  };

  MOODPAGE.createWater = (element, initialMood = {}, options = {}) => {
    const interactive = options.interactive !== false;
    const config = configFrom(initialMood);
    let inkColors = inkColorsFrom(initialMood);
    const inkColor = (slot) =>
      inkColors[((Math.round(slot) || 0) % inkColors.length + inkColors.length) % inkColors.length];

    // The surface gradient is stored next to the height so the shader can
    // interpolate smooth normals instead of differencing 8-bit heights.
    const GRADIENT_SCALE = 3;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const state = {
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
      drawing: false,
      motionScale: reduce.matches ? config.reducedMotionScale : 1,
      wave: null,
      // This visitor's colour slot; realtime.js sets it from the relay.
      slot: 0,
      // Where the water was last touched (local or remote), normalized 0..1.
      touch: null,
    };

    // Anything that wants to feel the water being touched, locally or by
    // someone else in the room, gets each gesture as a normalized segment.
    const disturbListeners = new Set();
    const onDisturb = (listener) => {
      disturbListeners.add(listener);
      return () => disturbListeners.delete(listener);
    };

    const remember = (x0, y0, x1 = x0, y1 = y0) => {
      state.touch = { x: clamp(x1, 0, 1), y: clamp(y1, 0, 1), at: performance.now() };
      for (const listener of disturbListeners) {
        try {
          listener({ x0, y0, x1, y1 });
        } catch {
          // A broken listener must not stop the water.
        }
      }
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
    // Ink: amount, plus the same ink premultiplied by its colour.
    let ink = null;
    let inkR = null;
    let inkG = null;
    let inkB = null;
    let inkNext = null;
    let inkRNext = null;
    let inkGNext = null;
    let inkBNext = null;
    let inkLevel = 0;
    let tint = null;
    let data = null;
    let accumulator = 0;
    let active = true;
    let last = performance.now();
    let raf = 0;

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
      inkR = new Float32Array(size);
      inkG = new Float32Array(size);
      inkB = new Float32Array(size);
      inkNext = new Float32Array(size);
      inkRNext = new Float32Array(size);
      inkGNext = new Float32Array(size);
      inkBNext = new Float32Array(size);
      inkLevel = 0;
      data = new Uint8Array(size * 4);
      tint = new Uint8Array(size * 4);

      for (let i = 0; i < size; i += 1) {
        data[i * 4] = 128;
        data[i * 4 + 1] = 128;
        data[i * 4 + 2] = 128;
        data[i * 4 + 3] = 0;
      }

      state.wave = { width: cols, height: rows, data, tint };
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
          tint[o] = Math.round(clamp(inkR[i], 0, 1) * 255);
          tint[o + 1] = Math.round(clamp(inkG[i], 0, 1) * 255);
          tint[o + 2] = Math.round(clamp(inkB[i], 0, 1) * 255);
          tint[o + 3] = 255;
        }
      }
    };

    // Ink drawn into the water: it runs down the slope of the ripples,
    // spreads a little, and fades. Nothing stays. The coloured channels move
    // with the amount, so each person's colour stays their own.
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

      const carry = (field, j, fx, fy) => {
        const top = field[j] + (field[j + 1] - field[j]) * fx;
        const bottom = field[j + cols] + (field[j + cols + 1] - field[j + cols]) * fx;
        return top + (bottom - top) * fy;
      };
      const around = (field, i) =>
        (field[i - 1] + field[i + 1] + field[i - cols] + field[i + cols]) * 0.25;

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

          const amount = carry(ink, j, fx, fy);
          const next = Math.max(
            0,
            (amount + (around(ink, i) - amount) * spread) * fade - 0.0003,
          );
          // Keep the colour in proportion as the amount fades to nothing.
          const r = carry(inkR, j, fx, fy);
          const g = carry(inkG, j, fx, fy);
          const b = carry(inkB, j, fx, fy);
          const mixedR = r + (around(inkR, i) - r) * spread;
          const mixedG = g + (around(inkG, i) - g) * spread;
          const mixedB = b + (around(inkB, i) - b) * spread;
          const mixedAmount = amount + (around(ink, i) - amount) * spread;
          const scale = mixedAmount > 1e-5 ? next / mixedAmount : 0;

          inkNext[i] = next;
          inkRNext[i] = mixedR * scale;
          inkGNext[i] = mixedG * scale;
          inkBNext[i] = mixedB * scale;
          if (next > level) {
            level = next;
          }
        }
      }

      let swap = ink;
      ink = inkNext;
      inkNext = swap;
      swap = inkR;
      inkR = inkRNext;
      inkRNext = swap;
      swap = inkG;
      inkG = inkGNext;
      inkGNext = swap;
      swap = inkB;
      inkB = inkBNext;
      inkBNext = swap;
      inkLevel = level;
    };

    const depositInk = (nx, ny, amount, color, radiusScale = 1) => {
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
          const add = amount * Math.exp(-distance * 1.6);
          let total = ink[i] + add;
          inkR[i] += add * color[0];
          inkG[i] += add * color[1];
          inkB[i] += add * color[2];
          if (total > 1) {
            // Full: keep the mix, cap the amount.
            const scale = 1 / total;
            inkR[i] *= scale;
            inkG[i] *= scale;
            inkB[i] *= scale;
            total = 1;
          }
          ink[i] = total;
          if (total > inkLevel) {
            inkLevel = total;
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

    const addDrop = (nx, ny, multiplier = 1, slot = state.slot) => {
      remember(nx, ny);
      deposit(nx, ny, config.tap * clamp(multiplier, 0, 1));
      depositInk(
        nx,
        ny,
        config.ink * 0.9 * clamp(multiplier, 0, 1),
        inkColor(slot),
        1.5,
      );
      encode();
    };

    const addStroke = (x0, y0, x1, y1, multiplier = 1, slot = state.slot) => {
      if (!current) {
        return;
      }
      remember(x0, y0, x1, y1);

      const dx = (x1 - x0) * (waveWidth - 1);
      const dy = (y1 - y0) * (waveHeight - 1);
      const distance = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(distance / Math.max(0.8, config.spacing)));
      const amplitude = config.drop * clamp(multiplier, 0, 1);
      const color = inkColor(slot);

      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        deposit(x, y, amplitude);
        depositInk(x, y, config.ink * 0.6 * clamp(multiplier, 0, 1), color);
      }

      encode();
    };

    const point = (event) => {
      const rect = element.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      };
    };

    // Every finger draws its own line. A gesture keeps where it last drew and
    // where it was last sent to the room.
    const MAX_POINTERS = 5;
    const SEND_INTERVAL = 20; // ms per pointer; more fingers send less often
    const pointers = new Map();

    const sendStroke = (pointer, now) => {
      emitLocal({
        t: "stroke",
        x0: pointer.sentX,
        y0: pointer.sentY,
        x1: pointer.x,
        y1: pointer.y,
        s: 1,
      });
      pointer.sentX = pointer.x;
      pointer.sentY = pointer.y;
      pointer.sentAt = now;
    };

    const onPointerDown = (event) => {
      if (pointers.has(event.pointerId) || pointers.size >= MAX_POINTERS) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const p = point(event);
      pointers.set(event.pointerId, {
        x: p.x,
        y: p.y,
        sentX: p.x,
        sentY: p.y,
        sentAt: performance.now(),
      });
      state.drawing = true;

      addDrop(p.x, p.y, 1);
      emitLocal({ t: "drop", x: p.x, y: p.y, s: 1 });

      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is a nicety; dragging still works without it.
      }
    };

    const onPointerMove = (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) {
        return;
      }

      const p = point(event);
      if (Math.hypot(p.x - pointer.x, p.y - pointer.y) < 0.0005) {
        return;
      }

      addStroke(pointer.x, pointer.y, p.x, p.y, 1);
      pointer.x = p.x;
      pointer.y = p.y;

      // Keep the whole hand within the relay's message budget.
      const now = performance.now();
      if (now - pointer.sentAt > SEND_INTERVAL * pointers.size) {
        sendStroke(pointer, now);
      }
    };

    const finishPointer = (event, canceled) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) {
        return;
      }

      if (!canceled && (pointer.sentX !== pointer.x || pointer.sentY !== pointer.y)) {
        sendStroke(pointer, performance.now());
      }

      pointers.delete(event.pointerId);
      state.drawing = pointers.size > 0;

      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already be released.
      }
    };

    const onPointerUp = (event) => finishPointer(event, false);
    const onPointerCancel = (event) => finishPointer(event, true);

    const release = () => {
      state.drawing = false;
      pointers.clear();
    };

    const onResize = () => {
      state.width = Math.max(1, element.clientWidth);
      state.height = Math.max(1, element.clientHeight);
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

    const resume = () => {
      if (active) {
        return;
      }
      active = true;
      last = performance.now();
      raf = window.requestAnimationFrame(frame);
    };

    const pause = () => {
      active = false;
      window.cancelAnimationFrame(raf);
      release();
      accumulator = 0;
    };

    // A new mood keeps the water that is already moving; only a different
    // grid size starts the surface again.
    const setMood = (mood) => {
      Object.assign(config, configFrom(mood || {}));
      inkColors = inkColorsFrom(mood || {});
      state.motionScale = reduce.matches ? config.reducedMotionScale : 1;
      allocate();
    };

    const onMotionChange = () => {
      state.motionScale = reduce.matches ? config.reducedMotionScale : 1;
      last = performance.now();
    };

    if (interactive) {
      element.addEventListener("pointerdown", onPointerDown, { passive: true });
      element.addEventListener("pointermove", onPointerMove, { passive: true });
      element.addEventListener("pointerup", onPointerUp, { passive: true });
      element.addEventListener("pointercancel", onPointerCancel, { passive: true });
      window.addEventListener("blur", release);
    }
    const observer =
      "ResizeObserver" in window ? new ResizeObserver(onResize) : null;
    if (observer) {
      observer.observe(element);
    } else {
      window.addEventListener("resize", onResize, { passive: true });
    }
    reduce.addEventListener("change", onMotionChange);

    allocate();

    raf = window.requestAnimationFrame((now) => {
      last = now;
      frame(now);
    });

    const destroy = () => {
      pause();
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", release);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      reduce.removeEventListener("change", onMotionChange);
      disturbListeners.clear();
      localListeners.clear();
    };

    return {
      state,
      config,
      addDrop,
      addStroke,
      onLocalGesture,
      onDisturb,
      setMood,
      pause,
      resume,
      destroy,
    };
  };
})();

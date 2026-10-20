/*
 * Touch and pointer physics.
 *
 * The weather is not a control panel, but it can be disturbed. A drag pulls a
 * temporary current through the cloud field and the light streams; a tap sends
 * a slow ring outward. Both settle back into the day's mood on their own.
 *
 * This module owns the interaction state and exposes it to app.js (shader
 * distortion) and motes.js (stream forces). All amplitudes live in mood.js.
 */
(() => {
  "use strict";

  const mood = window.MOOD || {};
  const settings = mood.interaction || {};
  const config = {
    radius: settings.radius ?? 0.3,
    push: settings.push ?? 0.03,
    swirl: settings.swirl ?? 0.035,
    streamWake: settings.streamWake ?? 0.15,
    streamSwirl: settings.streamSwirl ?? 46,
    rippleSpeed: settings.rippleSpeed ?? 0.45,
    rippleStrength: settings.rippleStrength ?? 0.8,
    lightPull: settings.lightPull ?? 0.12,
    reducedMotionScale: settings.reducedMotionScale ?? 0.35,
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    width: window.innerWidth,
    height: window.innerHeight,
    stir: {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: 0,
      vy: 0,
      strength: 0,
    },
    ripple: null,
    dragging: false,
    motionScale: reduce.matches ? config.reducedMotionScale : 1,
  };

  let activePointer = null;
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;
  let lastMove = 0;
  let active = true;
  let last = performance.now();
  let raf = 0;

  const onResize = () => {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.stir.x = Math.min(Math.max(state.stir.x, 0), state.width);
    state.stir.y = Math.min(Math.max(state.stir.y, 0), state.height);
  };

  const onPointerDown = (event) => {
    if (activePointer !== null) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointer = event.pointerId;
    state.dragging = true;
    downAt = performance.now();
    downX = event.clientX;
    downY = event.clientY;
    lastX = downX;
    lastY = downY;
    lastTime = downAt;
    lastMove = downAt;
    state.stir.x = downX;
    state.stir.y = downY;
    state.stir.vx = 0;
    state.stir.vy = 0;
    state.stir.strength = Math.max(state.stir.strength, 0.2);

    try {
      document.documentElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nicety; dragging still works without it.
    }
  };

  const onPointerMove = (event) => {
    if (!state.dragging || event.pointerId !== activePointer) {
      return;
    }

    const now = performance.now();
    const dt = Math.max(0.001, Math.min(0.05, (now - lastTime) / 1000));
    let vx = (event.clientX - lastX) / dt;
    let vy = (event.clientY - lastY) / dt;
    const speed = Math.hypot(vx, vy);
    const maxSpeed = 620;
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }

    const ease = 0.35;
    state.stir.vx += (vx - state.stir.vx) * ease;
    state.stir.vy += (vy - state.stir.vy) * ease;
    state.stir.x = event.clientX;
    state.stir.y = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = now;
    lastMove = now;
  };

  const endPointer = (event, canceled) => {
    if (event.pointerId !== activePointer) {
      return;
    }

    const now = performance.now();
    const distance = Math.hypot(event.clientX - downX, event.clientY - downY);
    const duration = now - downAt;

    if (!canceled && distance < 12 && duration < 350) {
      state.ripple = {
        x: downX,
        y: downY,
        age: 0,
        life: 2.8,
        strength: 1,
      };
    }

    state.dragging = false;
    activePointer = null;

    try {
      document.documentElement.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released.
    }
  };

  const onPointerUp = (event) => endPointer(event, false);
  const onPointerCancel = (event) => endPointer(event, true);

  const release = () => {
    state.dragging = false;
    activePointer = null;
  };

  const onVisibility = () => {
    if (document.hidden) {
      release();
    }
  };

  const step = (now) => {
    if (!active) {
      return;
    }

    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    state.motionScale = reduce.matches ? config.reducedMotionScale : 1;

    const targetStrength = state.dragging ? 1 : 0;
    const ease = 1 - Math.exp(-dt * (state.dragging ? 10 : 3.2));
    state.stir.strength += (targetStrength - state.stir.strength) * ease;

    if (!state.dragging) {
      const decay = Math.exp(-dt * 3.5);
      state.stir.vx *= decay;
      state.stir.vy *= decay;
    } else if (now - lastMove > 100) {
      const decay = Math.exp(-dt * 5);
      state.stir.vx *= decay;
      state.stir.vy *= decay;
    }

    if (state.ripple) {
      state.ripple.age += dt * (reduce.matches ? 0.6 : 1);
      if (state.ripple.age >= state.ripple.life) {
        state.ripple = null;
      }
    }

    raf = window.requestAnimationFrame(step);
  };

  const start = () => {
    if (active) {
      return;
    }
    active = true;
    last = performance.now();
    raf = window.requestAnimationFrame(step);
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
    } else {
      start();
    }
  });

  reduce.addEventListener("change", () => {
    state.motionScale = reduce.matches ? config.reducedMotionScale : 1;
    last = performance.now();
  });

  window.MOODPAGE_INTERACTION = { state, config };

  raf = window.requestAnimationFrame((now) => {
    last = now;
    step(now);
  });
})();

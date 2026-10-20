/*
 * The pulse.
 *
 * A transparent 2D layer above the atmosphere: slow streams of light that
 * curve around the focal point, suspended dust, and a few soft bokeh orbs.
 * Like the sky, everything here is steered by mood.js.
 */
(() => {
  "use strict";

  const mood = window.MOOD;
  const canvas = document.getElementById("motes");
  if (!mood || !canvas) {
    return;
  }

  const settings = mood.motes || {};
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2;

  const config = {
    streamers: settings.streamers ?? 160,
    dust: settings.dust ?? 160,
    bokeh: settings.bokeh ?? 12,
    trailLength: settings.trailLength ?? 160,
    speed: settings.speed ?? 52,
    orbit: settings.orbit ?? 10,
    driftX: settings.driftX ?? 3,
    driftY: settings.driftY ?? -2,
    fieldScale: settings.fieldScale ?? 1,
    opacity: settings.opacity ?? 1,
    reducedMotionScale: settings.reducedMotionScale ?? 0.18,
  };

  const palette = mood.palette;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  const parseColor = (hex) => {
    let value = hex.replace("#", "").trim();
    if (value.length === 3) {
      value = value
        .split("")
        .map((part) => part + part)
        .join("");
    }
    const number = Number.parseInt(value, 16);
    return {
      r: (number >> 16) & 255,
      g: (number >> 8) & 255,
      b: number & 255,
    };
  };

  const colors = {};
  for (const [name, hex] of Object.entries(palette)) {
    colors[name] = parseColor(hex);
  }

  const rgba = (name, alpha) => {
    const c = colors[name] || colors.light;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  };

  let width = 1;
  let height = 1;
  let ratio = 1;
  let streamers = [];
  let dust = [];
  let bokeh = [];
  let sprites = {};
  let elapsed = 0;
  let last = performance.now();
  let active = true;
  let raf = 0;

  const hash = (x, y, z) => {
    let h =
      Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const smooth = (t) => t * t * (3 - 2 * t);

  const noise = (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const zf = smooth(z - zi);

    const a = hash(xi, yi, zi);
    const b = hash(xi + 1, yi, zi);
    const c = hash(xi, yi + 1, zi);
    const d = hash(xi + 1, yi + 1, zi);
    const e = hash(xi, yi, zi + 1);
    const f = hash(xi + 1, yi, zi + 1);
    const g = hash(xi, yi + 1, zi + 1);
    const h = hash(xi + 1, yi + 1, zi + 1);

    const x1 = a + (b - a) * xf;
    const x2 = c + (d - c) * xf;
    const x3 = e + (f - e) * xf;
    const x4 = g + (h - g) * xf;
    const y1 = x1 + (x2 - x1) * yf;
    const y2 = x3 + (x4 - x3) * yf;
    return y1 + (y2 - y1) * zf;
  };

  const makeSprites = () => {
    sprites = {};
    for (const [name, color] of Object.entries(colors)) {
      const size = 96;
      const sprite = document.createElement("canvas");
      sprite.width = size;
      sprite.height = size;
      const g = sprite.getContext("2d");
      const gradient = g.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(
        0,
        `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`,
      );
      gradient.addColorStop(
        0.15,
        `rgba(${color.r}, ${color.g}, ${color.b}, 0.38)`,
      );
      gradient.addColorStop(
        0.48,
        `rgba(${color.r}, ${color.g}, ${color.b}, 0.07)`,
      );
      gradient.addColorStop(
        1,
        `rgba(${color.r}, ${color.g}, ${color.b}, 0)`,
      );
      g.fillStyle = gradient;
      g.fillRect(0, 0, size, size);
      sprites[name] = sprite;
    }
  };

  const areaScale = () =>
    Math.min(1, Math.max(0.4, (width * height) / 1100000));

  const focusPoint = () => ({
    x: width * (mood.composition.lightX ?? 0.66),
    y: height * (mood.composition.lightY ?? 0.46),
  });

  const chooseColor = (x, y) => {
    const focus = focusPoint();
    const distance = Math.hypot(x - focus.x, y - focus.y);
    const near = Math.min(width, height) * 0.38;
    if (distance < near) {
      return pick(["glow", "glow", "light", "light"]);
    }
    return pick(["light", "light", "light", "haze", "glow"]);
  };

  const spawnStreamer = () => {
    const flow = pick([
      { x: 0, y: 0 },
      { x: 140, y: 90 },
      { x: -110, y: 200 },
      { x: 240, y: -130 },
    ]);
    const x = rand(-30, width + 30);
    const y = rand(-30, height + 30);
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      speed: rand(0.62, 1.4),
      size: rand(1.0, 2.3),
      alpha: rand(0.35, 0.8),
      phase: rand(0, TAU),
      twinkle: rand(0.25, 0.7),
      color: chooseColor(x, y),
      flow,
      history: [],
    };
  };

  const spawnDust = () => {
    const x = rand(0, width);
    const y = rand(0, height);
    return {
      x,
      y,
      speed: rand(0.1, 0.45),
      size: rand(0.35, 1.15),
      alpha: rand(0.12, 0.45),
      phase: rand(0, TAU),
      twinkle: rand(0.3, 1.1),
      color: chooseColor(x, y),
    };
  };

  const spawnBokeh = () => ({
    x: rand(0, width),
    y: rand(0, height),
    speed: rand(0.08, 0.25),
    size: rand(9, 34),
    alpha: rand(0.02, 0.06),
    phase: rand(0, TAU),
    twinkle: rand(0.06, 0.17),
    color: pick(["glow", "light", "haze"]),
  });

  const fill = () => {
    const n = areaScale();
    streamers = Array.from(
      { length: Math.round(config.streamers * n) },
      () => spawnStreamer(),
    );
    dust = Array.from(
      { length: Math.round(config.dust * n) },
      () => spawnDust(),
    );
    bokeh = Array.from(
      { length: Math.round(config.bokeh * n) },
      () => spawnBokeh(),
    );
  };

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    ratio = Math.min(
      window.devicePixelRatio || 1,
      1.75,
      Math.sqrt(3200000 / Math.max(width * height, 1)),
    );
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    fill();
  };

  const resetHistory = (particle) => {
    particle.history = [{ x: particle.x, y: particle.y }];
    particle.vx = 0;
    particle.vy = 0;
  };

  const addHistory = (particle) => {
    const head = particle.history[0];
    if (head && Math.hypot(particle.x - head.x, particle.y - head.y) < 1.0) {
      return;
    }

    particle.history.unshift({ x: particle.x, y: particle.y });
    let total = 0;
    for (let i = 1; i < particle.history.length; i += 1) {
      total += Math.hypot(
        particle.history[i - 1].x - particle.history[i].x,
        particle.history[i - 1].y - particle.history[i].y,
      );
      if (total > config.trailLength || i >= 240) {
        particle.history.length = i + 1;
        break;
      }
    }
  };

  const wrapStreamer = (particle) => {
    const margin = 50;
    let wrapped = false;
    if (particle.x < -margin) {
      particle.x = width + margin;
      wrapped = true;
    } else if (particle.x > width + margin) {
      particle.x = -margin;
      wrapped = true;
    }
    if (particle.y < -margin) {
      particle.y = height + margin;
      wrapped = true;
    } else if (particle.y > height + margin) {
      particle.y = -margin;
      wrapped = true;
    }
    if (wrapped) {
      resetHistory(particle);
    }
  };

  const stepStreamer = (particle, dt, time, focus) => {
    const fieldScale = 0.00135 * config.fieldScale;
    const angle =
      noise(
        (particle.x + particle.flow.x) * fieldScale,
        (particle.y + particle.flow.y) * fieldScale,
        time,
      ) *
        TAU *
        2.1 +
      0.35;

    const dx = particle.x - focus.x;
    const dy = particle.y - focus.y;
    const distance = Math.hypot(dx, dy) + 1;
    const orbit =
      config.orbit * Math.exp(-distance / (Math.min(width, height) * 0.8));

    const targetX =
      Math.cos(angle) * config.speed * particle.speed +
      config.driftX +
      (-dy / distance) * orbit;
    const targetY =
      Math.sin(angle) * config.speed * particle.speed +
      config.driftY +
      (dx / distance) * orbit;

    const inertia = Math.min(1, dt * 2.4);
    particle.vx += (targetX - particle.vx) * inertia;
    particle.vy += (targetY - particle.vy) * inertia;

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    wrapStreamer(particle);
    addHistory(particle);
  };

  const drawStreamer = (particle, opacity) => {
    const trail = particle.history;
    if (trail.length < 2) {
      return;
    }

    const color = colors[particle.color] || colors.light;
    const twinkle =
      0.78 + 0.22 * Math.sin(elapsed * particle.twinkle * 2.4 + particle.phase);
    const shine = particle.alpha * opacity * twinkle;

    // A wide, barely-there halo around the path.
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i += 1) {
      ctx.lineTo(trail[i].x, trail[i].y);
    }
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${shine * 0.07})`;
    ctx.lineWidth = particle.size * 4.2;
    ctx.stroke();

    // The full tail.
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${shine * 0.12})`;
    ctx.lineWidth = particle.size;
    ctx.stroke();

    // The living end of the stream.
    const partial = Math.max(2, Math.round(trail.length * 0.34));
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < partial; i += 1) {
      ctx.lineTo(trail[i].x, trail[i].y);
    }
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${shine * 0.3})`;
    ctx.lineWidth = particle.size * 1.1;
    ctx.stroke();

    // The particle itself.
    const glowSize = particle.size * 16;
    ctx.globalAlpha = shine * 0.75;
    ctx.drawImage(
      sprites[particle.color],
      particle.x - glowSize / 2,
      particle.y - glowSize / 2,
      glowSize,
      glowSize,
    );

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * 0.72, 0, TAU);
    ctx.fillStyle = rgba(particle.color, shine * 0.9);
    ctx.fill();
  };

  const draw = (now) => {
    if (!active) {
      return;
    }

    const realDelta = Math.min((now - last) / 1000, 0.05);
    last = now;
    const motionScale = reduce.matches ? config.reducedMotionScale : 1;
    const dt = realDelta * motionScale;
    elapsed += realDelta * motionScale;

    const focus = focusPoint();
    const time = elapsed * 0.035;
    const breath = 0.9 + 0.1 * Math.sin(elapsed * 0.16);
    const opacity = config.opacity * breath;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Air, far away.
    for (const particle of bokeh) {
      particle.x +=
        Math.cos(particle.phase + elapsed * 0.05) * particle.speed * dt * 14;
      particle.y -= particle.speed * dt * 6;
      const margin = particle.size * 2;
      if (particle.y < -margin) {
        particle.y = height + margin;
        particle.x = rand(0, width);
      } else if (particle.y > height + margin) {
        particle.y = -margin;
        particle.x = rand(0, width);
      }
      if (particle.x < -margin) {
        particle.x = width + margin;
      } else if (particle.x > width + margin) {
        particle.x = -margin;
      }

      const twinkle =
        0.8 + 0.2 * Math.sin(elapsed * particle.twinkle * 2 + particle.phase);
      const size = particle.size;
      ctx.globalAlpha = particle.alpha * opacity * twinkle;
      ctx.drawImage(
        sprites[particle.color],
        particle.x - size / 2,
        particle.y - size / 2,
        size,
        size,
      );
    }

    ctx.globalAlpha = 1;

    // Suspended dust.
    for (const particle of dust) {
      particle.x +=
        Math.cos(particle.phase + elapsed * 0.08) * particle.speed * dt * 10;
      particle.y -= particle.speed * dt * 7;
      if (particle.y < -8) {
        particle.y = height + 8;
        particle.x = rand(0, width);
      }
      if (particle.x < -8) {
        particle.x = width + 8;
      } else if (particle.x > width + 8) {
        particle.x = -8;
      }

      const twinkle =
        0.68 + 0.32 * Math.sin(elapsed * particle.twinkle * 1.8 + particle.phase);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fillStyle = rgba(particle.color, particle.alpha * opacity * twinkle);
      ctx.fill();
    }

    // The streams.
    for (const particle of streamers) {
      stepStreamer(particle, dt, time, focus);
      drawStreamer(particle, opacity);
    }

    ctx.globalCompositeOperation = "source-over";
    raf = window.requestAnimationFrame(draw);
  };

  const warmup = () => {
    const focus = focusPoint();
    const steps = 180;
    const dt = 1 / 60;
    for (let step = 0; step < steps; step += 1) {
      const time = (step * dt) * 0.035;
      for (const particle of streamers) {
        stepStreamer(particle, dt, time, focus);
      }
    }
    elapsed = steps * dt;
  };

  const startLoop = () => {
    if (active) {
      return;
    }
    active = true;
    last = performance.now();
    raf = window.requestAnimationFrame(draw);
  };

  const stopLoop = () => {
    active = false;
    window.cancelAnimationFrame(raf);
  };

  const onVisibility = () => {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  };

  reduce.addEventListener("change", () => {
    last = performance.now();
  });

  makeSprites();
  resize();
  warmup();
  window.addEventListener("resize", () => {
    resize();
    warmup();
  });
  document.addEventListener("visibilitychange", onVisibility);

  raf = window.requestAnimationFrame((now) => {
    last = now;
    draw(now);
  });
})();

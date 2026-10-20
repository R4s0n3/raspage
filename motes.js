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

  const interaction = window.MOODPAGE_INTERACTION;
  const interactionConfig = interaction?.config ?? {};

  const settings = mood.motes || {};
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2;

  const config = {
    streamers: settings.streamers ?? 160,
    strays: settings.strays ?? 0,
    dust: settings.dust ?? 160,
    bokeh: settings.bokeh ?? 12,
    trailLength: settings.trailLength ?? 160,
    speed: settings.speed ?? 52,
    orbit: settings.orbit ?? 10,
    driftX: settings.driftX ?? 3,
    driftY: settings.driftY ?? -2,
    fieldScale: settings.fieldScale ?? 1,
    opacity: settings.opacity ?? 1,
    flatten: settings.flatten ?? 0,
    reducedMotionScale: settings.reducedMotionScale ?? 0.18,
  };

  // Living matter: soft drifters that pulse through the water, trailing
  // tendrils, lighting up when the water is touched. Off unless mood.life
  // asks for them.
  const lifeSettings = mood.life || {};
  const life = {
    creatures: lifeSettings.creatures ?? 0,
    size: lifeSettings.size ?? 1,
    pulse: lifeSettings.pulse ?? 0.4,
    speed: lifeSettings.speed ?? 26,
    tendrils: lifeSettings.tendrils ?? 4,
    tendrilLength: lifeSettings.tendrilLength ?? 80,
    sway: lifeSettings.sway ?? 1,
    wander: lifeSettings.wander ?? 0.6,
    gather: lifeSettings.gather ?? 0.2,
    curiosity: lifeSettings.curiosity ?? 0.5,
    glow: lifeSettings.glow ?? 1,
    excite: lifeSettings.excite ?? 1,
    shy: lifeSettings.shy ?? 0,
    hideFor: lifeSettings.hideFor ?? 12,
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
  let creatures = [];
  let sprites = {};
  let bells = {};
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

  // A translucent bell, drawn once per colour: a soft dome with a brighter
  // rim, a scalloped lower edge, and a small inner light. Top = forward.
  const makeBells = () => {
    bells = {};
    const size = 128;
    for (const [name, color] of Object.entries(colors)) {
      const sprite = document.createElement("canvas");
      sprite.width = size;
      sprite.height = size;
      const g = sprite.getContext("2d");
      const c = (a) => `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;
      const cx = size / 2;
      const top = size * 0.2;
      const rim = size * 0.62;
      const half = size * 0.34;

      const dome = () => {
        g.beginPath();
        g.moveTo(cx - half, rim);
        g.bezierCurveTo(cx - half, top - 4, cx + half, top - 4, cx + half, rim);
        // A scalloped skirt.
        const lobes = 7;
        for (let i = lobes - 1; i >= 0; i -= 1) {
          const x0 = cx - half + ((i + 1) / lobes) * half * 2;
          const x1 = cx - half + (i / lobes) * half * 2;
          g.quadraticCurveTo((x0 + x1) / 2, rim + size * 0.045, x1, rim);
        }
        g.closePath();
      };

      const body = g.createRadialGradient(cx, top + 10, 2, cx, rim - 6, half * 1.25);
      body.addColorStop(0, c(0.42));
      body.addColorStop(0.55, c(0.16));
      body.addColorStop(1, c(0.07));
      dome();
      g.fillStyle = body;
      g.fill();

      g.lineWidth = 1.6;
      g.strokeStyle = c(0.42);
      dome();
      g.stroke();

      // The inner light: four soft lobes around a bright centre.
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const lx = cx + Math.cos(a) * half * 0.32;
        const ly = (top + rim) / 2 + 4 + Math.sin(a) * half * 0.22;
        const lobe = g.createRadialGradient(lx, ly, 0, lx, ly, half * 0.3);
        lobe.addColorStop(0, c(0.5));
        lobe.addColorStop(1, c(0));
        g.fillStyle = lobe;
        g.fillRect(0, 0, size, size);
      }

      const core = g.createRadialGradient(cx, top + 18, 0, cx, top + 18, half * 0.55);
      core.addColorStop(0, `rgba(255, 255, 255, 0.35)`);
      core.addColorStop(0.3, c(0.35));
      core.addColorStop(1, c(0));
      g.fillStyle = core;
      g.fillRect(0, 0, size, size);

      bells[name] = sprite;
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

  const spawnStreamer = (stray = false) => {
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
      speed: stray ? rand(0.26, 0.5) : rand(0.62, 1.4),
      size: stray ? rand(0.7, 1.4) : rand(1.0, 2.3),
      alpha: stray ? rand(0.16, 0.34) : rand(0.35, 0.8),
      trailLength: config.trailLength * (stray ? 1.45 : 1),
      phase: rand(0, TAU),
      twinkle: rand(0.25, 0.7),
      color: stray ? pick(["haze", "haze", "light"]) : chooseColor(x, y),
      stray,
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

  const spawnCreature = () => {
    // depth 0 is close to the surface, 1 is deep and faint.
    const depth = Math.pow(Math.random(), 1.4);
    const scale = life.size * (1 - depth * 0.55) * rand(0.7, 1.35);
    const tendrils = Math.max(
      0,
      Math.round(life.tendrils * rand(0.7, 1.3)),
    );
    return {
      x: rand(0, width),
      y: rand(0, height),
      vx: 0,
      vy: 0,
      heading: rand(0, TAU),
      phase: rand(0, TAU),
      pulse: life.pulse * rand(0.75, 1.3),
      size: 12 * scale,
      depth,
      alpha: (1 - depth * 0.65) * rand(0.6, 1),
      tendrils,
      trailLength: life.tendrilLength * scale * rand(0.8, 1.25),
      color: pick(["light", "light", "haze", "glow"]),
      seed: rand(0, 500),
      excite: 0,
      presence: 1,
      fleeing: 0,
      fleeX: 0,
      fleeY: 0,
      hiddenUntil: 0,
      history: [],
    };
  };

  // Touched or brushed past, a shy drifter flashes, bolts away from the
  // hand, and fades out; some time later it drifts back in elsewhere.
  const startle = (gesture) => {
    if (life.shy <= 0 || creatures.length === 0) {
      return;
    }
    const ax = gesture.x0 * width;
    const ay = gesture.y0 * height;
    const bx = gesture.x1 * width;
    const by = gesture.y1 * height;
    const abx = bx - ax;
    const aby = by - ay;
    const span = abx * abx + aby * aby;

    for (const creature of creatures) {
      if (creature.fleeing > 0 || creature.presence < 0.2) {
        continue;
      }
      // Closest point on the gesture to this creature.
      const t =
        span > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ((creature.x - ax) * abx + (creature.y - ay) * aby) / span,
              ),
            )
          : 0;
      const dx = creature.x - (ax + abx * t);
      const dy = creature.y - (ay + aby * t);
      const distance = Math.hypot(dx, dy);
      const reach = (creature.size * 3.5 + 60) * life.shy;
      if (distance > reach) {
        continue;
      }

      // Away from the hand, carried a little along a swipe.
      const along = Math.sqrt(span) || 1;
      let fx = dx / (distance || 1) + (abx / along) * 0.6;
      let fy = dy / (distance || 1) + (aby / along) * 0.6;
      if (distance < 1 && span === 0) {
        const a = rand(0, TAU);
        fx = Math.cos(a);
        fy = Math.sin(a);
      }
      const length = Math.hypot(fx, fy) || 1;
      creature.fleeX = fx / length;
      creature.fleeY = fy / length;
      creature.fleeing = 1;
      creature.excite = 1;
    }
  };

  const respawn = (creature) => {
    const fresh = spawnCreature();
    Object.assign(creature, fresh, { presence: 0, history: [] });
    resetHistory(creature);
  };

  const fill = () => {
    const n = areaScale();
    const total = Math.round(config.streamers * n);
    const strayCount = Math.min(total, Math.round(config.strays * n));
    streamers = Array.from(
      { length: total },
      (_, index) => spawnStreamer(index < strayCount),
    );
    dust = Array.from(
      { length: Math.round(config.dust * n) },
      () => spawnDust(),
    );
    bokeh = Array.from(
      { length: Math.round(config.bokeh * n) },
      () => spawnBokeh(),
    );
    creatures = Array.from(
      { length: Math.round(life.creatures * Math.max(0.55, n)) },
      () => spawnCreature(),
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
    const maxLength = particle.trailLength ?? config.trailLength;
    let total = 0;
    for (let i = 1; i < particle.history.length; i += 1) {
      total += Math.hypot(
        particle.history[i - 1].x - particle.history[i].x,
        particle.history[i - 1].y - particle.history[i].y,
      );
      if (total > maxLength || i >= 240) {
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

  // The water surface under a point: slope and height, or null without water.
  const sampleWater = (x, y) => {
    const wave = interaction?.state?.wave;
    if (!wave || wave.width < 3 || wave.height < 3) {
      return null;
    }
    const cols = wave.width;
    const rows = wave.height;
    const gx = Math.min(
      cols - 1,
      Math.max(0, Math.round((x / Math.max(width, 1)) * (cols - 1))),
    );
    const gy = Math.min(
      rows - 1,
      Math.max(0, Math.round((y / Math.max(height, 1)) * (rows - 1))),
    );
    const index = (gy * cols + gx) * 4;
    const field = wave.data;
    const left = (gx > 0 ? field[index - 4] : field[index]) / 255 - 0.5;
    const right = (gx < cols - 1 ? field[index + 4] : field[index]) / 255 - 0.5;
    const up = (gy > 0 ? field[index - cols * 4] : field[index]) / 255 - 0.5;
    const down =
      (gy < rows - 1 ? field[index + cols * 4] : field[index]) / 255 - 0.5;
    return {
      slopeX: (right - left) * 0.5,
      slopeY: (down - up) * 0.5,
      height: field[index] / 255 - 0.5,
    };
  };

  const stepStreamer = (particle, dt, time, focus) => {
    const dx = particle.x - focus.x;
    const dy = particle.y - focus.y;
    const distance = Math.hypot(dx, dy) + 1;

    let targetX;
    let targetY;

    if (particle.stray) {
      // A stray keeps its own slow weather: it leaves the warm current and
      // drifts outward instead of circling the light.
      targetX = (dx / distance) * config.speed * 0.2 + config.driftX * 0.4;
      targetY = (dy / distance) * config.speed * 0.2 + config.driftY * 0.4;
    } else {
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
      const orbit =
        config.orbit * Math.exp(-distance / (Math.min(width, height) * 0.8));

      targetX =
        Math.cos(angle) * config.speed * particle.speed +
        config.driftX +
        (-dy / distance) * orbit;
      targetY =
        Math.sin(angle) * config.speed * particle.speed +
        config.driftY +
        (dx / distance) * orbit;
    }

    // On a water day the streams lie down on the surface and glide.
    targetY *= 1 - config.flatten * 0.75;

    const water = sampleWater(particle.x, particle.y);
    if (water) {
      const push =
        (interactionConfig.streamPush ?? 900) * interaction.state.motionScale;

      // A stream riding the slope of the water.
      targetX += water.slopeX * push;
      targetY += water.slopeY * push;
    }

    const inertia = Math.min(1, dt * 2.4);
    particle.vx += (targetX - particle.vx) * inertia;
    particle.vy += (targetY - particle.vy) * inertia;

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    wrapStreamer(particle);
    addHistory(particle);
  };

  const colorAt = (color, alpha) =>
    `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

  const traceTrail = (trail, count) => {
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < count - 1; i += 1) {
      const mx = (trail[i].x + trail[i + 1].x) * 0.5;
      const my = (trail[i].y + trail[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(trail[i].x, trail[i].y, mx, my);
    }
    const last = trail[count - 1];
    ctx.lineTo(last.x, last.y);
  };

  const drawStreamer = (particle, opacity, focus) => {
    const trail = particle.history;
    if (trail.length < 3) {
      return;
    }

    let color = colors[particle.color] || colors.light;

    // Streams that wander close to the light take on its warmth.
    if (focus) {
      const reach = Math.hypot(particle.x - focus.x, particle.y - focus.y);
      const warmth = Math.max(
        0,
        1 - reach / (Math.min(width, height) * 0.5),
      );
      if (warmth > 0.001) {
        const glow = colors.glow || color;
        const mix = warmth * 0.65;
        color = {
          r: color.r + (glow.r - color.r) * mix,
          g: color.g + (glow.g - color.g) * mix,
          b: color.b + (glow.b - color.b) * mix,
        };
      }
    }
    const twinkle =
      0.78 + 0.22 * Math.sin(elapsed * particle.twinkle * 2.4 + particle.phase);
    const shine = particle.alpha * opacity * twinkle;
    const head = trail[0];
    const tail = trail[trail.length - 1];

    // A gradient along the trail: bright at the head, gone at the tail.
    const fade = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    fade.addColorStop(0, colorAt(color, shine * 0.26));
    fade.addColorStop(0.3, colorAt(color, shine * 0.18));
    fade.addColorStop(0.68, colorAt(color, shine * 0.11));
    fade.addColorStop(1, colorAt(color, 0));

    // A wide, barely-there halo around the path.
    traceTrail(trail, trail.length);
    ctx.strokeStyle = fade;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = particle.size * 4.4;
    ctx.stroke();

    // The full tail, thinning as it forgets.
    ctx.globalAlpha = 1;
    ctx.lineWidth = particle.size * 0.95;
    ctx.stroke();

    // The living end of the stream: short, brighter, slightly wider.
    const partial = Math.max(3, Math.round(trail.length * 0.4));
    traceTrail(trail, partial);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colorAt(color, shine * 0.55);
    ctx.lineWidth = particle.size * 1.25;
    ctx.stroke();

    // The particle itself, as light rather than a dot.
    const glowSize = particle.size * 20;
    ctx.globalAlpha = shine * 0.8;
    ctx.drawImage(
      sprites[particle.color],
      particle.x - glowSize / 2,
      particle.y - glowSize / 2,
      glowSize,
      glowSize,
    );

    // A last small spark at the very head.
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, Math.max(0.5, particle.size * 0.8), 0, TAU);
    ctx.fillStyle = colorAt(color, shine);
    ctx.fill();

    ctx.globalAlpha = 1;
  };

  const turnTowards = (heading, target, amount) => {
    let delta = target - heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    return heading + delta * Math.min(1, amount);
  };

  const stepCreature = (creature, dt, time, focus) => {
    if (creature.hiddenUntil) {
      if (performance.now() < creature.hiddenUntil) {
        return;
      }
      respawn(creature);
    }

    if (creature.fleeing > 0) {
      // A burst of panic: fast, straight, fading.
      creature.fleeing = Math.max(0, creature.fleeing - dt / 0.85);
      const burst = life.speed * 14 * (0.35 + creature.fleeing);
      creature.heading = Math.atan2(creature.fleeY, creature.fleeX);
      creature.phase += creature.pulse * TAU * dt * 5;
      creature.squeeze = Math.pow(Math.max(0, Math.sin(creature.phase)), 2);
      const ease = Math.min(1, dt * 9);
      creature.vx += (creature.fleeX * burst - creature.vx) * ease;
      creature.vy += (creature.fleeY * burst - creature.vy) * ease;
      creature.x += creature.vx * dt;
      creature.y += creature.vy * dt;
      creature.presence = creature.fleeing;
      addHistory(creature);
      if (creature.fleeing <= 0) {
        creature.hiddenUntil =
          performance.now() + life.hideFor * 1000 * rand(0.7, 1.4);
        creature.history = [];
      }
      return;
    }

    // Returning slowly after hiding.
    creature.presence = Math.min(1, creature.presence + dt / 3);

    // A pulse: the bell contracts, pushes, then glides.
    creature.phase += creature.pulse * TAU * dt;
    const squeeze = Math.pow(Math.max(0, Math.sin(creature.phase)), 2);

    // Wander along a slow noise field.
    const n = noise(
      creature.x * 0.0018 + creature.seed,
      creature.y * 0.0018,
      time * 1.6,
    );
    creature.heading += (n - 0.5) * 2.4 * life.wander * dt;

    // Loosely drawn to the light, circling it rather than piling up.
    if (life.gather > 0) {
      const dx = focus.x - creature.x;
      const dy = focus.y - creature.y;
      const distance = Math.hypot(dx, dy) + 1;
      const pull = Math.min(1, distance / (Math.min(width, height) * 0.6));
      const target = Math.atan2(dy, dx) + (1 - pull) * 1.3;
      creature.heading = turnTowards(
        creature.heading,
        target,
        life.gather * pull * 0.35 * dt,
      );
    }

    // Curious: drift towards where the water was last touched.
    let interest = 0;
    const touch = interaction?.state?.touch;
    if (touch && life.curiosity > 0) {
      const age = (performance.now() - touch.at) / 1000;
      if (age < 9) {
        const tx = touch.x * width - creature.x;
        const ty = touch.y * height - creature.y;
        const distance = Math.hypot(tx, ty);
        const reach = Math.min(width, height) * 0.75;
        if (distance < reach && distance > creature.size * 3) {
          interest =
            life.curiosity *
            (1 - distance / reach) *
            Math.min(1, age * 1.5) *
            (1 - age / 9) *
            (1 - creature.depth * 0.5);
          creature.heading = turnTowards(
            creature.heading,
            Math.atan2(ty, tx),
            interest * 3 * dt,
          );
        }
      }
    }

    // A curious one swims harder, and its heart quickens a little.
    creature.phase += interest * creature.pulse * TAU * dt * 0.8;
    const thrust =
      life.speed *
      (0.18 + squeeze * 1.1) *
      (1 - creature.depth * 0.45) *
      (1 + interest * 2.2);
    let targetX = Math.cos(creature.heading) * thrust + config.driftX * 0.25;
    let targetY = Math.sin(creature.heading) * thrust + config.driftY * 0.25;

    // Disturbed water carries them and wakes their light.
    const water = sampleWater(creature.x, creature.y);
    if (water) {
      const push =
        (interactionConfig.streamPush ?? 900) *
        interaction.state.motionScale *
        0.35;
      targetX += water.slopeX * push;
      targetY += water.slopeY * push;
      const agitation =
        Math.hypot(water.slopeX, water.slopeY) * 45 +
        Math.abs(water.height) * 9;
      creature.excite = Math.max(
        creature.excite,
        Math.min(1, agitation * life.excite),
      );
    }
    creature.excite *= Math.exp(-dt / 1.8);

    const ease = Math.min(1, dt * 1.4);
    creature.vx += (targetX - creature.vx) * ease;
    creature.vy += (targetY - creature.vy) * ease;
    creature.x += creature.vx * dt;
    creature.y += creature.vy * dt;
    creature.squeeze = squeeze;
    wrapStreamer(creature);
    addHistory(creature);
  };

  const drawCreature = (creature, opacity) => {
    if (creature.hiddenUntil || creature.presence <= 0.002) {
      return;
    }
    const color = colors[creature.color] || colors.light;
    const squeeze = creature.squeeze ?? 0;
    const excite = creature.excite;
    const size = creature.size;
    const light =
      creature.alpha *
      opacity *
      life.glow *
      creature.presence *
      (0.55 + squeeze * 0.3 + excite * 1.4);

    // Tendrils trail along the path the body took, swaying as they go.
    const trail = creature.history;
    if (creature.tendrils > 0 && trail.length > 4) {
      const head = trail[0];
      const tail = trail[trail.length - 1];
      const fade = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      fade.addColorStop(0, colorAt(color, Math.min(1, light * 0.8)));
      fade.addColorStop(0.5, colorAt(color, Math.min(1, light * 0.32)));
      fade.addColorStop(1, colorAt(color, 0));
      ctx.strokeStyle = fade;
      ctx.lineWidth = Math.max(0.6, size * 0.09);
      const wave = elapsed * creature.pulse * TAU * 0.6;
      const count = creature.tendrils;

      for (let j = 0; j < count; j += 1) {
        const spread = count > 1 ? (j / (count - 1) - 0.5) * size * 1.1 : 0;
        ctx.beginPath();
        for (let i = 0; i < trail.length; i += 2) {
          const a = trail[Math.max(0, i - 1)];
          const b = trail[Math.min(trail.length - 1, i + 1)];
          let nx = -(b.y - a.y);
          let ny = b.x - a.x;
          const length = Math.hypot(nx, ny) || 1;
          nx /= length;
          ny /= length;
          const s = i / (trail.length - 1);
          const offset =
            spread * (1 - s * 0.5) +
            Math.sin(s * 9 - wave + j * 1.9 + creature.seed) *
              size *
              0.55 *
              life.sway *
              s;
          const x = trail[i].x + nx * offset;
          const y = trail[i].y + ny * offset;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }

    // The halo of its own light.
    const halo = size * (6 + excite * 5);
    ctx.globalAlpha = Math.min(1, light * 0.5);
    ctx.drawImage(
      sprites[creature.color],
      creature.x - halo / 2,
      creature.y - halo / 2,
      halo,
      halo,
    );

    // The bell, facing where it swims, squeezing as it pulses.
    const angle = Math.atan2(creature.vy, creature.vx) + Math.PI / 2;
    const bell = size * 3.2;
    ctx.save();
    ctx.translate(creature.x, creature.y);
    ctx.rotate(angle);
    ctx.scale(1 - squeeze * 0.2, 1 + squeeze * 0.14);
    ctx.globalAlpha = Math.min(1, light * 1.7);
    ctx.drawImage(bells[creature.color], -bell / 2, -bell * 0.42, bell, bell);
    ctx.restore();
    ctx.globalAlpha = 1;
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

    // The living things.
    for (const creature of creatures) {
      stepCreature(creature, dt, time, focus);
      drawCreature(creature, opacity);
    }

    // The streams.
    for (const particle of streamers) {
      stepStreamer(particle, dt, time, focus);
      drawStreamer(particle, opacity, focus);
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
      for (const creature of creatures) {
        stepCreature(creature, dt, time, focus);
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
  makeBells();
  interaction?.onDisturb?.(startle);
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

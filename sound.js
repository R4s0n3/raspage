/*
 * The sound of the water.
 *
 * Everything is synthesised with Web Audio from a little noise: no files, no
 * libraries. A quiet bed of lapping water and moving air, now and then a
 * distant drip, a soft plop where the water is touched and a hushed stir
 * along a stroke. Browsers only allow sound after a gesture, so the page
 * starts silent and the sound fades in with the first touch.
 *
 * Driven by `sound` in mood.js; with no block (or volume 0) it stays silent.
 */
(() => {
  const settings = window.MOOD?.sound || {};
  const config = {
    volume: settings.volume ?? 0,
    water: settings.water ?? 0.6,
    lap: settings.lap ?? 0.25,
    wind: settings.wind ?? 0.3,
    windTone: settings.windTone ?? 500,
    drips: settings.drips ?? 4,
    drop: settings.drop ?? 0.7,
    pitch: settings.pitch ?? 1,
    stir: settings.stir ?? 0.5,
    space: settings.space ?? 0.35,
  };
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || config.volume <= 0) {
    return;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rand = (min, max) => min + Math.random() * (max - min);

  let ctx = null;
  let master = null;
  let dry = null;
  let wet = null;
  let stirGain = null;
  let stirFilter = null;
  let stirLevel = 0;
  let pink = null;
  let brown = null;
  let nextLap = 0;
  let nextDrip = 0;
  let nextWind = 0;
  let recentDrops = 0;

  // A few seconds of noise, looped: pink for air and surface, brown for depth.
  const noiseBuffer = (kind) => {
    const length = ctx.sampleRate * 6;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    // Cross-fade the ends so the loop has no seam.
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i += 1) {
      const t = i / fade;
      data[i] = data[i] * t + data[length - fade + i] * (1 - t);
    }
    return buffer;
  };

  const loop = (buffer) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopEnd = buffer.duration - 0.25;
    source.start(0, rand(0, buffer.duration - 0.5));
    return source;
  };

  // A soft room: a short tail of decaying noise.
  const reverb = () => {
    const seconds = 2.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  };

  const panner = (pan) => {
    if (ctx.createStereoPanner) {
      const node = ctx.createStereoPanner();
      node.pan.value = clamp(pan, -1, 1);
      return node;
    }
    return ctx.createGain();
  };

  const send = (node, wetness = 1) => {
    node.connect(dry);
    if (wetness > 0) {
      const amount = ctx.createGain();
      amount.gain.value = wetness;
      node.connect(amount);
      amount.connect(wet);
    }
  };

  // Water lapping at an unseen edge: deep noise that swells and settles.
  let lapGain = null;
  let lapFilter = null;
  const buildWater = () => {
    const source = loop(brown);
    lapFilter = ctx.createBiquadFilter();
    lapFilter.type = "lowpass";
    lapFilter.frequency.value = 320;
    lapFilter.Q.value = 0.4;
    lapGain = ctx.createGain();
    lapGain.gain.value = config.water * 0.25;
    source.connect(lapFilter);
    lapFilter.connect(lapGain);
    send(lapGain, 0.3);
  };

  const lap = (now) => {
    const strength = rand(0.5, 1) * config.water;
    const rise = rand(0.9, 1.8);
    const fall = rand(1.6, 3.2);
    const base = config.water * 0.22;
    lapGain.gain.setTargetAtTime(base + strength * 0.45, now, rise / 3);
    lapGain.gain.setTargetAtTime(base, now + rise, fall / 3);
    lapFilter.frequency.setTargetAtTime(320 + strength * 520, now, rise / 3);
    lapFilter.frequency.setTargetAtTime(280, now + rise, fall / 3);
    // `lap` is how restless the water is: 0 long pauses, 1 one swell after another.
    nextLap = now + rise + fall * rand(0.5, 1) * (0.6 + (1 - clamp(config.lap, 0, 1)) * 1.6);
  };

  // Air moving over the water: pink noise through a wandering band.
  let windGain = null;
  let windFilter = null;
  const buildWind = () => {
    const source = loop(pink);
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = config.windTone;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = config.wind * 0.12;
    source.connect(windFilter);
    windFilter.connect(windGain);
    send(windGain, 0.2);
  };

  const gust = (now) => {
    windFilter.frequency.setTargetAtTime(config.windTone * rand(0.6, 1.5), now, 1.6);
    windGain.gain.setTargetAtTime(config.wind * rand(0.06, 0.2), now, 1.8);
    nextWind = now + rand(2.5, 6);
  };

  // The hush of a hand moving through water.
  const buildStir = () => {
    const source = loop(pink);
    stirFilter = ctx.createBiquadFilter();
    stirFilter.type = "bandpass";
    stirFilter.frequency.value = 900;
    stirFilter.Q.value = 0.9;
    stirGain = ctx.createGain();
    stirGain.gain.value = 0;
    source.connect(stirFilter);
    stirFilter.connect(stirGain);
    send(stirGain, 0.35);
  };

  // A drop: the tiny bubble a falling bead traps rings and rises in pitch.
  const plop = (x, y, level, far = 0) => {
    if (!ctx || recentDrops > 10 || level < 0.001) {
      return;
    }
    recentDrops += 1;
    const now = ctx.currentTime;
    const out = panner((x - 0.5) * 1.4);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200 - far * 4200;
    out.connect(tone);
    send(tone, config.space * (0.6 + far * 1.4) * 2);

    const base = rand(480, 900) * config.pitch * (1.15 - y * 0.3);
    const voice = (delay, scale, gain) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const start = now + delay;
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * scale, start);
      osc.frequency.exponentialRampToValueAtTime(base * scale * rand(1.8, 2.6), start + 0.07);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, start + rand(0.09, 0.16));
      osc.connect(env);
      env.connect(out);
      osc.start(start);
      osc.stop(start + 0.2);
    };
    voice(0, 1, level * 0.5);
    if (Math.random() < 0.45) {
      voice(rand(0.03, 0.09), rand(1.3, 1.7), level * 0.22);
    }

    // The faint splash on the surface.
    const splash = ctx.createBufferSource();
    splash.buffer = pink;
    const splashFilter = ctx.createBiquadFilter();
    splashFilter.type = "highpass";
    splashFilter.frequency.value = 1800;
    const splashEnv = ctx.createGain();
    splashEnv.gain.setValueAtTime(level * 0.12, now);
    splashEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    splash.connect(splashFilter);
    splashFilter.connect(splashEnv);
    splashEnv.connect(out);
    splash.start(now, rand(0, 4));
    splash.stop(now + 0.06);
  };

  const onDisturb = ({ x0, y0, x1, y1 }) => {
    if (!ctx || ctx.state !== "running") {
      return;
    }
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length === 0) {
      plop(x1, y1, config.drop);
      return;
    }
    stirLevel = clamp(stirLevel + length * 3 * config.stir, 0, config.stir);
    stirFilter.frequency.setTargetAtTime(600 + length * 9000, ctx.currentTime, 0.08);
    if (Math.random() < length * 6) {
      plop(x1, y1, config.drop * rand(0.15, 0.35));
    }
  };

  const step = () => {
    if (!ctx || ctx.state !== "running") {
      return;
    }
    const now = ctx.currentTime;
    recentDrops = Math.max(0, recentDrops - 2);
    stirLevel *= 0.72;
    stirGain.gain.setTargetAtTime(stirLevel * 0.35, now, 0.06);
    if (now >= nextLap) {
      lap(now);
    }
    if (now >= nextWind) {
      gust(now);
    }
    if (config.drips > 0 && now >= nextDrip) {
      plop(Math.random(), Math.random(), config.drop * rand(0.1, 0.3), rand(0.5, 1));
      nextDrip = now + rand(0.4, 1.6) * (60 / config.drips);
    }
  };

  const fadeTo = (value, seconds) => {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(value, ctx.currentTime + seconds);
  };

  const start = () => {
    if (ctx) {
      ctx.resume?.();
      return;
    }
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    pink = noiseBuffer("pink");
    brown = noiseBuffer("brown");

    master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 6;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    dry = ctx.createGain();
    dry.connect(master);
    wet = ctx.createGain();
    wet.gain.value = config.space;
    const room = reverb();
    wet.connect(room);
    room.connect(master);

    buildWater();
    buildWind();
    buildStir();

    const now = ctx.currentTime;
    nextLap = now + 0.5;
    nextWind = now + 1;
    nextDrip = now + rand(3, 8);
    fadeTo(config.volume, 4);
    window.setInterval(step, 120);
    ctx.resume?.();
  };

  const unlock = () => {
    start();
    if (ctx && ctx.state === "running") {
      for (const type of ["pointerdown", "pointerup", "keydown"]) {
        window.removeEventListener(type, unlock);
      }
    }
  };
  for (const type of ["pointerdown", "pointerup", "keydown"]) {
    window.addEventListener(type, unlock, { passive: true });
  }

  window.MOODPAGE_INTERACTION?.onDisturb?.(onDisturb);

  document.addEventListener("visibilitychange", () => {
    if (!ctx) {
      return;
    }
    if (document.hidden) {
      fadeTo(0, 0.3);
      window.setTimeout(() => document.hidden && ctx.suspend?.(), 350);
    } else {
      ctx.resume?.().then(() => fadeTo(config.volume, 2));
    }
  });
})();

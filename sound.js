/*
 * The sound of the water.
 *
 * Everything is synthesised with Web Audio from noise and a few sine voices:
 * no files, no libraries. It is made to be listened to closely, on
 * headphones:
 *
 *   - a wide, decorrelated stereo bed of water lapping at an unseen edge,
 *     with a slosh as each swell arrives and a fizz of foam as it draws back
 *   - air moving over the water
 *   - a fine, ever-changing crackle of tiny bubbles that wakes up wherever
 *     the water has been disturbed
 *   - a drop is a crisp contact click, a ringing bubble that rises in pitch,
 *     and a few splash-back droplets around it
 *   - each finger drawing through the water has its own hush and its own
 *     trickle of bubbles, placed where the finger is
 *   - drops, drips and fingers are placed binaurally (HRTF) around the head
 *   - a damped stereo room with early reflections, a warm tone shelf, and a
 *     soft limiter so nothing ever bites
 *
 * Browsers only allow sound after a gesture, so the page starts silent and
 * the sound fades in with the first touch. Driven by `sound` in mood.js; with
 * no block (or volume 0) it stays silent.
 */
(() => {
  "use strict";

  const MOODPAGE = (window.MOODPAGE = window.MOODPAGE || {});

  const configFrom = (mood) => {
    const settings = mood?.sound || {};
    return {
      volume: settings.volume ?? 0,
      water: settings.water ?? 0.6,
      lap: settings.lap ?? 0.25,
      foam: settings.foam ?? 0.5,
      wind: settings.wind ?? 0.3,
      windTone: settings.windTone ?? 500,
      detail: settings.detail ?? 0.5,
      drips: settings.drips ?? 4,
      drop: settings.drop ?? 0.7,
      splash: settings.splash ?? 0.5,
      pitch: settings.pitch ?? 1,
      stir: settings.stir ?? 0.5,
      space: settings.space ?? 0.35,
      width: settings.width ?? 0.8,
      warmth: settings.warmth ?? 0.5,
      binaural: settings.binaural ?? 1,
    };
  };

  // MOODPAGE.createSound(element, mood, water): one ambience for one
  // moodpage, woken by the first touch on that element.
  MOODPAGE.createSound = (element, initialMood, interaction) => {
    const config = configFrom(initialMood);
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return null;
    }

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const rand = (min, max) => min + Math.random() * (max - min);

    const STEP_MS = 60; // scheduler tick
    const LOOKAHEAD = 0.12; // seconds of texture scheduled ahead of time
    const MAX_VOICES = 120; // short-lived voices alive at once
    const TEXTURE_VOICES = 80; // the crackle never takes the drops' share
    const FINGERS = 5;

    let ctx = null;
    let master = null;
    let lowShelf = null;
    let highShelf = null;
    let interval = 0;
    let paused = false;
    let dry = null;
    let wet = null;
    let fizzBus = null;
    let noise = null;
    let voices = 0;
    let agitation = 0;
    let focus = { x: 0.5, y: 0.6 };
    let nextLap = 0;
    let nextDrip = 0;
    let nextWind = 0;
    let nextBubble = 0;
    const fingers = [];
    const foamQueue = [];

    // ---------------------------------------------------------------- noise

    // Looped noise. Stereo buffers are partly decorrelated by `width`, so the
    // bed opens up around the head instead of sitting in the middle.
    const noiseBuffer = (kind, channels, seconds = 8) => {
      const length = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(channels, length, ctx.sampleRate);
      const independent = [];
      for (let channel = 0; channel < channels; channel += 1) {
        const data = new Float32Array(length);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        let last = 0;
        for (let i = 0; i < length; i += 1) {
          const white = Math.random() * 2 - 1;
          if (kind === "brown") {
            last = (last + 0.02 * white) / 1.02;
            data[i] = last * 3.5;
          } else if (kind === "white") {
            data[i] = white * 0.5;
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
        independent.push(data);
      }
      const shared = 1 - clamp(config.width, 0, 1);
      const own = Math.sqrt(1 - shared * shared);
      for (let channel = 0; channel < channels; channel += 1) {
        const out = buffer.getChannelData(channel);
        const mine = independent[channel];
        const first = independent[0];
        for (let i = 0; i < length; i += 1) {
          out[i] = channel === 0 ? mine[i] : mine[i] * own + first[i] * shared;
        }
        // Cross-fade the ends so the loop has no seam.
        const fade = Math.floor(ctx.sampleRate * 0.3);
        for (let i = 0; i < fade; i += 1) {
          const t = i / fade;
          out[i] = out[i] * t + out[length - fade + i] * (1 - t);
        }
      }
      return buffer;
    };

    const loop = (buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = buffer.duration - 0.3;
      source.start(0, rand(0, buffer.duration - 0.6));
      return source;
    };

    // ---------------------------------------------------------------- space

    // A soft, damped room: a few early reflections, then a stereo tail that
    // loses its highs as it fades, like sound over water at night.
    const reverb = () => {
      const seconds = 3.2;
      const rate = ctx.sampleRate;
      const length = Math.floor(rate * seconds);
      const impulse = ctx.createBuffer(2, length, rate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = impulse.getChannelData(channel);
        let low = 0;
        for (let i = 0; i < length; i += 1) {
          const t = i / length;
          // The tail darkens: the low-pass closes as it decays.
          const coefficient = 0.08 + 0.9 * t;
          low += (Math.random() * 2 - 1 - low) * (1 - coefficient);
          const onset = Math.min(1, i / (rate * 0.03));
          data[i] = low * Math.pow(1 - t, 2.6) * onset * 0.9;
        }
        for (let k = 0; k < 9; k += 1) {
          const at = Math.floor(rate * rand(0.004, 0.08));
          data[at] += (Math.random() < 0.5 ? -1 : 1) * rand(0.15, 0.45) * (1 - at / (rate * 0.1));
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;
      return convolver;
    };

    // A place in the space around the listener, from normalized page
    // coordinates. `far` pushes it out across the water.
    const place = (x, y, far = 0, binaural = config.binaural > 0) => {
      if (binaural && ctx.createPanner) {
        const node = ctx.createPanner();
        node.panningModel = "HRTF";
        node.distanceModel = "inverse";
        node.refDistance = 1;
        node.rolloffFactor = 0.35;
        setPlace(node, x, y, far);
        return node;
      }
      if (ctx.createStereoPanner) {
        const node = ctx.createStereoPanner();
        node.pan.value = clamp((x - 0.5) * 1.5, -1, 1);
        return node;
      }
      return ctx.createGain();
    };

    const setPlace = (node, x, y, far = 0, glide = 0) => {
      if (node.pan) {
        node.pan.setTargetAtTime(clamp((x - 0.5) * 1.5, -1, 1), ctx.currentTime, glide || 0.001);
        return;
      }
      if (!node.panningModel) {
        return;
      }
      const px = (x - 0.5) * 2.6;
      const py = (0.5 - y) * 0.7;
      // The bottom of the screen is the water close by; the top is far out.
      const pz = -(0.5 + (1 - y) * 0.9 + far * 4);
      if (node.positionX) {
        const time = ctx.currentTime;
        node.positionX.setTargetAtTime(px, time, glide || 0.001);
        node.positionY.setTargetAtTime(py, time, glide || 0.001);
        node.positionZ.setTargetAtTime(pz, time, glide || 0.001);
      } else {
        node.setPosition(px, py, pz);
      }
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

    // Short-lived voices clean up after themselves and are capped.
    const claim = (seconds, ...nodes) => {
      if (voices >= MAX_VOICES) {
        return false;
      }
      voices += 1;
      window.setTimeout(() => {
        voices -= 1;
        for (const node of nodes) {
          try {
            node.disconnect();
          } catch {
            // Already gone.
          }
        }
      }, (seconds + 0.2) * 1000);
      return true;
    };

    // ---------------------------------------------------------------- voices

    // One tiny bubble: a sine that rings and rises in pitch, as a bubble does
    // when it is born at the surface. Larger bubbles are lower and longer.
    const bubble = (time, frequency, gain, duration, output, rise = rand(1.4, 2.2)) => {
      if (gain < 0.0005) {
        return;
      }
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      if (!claim(duration + (time - ctx.currentTime), osc, env)) {
        return;
      }
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, time);
      osc.frequency.exponentialRampToValueAtTime(frequency * rise, time + duration);
      env.gain.setValueAtTime(0.00001, time);
      env.gain.exponentialRampToValueAtTime(gain, time + 0.0015);
      env.gain.exponentialRampToValueAtTime(0.00001, time + duration);
      osc.connect(env);
      env.connect(output);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    };

    // The crisp contact of something touching the surface.
    const click = (time, gain, brightness, output) => {
      const source = ctx.createBufferSource();
      source.buffer = noise.white;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = brightness;
      band.Q.value = 1.2;
      const env = ctx.createGain();
      env.gain.setValueAtTime(gain, time);
      env.gain.exponentialRampToValueAtTime(0.00001, time + 0.012);
      source.connect(band);
      band.connect(env);
      env.connect(output);
      source.start(time, rand(0, 8.5));
      source.stop(time + 0.02);
      claim(0.03 + (time - ctx.currentTime), source, band, env);
    };

    // A place for one gesture's sounds, with its own colour and room.
    const spot = (x, y, far, wetness, binaural) => {
      const where = place(x, y, far, binaural);
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 9000 - far * 6500;
      tone.Q.value = 0.3;
      where.connect(tone);
      send(tone, wetness);
      claim(1.2, where, tone);
      return where;
    };

    // A drop: contact click, the ringing bubble, a little body of water, and
    // a few droplets thrown back up that fall around it.
    const drop = (x, y, level, far = 0) => {
      if (!ctx || level < 0.002 || voices > MAX_VOICES - 12) {
        return;
      }
      const now = ctx.currentTime + 0.005;
      const out = spot(x, y, far, config.space * (0.8 + far * 2));
      const pitch = config.pitch * (1.1 - y * 0.25);

      click(now, level * 0.35, rand(3500, 6500) * (1 - far * 0.4), out);
      const base = rand(420, 820) * pitch;
      bubble(now + 0.002, base, level * 0.42, rand(0.1, 0.17), out, rand(1.8, 2.6));
      if (Math.random() < 0.5) {
        bubble(now + rand(0.02, 0.06), base * rand(1.6, 2.3), level * 0.14, rand(0.05, 0.09), out);
      }

      // The body: a soft, low thump of displaced water.
      const body = ctx.createBufferSource();
      body.buffer = noise.brownMono;
      const bodyFilter = ctx.createBiquadFilter();
      bodyFilter.type = "lowpass";
      bodyFilter.frequency.value = 260;
      const bodyEnv = ctx.createGain();
      bodyEnv.gain.setValueAtTime(0.00001, now);
      bodyEnv.gain.exponentialRampToValueAtTime(level * 0.5, now + 0.012);
      bodyEnv.gain.exponentialRampToValueAtTime(0.00001, now + 0.22);
      body.connect(bodyFilter);
      bodyFilter.connect(bodyEnv);
      bodyEnv.connect(out);
      body.start(now, rand(0, 5.5));
      body.stop(now + 0.25);
      claim(0.3, body, bodyFilter, bodyEnv);

      // Splash-back: droplets thrown up by the impact land around it.
      const count = Math.round(config.splash * rand(1, 4) * (far > 0.4 ? 0.4 : 1));
      for (let i = 0; i < count; i += 1) {
        const delay = rand(0.07, 0.32);
        const dx = x + rand(-0.06, 0.06);
        const dy = y + rand(-0.04, 0.04);
        const near = spot(dx, dy, far, config.space * 0.9, false);
        click(now + delay, level * 0.08, rand(5000, 8000), near);
        bubble(now + delay + 0.001, rand(1300, 2600) * pitch, level * rand(0.05, 0.12), rand(0.03, 0.06), near);
      }
      agitation = Math.min(3, agitation + level * 0.8);
    };

    // ---------------------------------------------------------------- bed

    // Water lapping at an unseen edge: deep stereo noise that swells and
    // settles, a mid-band slosh as it arrives, and foam fizzing as it recedes.
    let lapGain = null;
    let lapFilter = null;
    let sloshGain = null;
    let sloshFilter = null;
    const buildWater = () => {
      const source = loop(noise.brown);
      lapFilter = ctx.createBiquadFilter();
      lapFilter.type = "lowpass";
      lapFilter.frequency.value = 300;
      lapFilter.Q.value = 0.3;
      lapGain = ctx.createGain();
      lapGain.gain.value = config.water * 0.22;
      source.connect(lapFilter);
      lapFilter.connect(lapGain);
      send(lapGain, 0.25);

      const slosh = loop(noise.pink);
      sloshFilter = ctx.createBiquadFilter();
      sloshFilter.type = "bandpass";
      sloshFilter.frequency.value = 650;
      sloshFilter.Q.value = 0.8;
      sloshGain = ctx.createGain();
      sloshGain.gain.value = 0;
      slosh.connect(sloshFilter);
      sloshFilter.connect(sloshGain);
      send(sloshGain, 0.4);
    };

    const lap = (now) => {
      const strength = rand(0.5, 1) * config.water;
      const rise = rand(0.9, 1.8);
      const fall = rand(1.6, 3.2);
      const base = config.water * 0.2;
      lapGain.gain.setTargetAtTime(base + strength * 0.42, now, rise / 3);
      lapGain.gain.setTargetAtTime(base, now + rise, fall / 3);
      lapFilter.frequency.setTargetAtTime(300 + strength * 480, now, rise / 3);
      lapFilter.frequency.setTargetAtTime(260, now + rise, fall / 3);

      // The slosh arrives a moment after the swell, a little brighter.
      sloshFilter.frequency.setTargetAtTime(rand(500, 900), now, 0.4);
      sloshGain.gain.setTargetAtTime(strength * 0.09, now + rise * 0.6, rise / 4);
      sloshGain.gain.setTargetAtTime(0, now + rise, fall / 5);

      // Foam fizzing as it draws back: a fine shower that thins out.
      const count = Math.round(config.foam * strength * rand(18, 40));
      const side = Math.random();
      for (let i = 0; i < count; i += 1) {
        const t = Math.pow(Math.random(), 1.8) * fall * 0.8;
        foamQueue.push({
          at: now + rise * 0.85 + t,
          x: clamp(side + rand(-0.35, 0.35), 0, 1),
          gain: config.foam * strength * 0.05 * (1 - t / (fall * 0.9)),
        });
      }

      // `lap` is how restless the water is: 0 long pauses, 1 one swell after another.
      nextLap = now + rise + fall * rand(0.5, 1) * (0.6 + (1 - clamp(config.lap, 0, 1)) * 1.6);
    };
    // Air moving over the water: wide pink noise through a wandering band.
    let windGain = null;
    let windFilter = null;
    const buildWind = () => {
      const source = loop(noise.pink);
      windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = config.windTone;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = config.wind * 0.11;
      source.connect(windFilter);
      windFilter.connect(windGain);
      send(windGain, 0.2);
    };

    const gust = (now) => {
      windFilter.frequency.setTargetAtTime(config.windTone * rand(0.6, 1.5), now, 1.8);
      windGain.gain.setTargetAtTime(config.wind * rand(0.05, 0.18), now, 2);
      nextWind = now + rand(2.5, 6);
    };

    // A fine crackle of tiny bubbles in the water. Quiet and sparse when the
    // water rests; it wakes up around wherever it was last disturbed.
    const fizz = (time, x, gain, low = 2200, high = 6500) => {
      if (voices > TEXTURE_VOICES) {
        return;
      }
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (panner.pan) {
        panner.pan.value = clamp((x - 0.5) * 1.8, -1, 1);
      }
      panner.connect(fizzBus);
      bubble(time, rand(low, high) * config.pitch, gain, rand(0.006, 0.025), panner, rand(1.2, 1.8));
      claim(0.06 + (time - ctx.currentTime), panner);
    };

    // ---------------------------------------------------------------- fingers

    // Each finger in the water has its own hush, placed where it is, and
    // leaves a trickle of bubbles along its path.
    const buildFingers = () => {
      for (let i = 0; i < FINGERS; i += 1) {
        const source = loop(noise.pinkMono);
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 900;
        band.Q.value = 0.7;
        const low = ctx.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = 2400;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const where = place(0.5, 0.6, 0);
        source.connect(band);
        band.connect(low);
        low.connect(gain);
        gain.connect(where);
        send(where, 0.3);
        fingers.push({ x: 0.5, y: 0.6, level: 0, last: 0, band, low, gain, where });
      }
    };

    const fingerFor = (x, y, now) => {
      let best = null;
      let bestDistance = Infinity;
      for (const finger of fingers) {
        const recent = now - finger.last < 0.25;
        const distance = Math.hypot(finger.x - x, finger.y - y);
        if (recent && distance < 0.12 && distance < bestDistance) {
          best = finger;
          bestDistance = distance;
        }
      }
      if (best) {
        return best;
      }
      return fingers.reduce((a, b) => (a.last < b.last ? a : b));
    };

    const stroke = (x0, y0, x1, y1, length) => {
      const now = ctx.currentTime;
      const finger = fingerFor(x0, y0, now);
      const speed = clamp(length * 60, 0, 1.5);
      finger.x = x1;
      finger.y = y1;
      finger.last = now;
      finger.level = clamp(finger.level + length * 4 * config.stir, 0, config.stir);
      setPlace(finger.where, x1, y1, 0, 0.03);
      finger.band.frequency.setTargetAtTime(500 + speed * 1800, now, 0.06);
      finger.low.frequency.setTargetAtTime(1500 + speed * 3500, now, 0.06);

      // The trickle: bubbles released along the path, more when it moves fast.
      const expected = length * 140 * config.stir;
      let count = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
      count = Math.min(count, 6);
      for (let i = 0; i < count; i += 1) {
        const t = Math.random();
        const bx = x0 + (x1 - x0) * t;
        const time = now + 0.005 + rand(0, 0.07);
        if (Math.random() < 0.1) {
          // Now and then a deeper gulp of air.
          bubble(time, rand(220, 480) * config.pitch, config.stir * 0.12, rand(0.06, 0.11), finger.where, rand(1.5, 2.2));
        } else {
          fizz(time, bx, config.stir * rand(0.02, 0.06), 900, 3200);
        }
      }
      agitation = Math.min(3, agitation + length * 6);
      focus = { x: x1, y: y1 };
    };

    // ---------------------------------------------------------------- loop

    const onDisturb = ({ x0, y0, x1, y1 }) => {
      if (!ctx || ctx.state !== "running") {
        return;
      }
      const length = Math.hypot(x1 - x0, y1 - y0);
      if (length === 0) {
        drop(x1, y1, config.drop);
        focus = { x: x1, y: y1 };
        return;
      }
      stroke(x0, y0, x1, y1, length);
    };

    const step = () => {
      if (!ctx || ctx.state !== "running") {
        return;
      }
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;

      agitation *= 0.94;
      for (const finger of fingers) {
        finger.level *= 0.8;
        finger.gain.gain.setTargetAtTime(finger.level * 0.3, now, 0.05);
      }

      if (now >= nextLap) {
        lap(now);
      }
      if (now >= nextWind) {
        gust(now);
      }
      if (config.drips > 0 && now >= nextDrip) {
        drop(Math.random(), rand(0, 0.5), config.drop * rand(0.12, 0.3), rand(0.5, 1));
        nextDrip = now + rand(0.4, 1.6) * (60 / config.drips);
      }

      // Foam from the last swell, scheduled precisely.
      for (let i = foamQueue.length - 1; i >= 0; i -= 1) {
        const grain = foamQueue[i];
        if (grain.at < horizon) {
          foamQueue.splice(i, 1);
          if (grain.at >= now && grain.gain > 0) {
            fizz(grain.at, grain.x, grain.gain, 2500, 7500);
          }
        }
      }

      // The living crackle: a slow trickle at rest, more where it was touched.
      if (config.detail > 0) {
        const rate = config.detail * (3 + agitation * 22);
        if (nextBubble < now) {
          nextBubble = now;
        }
        while (nextBubble < horizon) {
          const near = Math.random() < agitation / 3;
          const x = near ? clamp(focus.x + rand(-0.15, 0.15), 0, 1) : Math.random();
          const loud = near ? rand(0.02, 0.05) : rand(0.008, 0.025);
          fizz(nextBubble, x, config.detail * loud);
          nextBubble += -Math.log(1 - Math.random()) / rate;
        }
      }
    };

    const fadeTo = (value, seconds) => {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(value, ctx.currentTime + seconds);
    };

    // iOS may refuse to start audio (the silent switch, another app holding
    // the audio session, no gesture yet). That is not an error: stay quiet
    // and try again on the next touch.
    const wake = () =>
      Promise.resolve(ctx?.resume?.())
        .catch(() => {})
        .then(() => {
          if (ctx && ctx.state !== "running") {
            listen();
          }
          return ctx?.state === "running";
        });

    const start = () => {
      if (paused || config.volume <= 0) {
        return;
      }
      if (ctx) {
        wake();
        return;
      }
      try {
        ctx = new AudioContext();
      } catch {
        return;
      }
      noise = {
        pink: noiseBuffer("pink", 2),
        brown: noiseBuffer("brown", 2),
        pinkMono: noiseBuffer("pink", 1, 6),
        brownMono: noiseBuffer("brown", 1, 6),
        white: noiseBuffer("white", 1, 9),
      };

      master = ctx.createGain();
      master.gain.value = 0;

      // Warmth: a little more body, a little less edge.
      const warm = clamp(config.warmth, 0, 1);
      lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 180;
      lowShelf.gain.value = warm * 4;
      highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 7500;
      highShelf.gain.value = -warm * 6;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.25;

      master.connect(lowShelf);
      lowShelf.connect(highShelf);
      highShelf.connect(limiter);
      limiter.connect(ctx.destination);

      dry = ctx.createGain();
      dry.connect(master);
      wet = ctx.createGain();
      wet.gain.value = config.space;
      const preDelay = ctx.createDelay(0.1);
      preDelay.delayTime.value = 0.022;
      const room = reverb();
      wet.connect(preDelay);
      preDelay.connect(room);
      room.connect(master);

      // The fine crackle shares one gentle band so it stays silky.
      fizzBus = ctx.createBiquadFilter();
      fizzBus.type = "lowpass";
      fizzBus.frequency.value = 9000;
      send(fizzBus, 0.5);

      buildWater();
      buildWind();
      buildFingers();

      const now = ctx.currentTime;
      nextLap = now + 0.5;
      nextWind = now + 1;
      nextDrip = now + rand(3, 8);
      nextBubble = now + 0.5;
      fadeTo(config.volume, 4);
      interval = window.setInterval(step, STEP_MS);
      wake();
    };

    const UNLOCK = ["pointerdown", "pointerup"];
    const unlock = () => {
      start();
      if (ctx && ctx.state === "running") {
        for (const type of UNLOCK) {
          element.removeEventListener(type, unlock);
        }
      }
    };
    // Adding the same listener twice is harmless, so this can be called
    // whenever the sound needs a touch to wake.
    function listen() {
      for (const type of UNLOCK) {
        element.addEventListener(type, unlock, { passive: true });
      }
    }
    listen();

    const unsubscribe = interaction?.onDisturb?.(onDisturb);

    const pause = () => {
      paused = true;
      if (!ctx) {
        return;
      }
      fadeTo(0, 0.3);
      window.setTimeout(
        () => paused && Promise.resolve(ctx?.suspend?.()).catch(() => {}),
        350,
      );
    };

    const resume = () => {
      paused = false;
      if (!ctx) {
        return;
      }
      wake().then((running) => running && !paused && fadeTo(config.volume, 2));
    };

    // A new mood changes the sound in place: the bed and the room glide to
    // their new levels, and everything scheduled from here on uses the new
    // values. The stereo width of the noise beds stays as it was built.
    const setMood = (mood) => {
      Object.assign(config, configFrom(mood));
      if (!ctx) {
        return;
      }
      const now = ctx.currentTime;
      const warm = clamp(config.warmth, 0, 1);
      wet.gain.setTargetAtTime(config.space, now, 1);
      lowShelf.gain.setTargetAtTime(warm * 4, now, 1);
      highShelf.gain.setTargetAtTime(-warm * 6, now, 1);
      windFilter.frequency.setTargetAtTime(config.windTone, now, 1.8);
      windGain.gain.setTargetAtTime(config.wind * 0.11, now, 2);
      lapGain.gain.setTargetAtTime(config.water * 0.2, now, 1);
      if (!paused) {
        fadeTo(config.volume, 2);
      }
    };

    const destroy = () => {
      paused = true;
      unsubscribe?.();
      for (const type of UNLOCK) {
        element.removeEventListener(type, unlock);
      }
      window.clearInterval(interval);
      if (ctx) {
        ctx.close?.();
        ctx = null;
      }
    };

    return { setMood, pause, resume, destroy };
  };
})();

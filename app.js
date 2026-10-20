(() => {
  "use strict";

  const mood = window.MOOD;
  const source = window.MOODPAGE_SHADER;
  const interaction = window.MOODPAGE_INTERACTION;
  const interactionConfig = interaction?.config ?? {};
  const canvas = document.getElementById("scene");

  if (!mood || !source || !canvas) {
    return;
  }

  document.title = "moodpage · " + mood.title;
  if (!mood.title) {
    document.title = "moodpage";
  }

  const title = document.querySelector("[data-mood-title]");
  const description = document.querySelector("[data-mood-description]");
  if (title) {
    title.textContent = "moodpage — " + mood.title;
  }
  if (description && mood.description) {
    description.textContent = mood.description;
  }

  const root = document.documentElement;
  const theme = document.querySelector('meta[name="theme-color"]');
  for (const [name, value] of Object.entries(mood.palette)) {
    root.style.setProperty("--" + name, value);
  }
  if (theme) {
    theme.setAttribute("content", mood.palette.night);
  }

  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    root.classList.add("no-webgl");
    return;
  }

  const compile = (type, text) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, source.vertex);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, source.fragment);
  const program = gl.createProgram();

  if (!vertexShader || !fragmentShader || !program) {
    root.classList.add("no-webgl");
    return;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    root.classList.add("no-webgl");
    return;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }

  const color = (hex) => {
    let value = hex.replace("#", "").trim();
    if (value.length === 3) {
      value = value
        .split("")
        .map((part) => part + part)
        .join("");
    }
    const number = Number.parseInt(value, 16);
    return [
      ((number >> 16) & 255) / 255,
      ((number >> 8) & 255) / 255,
      (number & 255) / 255,
    ];
  };

  const set = (name, value) => {
    const location = uniforms[name];
    if (!location) {
      return;
    }
    if (typeof value === "number") {
      gl.uniform1f(location, value);
    } else if (value.length === 2) {
      gl.uniform2f(location, value[0], value[1]);
    } else if (value.length === 3) {
      gl.uniform3f(location, value[0], value[1], value[2]);
    }
  };

  const palette = mood.palette;
  set("u_night", color(palette.night));
  set("u_deep", color(palette.deep));
  set("u_haze", color(palette.haze));
  set("u_light", color(palette.light));
  set("u_glow", color(palette.glow));

  set("u_lightRadius", mood.composition.lightRadius);
  set("u_lightIntensity", mood.composition.lightIntensity);
  set("u_rays", mood.composition.rays);
  set("u_scale", mood.composition.cloudScale);
  set("u_turbulence", mood.composition.turbulence);
  set("u_cover", mood.composition.cloudCover);
  set("u_drift", mood.motion.drift);

  set("u_grain", mood.atmosphere.grain);
  set("u_vignette", mood.atmosphere.vignette);
  set("u_motes", mood.atmosphere.motes);
  set("u_stars", mood.atmosphere.stars);
  set("u_rain", mood.atmosphere.rain);

  set("u_stirRadius", interactionConfig.radius ?? 0.3);
  set("u_stirPush", interactionConfig.push ?? 0.03);
  set("u_stirSwirl", interactionConfig.swirl ?? 0.035);
  set("u_stirStrength", 0);
  set("u_rippleSpeed", interactionConfig.rippleSpeed ?? 0.45);
  set("u_rippleStrength", 0);

  set("u_contrast", mood.grade.contrast);
  set("u_saturation", mood.grade.saturation);
  set("u_exposure", mood.grade.exposure || 1);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionScale = () =>
    reduceMotion.matches ? mood.motion.reducedMotionScale : 1;

  const baseLight = () => {
    const aspect = canvas.width / Math.max(canvas.height, 1);
    return [
      (mood.composition.lightX - 0.5) * aspect,
      0.5 - mood.composition.lightY,
    ];
  };

  let base = baseLight();
  let light = base.slice();
  let pointer = { x: 0, y: 0 };
  let pointerTarget = { x: 0, y: 0 };
  let last = performance.now();
  let elapsed = 0;
  let raf = 0;
  let active = true;

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const maxPixels = mood.quality.maxPixels || 3000000;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      mood.quality.maxPixelRatio || 1.25,
      Math.sqrt(maxPixels / Math.max(width * height, 1)),
    );
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      base = baseLight();
    }

    set("u_resolution", [pixelWidth, pixelHeight]);
  };

  const onPointerMove = (event) => {
    pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
  };

  const onPointerLeave = () => {
    pointerTarget.x = 0;
    pointerTarget.y = 0;
  };

  const draw = (now) => {
    if (!active) {
      return;
    }

    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += delta * mood.motion.speed * motionScale();

    const ease = Math.min(1, delta * 1.8);
    pointer.x += (pointerTarget.x - pointer.x) * ease;
    pointer.y += (pointerTarget.y - pointer.y) * ease;

    const stir = interaction?.state?.stir;
    const ripple = interaction?.state?.ripple;
    const interactionScale = interaction?.state?.motionScale ?? 1;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    let stirX = 0;
    let stirY = 0;
    let stirStrength = 0;

    if (stir) {
      stirX = (stir.x / Math.max(window.innerWidth, 1) - 0.5) * aspect;
      stirY = 0.5 - stir.y / Math.max(window.innerHeight, 1);
      stirStrength = stir.strength * interactionScale;

      let stirVelX = (stir.vx / Math.max(window.innerWidth, 1)) * aspect;
      let stirVelY = -(stir.vy / Math.max(window.innerHeight, 1));
      const stirSpeed = Math.hypot(stirVelX, stirVelY);
      if (stirSpeed > 2) {
        stirVelX = (stirVelX / stirSpeed) * 2;
        stirVelY = (stirVelY / stirSpeed) * 2;
      }

      set("u_stirPos", [stirX, stirY]);
      set("u_stirVel", [stirVelX, stirVelY]);
      set("u_stirStrength", stirStrength);
    } else {
      set("u_stirStrength", 0);
    }

    if (ripple) {
      const rippleX = (ripple.x / Math.max(window.innerWidth, 1) - 0.5) * aspect;
      const rippleY = 0.5 - ripple.y / Math.max(window.innerHeight, 1);
      const progress = Math.min(1, ripple.age / ripple.life);
      set("u_ripplePos", [rippleX, rippleY]);
      set("u_rippleAge", progress);
      set(
        "u_rippleStrength",
        (interactionConfig.rippleStrength ?? 0.8) * interactionScale,
      );
    } else {
      set("u_rippleStrength", 0);
    }

    const influence = mood.motion.parallax * 0.075;
    const pull = (interactionConfig.lightPull ?? 0.12) * stirStrength;
    const targetX = base[0] + pointer.x * influence + (stirX - base[0]) * pull;
    const targetY =
      base[1] - pointer.y * influence * 0.55 + (stirY - base[1]) * pull;
    light[0] += (targetX - light[0]) * ease;
    light[1] += (targetY - light[1]) * ease;

    set("u_time", elapsed);
    set("u_lightPos", light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    raf = window.requestAnimationFrame(draw);
  };

  const start = () => {
    if (active) {
      return;
    }
    active = true;
    last = performance.now();
    raf = window.requestAnimationFrame(draw);
  };

  const stop = () => {
    active = false;
    window.cancelAnimationFrame(raf);
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  };

  const onContextLost = (event) => {
    event.preventDefault();
    stop();
  };

  const onContextRestored = () => {
    window.location.reload();
  };

  resize();
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas);
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  reduceMotion.addEventListener("change", () => {
    last = performance.now();
  });
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  raf = window.requestAnimationFrame((now) => {
    last = now;
    draw(now);
  });
})();

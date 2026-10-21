/*
 * The sky renderer.
 *
 * MOODPAGE.createSky(canvas, mood, water) runs the weather shader on one
 * canvas. It returns null when WebGL is unavailable, so the caller can fall
 * back to the CSS atmosphere. setMood() swaps the uniforms in place: the
 * clouds keep moving through a change of weather.
 */
(() => {
  "use strict";

  const MOODPAGE = (window.MOODPAGE = window.MOODPAGE || {});

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

  MOODPAGE.createSky = (canvas, initialMood, interaction, options = {}) => {
    const source = window.MOODPAGE_SHADER;
    if (!initialMood || !source || !canvas) {
      return null;
    }

    let mood = initialMood;
    const interactionConfig = interaction?.config ?? {};

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      return null;
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
      return null;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return null;
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

    const setSampler = (name, unit) => {
      const location = uniforms[name];
      if (location) {
        gl.uniform1i(location, unit);
      }
    };

    // The water surface from interaction.js: a small height field uploaded as
    // a texture every frame. The shader turns its slope into weather.
    // A second texture of the same size carries the colour of the ink.
    const makeFieldTexture = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const waveTexture = makeFieldTexture();
    const tintTexture = makeFieldTexture();
    let waveTextureWidth = 0;
    let waveTextureHeight = 0;
    let waveData = null;

    const uploadWave = () => {
      const wave = interaction?.state?.wave;
      if (!wave || !wave.data) {
        return;
      }

      // A new grid (a resize, or a mood with other rows) is a new texture.
      const resized =
        wave.width !== waveTextureWidth ||
        wave.height !== waveTextureHeight ||
        wave.data !== waveData;
      waveTextureWidth = wave.width;
      waveTextureHeight = wave.height;
      waveData = wave.data;

      const upload = (unit, texture, pixels) => {
        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (resized) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            wave.width,
            wave.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            wave.width,
            wave.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
        }
      };

      upload(gl.TEXTURE0, waveTexture, wave.data);
      if (wave.tint) {
        upload(gl.TEXTURE1, tintTexture, wave.tint);
      }

      set("u_waveTexel", [1 / wave.width, 1 / wave.height]);
    };

    setSampler("u_wave", 0);
    setSampler("u_inkTint", 1);

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

    // Everything the mood says about the sky, as uniforms.
    const applyMood = () => {
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

      // The surface the sky is seen in. All three stay off for moods without
      // a water block.
      const water = mood.water || {};
      set("u_water", water.surface ?? 0);
      set("u_glints", water.glints ?? 0);
      set("u_ink", interaction ? (water.inkGlow ?? 0) : 0);
      set("u_plankton", water.plankton ?? 0);

      set("u_contrast", mood.grade.contrast);
      set("u_saturation", mood.grade.saturation);
      set("u_exposure", mood.grade.exposure || 1);
    };

    applyMood();

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
      const rect = canvas.getBoundingClientRect();
      pointerTarget.x =
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      pointerTarget.y =
        ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
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

      uploadWave();

      // Reduced motion softens the water's visible force as well as slowing
      // it.
      const waveScale = interaction?.state?.motionScale ?? 1;
      set(
        "u_waveWarp",
        interaction ? (interactionConfig.warp ?? 1.0) * waveScale : 0,
      );
      set(
        "u_waveGlow",
        interaction ? (interactionConfig.glow ?? 0.2) * waveScale : 0,
      );

      const influence = mood.motion.parallax * 0.075;
      const targetX = base[0] + pointer.x * influence;
      const targetY = base[1] - pointer.y * influence * 0.55;
      light[0] += (targetX - light[0]) * ease;
      light[1] += (targetY - light[1]) * ease;

      set("u_time", elapsed);
      set("u_lightPos", light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      raf = window.requestAnimationFrame(draw);
    };

    const resume = () => {
      if (active) {
        return;
      }
      active = true;
      last = performance.now();
      raf = window.requestAnimationFrame(draw);
    };

    const pause = () => {
      active = false;
      window.cancelAnimationFrame(raf);
    };

    // The light glides to its new place rather than jumping there.
    const setMood = (next) => {
      mood = next;
      applyMood();
      base = baseLight();
      resize();
    };

    const onContextLost = (event) => {
      event.preventDefault();
      pause();
    };

    const onContextRestored = () => {
      options.onContextRestored?.();
    };

    const onMotionChange = () => {
      last = performance.now();
    };

    resize();
    const observer =
      "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    if (observer) {
      observer.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerleave", onPointerLeave);
    reduceMotion.addEventListener("change", onMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    raf = window.requestAnimationFrame((now) => {
      last = now;
      draw(now);
    });

    // Free the GPU now rather than whenever the garbage collector gets to it:
    // phones only allow a handful of live WebGL contexts.
    const destroy = ({ keepContext = false } = {}) => {
      pause();
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      reduceMotion.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (!gl.isContextLost()) {
        gl.deleteTexture(waveTexture);
        gl.deleteTexture(tintTexture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!keepContext) {
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      }
    };

    return { setMood, pause, resume, destroy };
  };
})();

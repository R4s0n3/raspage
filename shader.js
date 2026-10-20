/*
 * The weather engine.
 *
 * One full-screen triangle, one fragment shader. All of the day-to-day
 * expression lives in mood.js; touch this file only when a feeling needs
 * a shape the existing uniforms cannot make.
 */
window.MOODPAGE_SHADER = {
  vertex: `
    attribute vec2 a_position;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `,

  fragment: `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif

    uniform vec2 u_resolution;
    uniform float u_time;

    uniform vec3 u_night;
    uniform vec3 u_deep;
    uniform vec3 u_haze;
    uniform vec3 u_light;
    uniform vec3 u_glow;

    uniform vec2 u_lightPos;
    uniform float u_lightRadius;
    uniform float u_lightIntensity;
    uniform float u_rays;

    uniform float u_drift;
    uniform float u_scale;
    uniform float u_turbulence;
    uniform float u_cover;

    uniform float u_grain;
    uniform float u_vignette;
    uniform float u_motes;
    uniform float u_stars;
    uniform float u_rain;

    uniform float u_contrast;
    uniform float u_saturation;
    uniform float u_exposure;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));

      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);

      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p = turn * p * 2.03 + 17.1;
        amplitude *= 0.5;
      }

      return value / 0.9375;
    }

    float dust(vec2 p, float scale, float speed, float seed, float t) {
      vec2 sp = p * scale;
      sp.y -= t * speed;
      sp.x += t * speed * 0.22;

      vec2 id = floor(sp);
      vec2 f = fract(sp) - 0.5;
      float rnd = hash21(id + seed);

      if (rnd < 0.76) {
        return 0.0;
      }

      vec2 offset = (vec2(hash21(id + seed + 1.7), hash21(id + seed + 9.2)) - 0.5) * 0.72;
      float d = length(f - offset);
      float radius = mix(0.03, 0.105, hash21(id + seed + 4.1));
      float orb = smoothstep(radius, 0.0, d);
      float alpha = 0.2 + 0.8 * hash21(id + seed + 6.3);

      return orb * alpha;
    }

    float stars(vec2 p, float t) {
      vec2 sp = p * 92.0;
      vec2 id = floor(sp);
      vec2 f = fract(sp) - 0.5;
      float rnd = hash21(id);

      if (rnd < 0.91) {
        return 0.0;
      }

      vec2 offset = (vec2(hash21(id + 3.3), hash21(id + 7.7)) - 0.5) * 0.66;
      float d = length(f - offset);
      float twinkle = 0.5 + 0.5 * sin(t * (0.55 + rnd * 1.6) + rnd * 42.0);

      return smoothstep(0.052, 0.0, d) * (0.3 + 0.7 * twinkle);
    }

    float rain(vec2 p, float t) {
      vec2 rp = p;
      rp.x += rp.y * 0.16;

      vec2 grid = rp * vec2(82.0, 17.0);
      grid.y -= t * 1.35;
      grid.x += t * 0.12;

      vec2 id = floor(grid);
      vec2 f = fract(grid) - 0.5;
      float rnd = hash21(id + 12.4);

      if (rnd < 0.84) {
        return 0.0;
      }

      float x = (rnd - 0.84) / 0.16 - 0.5;
      float width = smoothstep(0.045, 0.0, abs(f.x - x * 0.75));
      float streak = smoothstep(0.5, 0.0, abs(f.y));
      float alpha = 0.35 + 0.65 * hash21(id + 2.8);

      return width * streak * alpha;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
      float t = u_time;

      vec2 lp = u_lightPos;
      float dist = length(p - lp);
      float halo = exp(-dist / (u_lightRadius * 1.35));
      float core = exp(-pow(dist / (u_lightRadius * 0.235), 2.0));
      float nearLight = exp(-dist / (u_lightRadius * 0.8));
      float ambient = exp(-dist / (u_lightRadius * 2.5));

      // A deep, breathing sky. The light sits inside it, not on top of it.
      vec3 col = mix(u_deep, u_night, smoothstep(-0.58, 0.62, p.y));
      float cool = exp(-length((p - vec2(-0.38, -0.3)) * vec2(0.8, 1.0)) / 0.92);
      col = mix(col, u_haze * 0.8, cool * 0.16);
      col += mix(u_glow, u_light, 0.35) * halo * 0.16 * u_lightIntensity;
      col += u_glow * core * 0.45 * u_lightIntensity;

      // Weather: liquid, slow, uneven. Two passes of domain warping.
      vec2 q = vec2(p.x * u_scale, p.y * u_scale * 1.45);
      q.x += t * u_drift;

      vec2 w1 = vec2(
        fbm(q + vec2(0.0, t * 0.052)),
        fbm(q + vec2(3.7, 8.2) - vec2(t * 0.038, 0.0))
      ) - 0.5;

      vec2 w2 = vec2(
        fbm(q + w1 * u_turbulence * 1.65 + vec2(1.3, 5.7)),
        fbm(q + w1 * u_turbulence * 1.65 + vec2(9.2, 2.4))
      ) - 0.5;

      float weather = fbm(q + w1 * 0.5 + w2 * u_turbulence * 1.8);
      float detail = fbm(q * 2.6 + w1 * 1.2 + vec2(t * 0.03, -t * 0.015));

      float threshold = mix(0.64, 0.2, u_cover);
      float cloud = smoothstep(threshold, threshold + 0.085, weather);
      cloud *= mix(0.58, 1.0, smoothstep(0.18, 0.78, detail));

      // Let the light find an opening in the weather.
      float opening = smoothstep(u_lightRadius * 0.18, u_lightRadius * 1.5, dist);
      cloud *= mix(0.44, 1.0, opening);

      // The fine edge of a cloud catches the light.
      float inner = smoothstep(threshold + 0.08, threshold + 0.22, weather);
      float rim = clamp(cloud - inner, 0.0, 1.0);

      vec3 cloudShadow = mix(u_night * 1.1, u_deep, 0.62);
      vec3 cloudShade = mix(cloudShadow, u_haze, smoothstep(0.25, 0.78, weather) * 0.9);
      cloudShade += u_light * pow(smoothstep(0.35, 0.9, detail), 2.0) * 0.1;
      cloudShade = mix(cloudShade, u_light, rim * (0.14 + nearLight * 0.5));
      cloudShade = mix(cloudShade, u_glow, rim * nearLight * 0.16 * u_lightIntensity);

      col = mix(col, cloudShade, cloud * 0.88);

      // Light diffusing through the weather.
      col += mix(u_glow, u_light, 0.3) * halo * 0.13 * u_lightIntensity * (1.0 - cloud * 0.45);
      col += u_glow * core * 0.28 * u_lightIntensity * (1.0 - cloud * 0.72);

      // A high, nearly transparent veil makes the depth feel larger.
      float veil = smoothstep(0.55, 0.82, detail) * smoothstep(-0.2, 0.35, p.y);
      col = mix(col, mix(u_deep, u_light, 0.32), veil * 0.045);

      // Soft rays, only where the light is strong.
      float angle = atan(p.y - lp.y, p.x - lp.x);
      float rayNoise = noise(vec2(angle * 1.7 + 19.7, t * 0.06));
      float rays = pow(max(sin(angle * 9.0 + rayNoise * 5.5), 0.0), 5.0);
      rays *= exp(-dist / (u_lightRadius * 1.3));
      col += mix(u_glow, u_light, 0.55) * rays * 0.045 * u_rays * u_lightIntensity;

      // Dust suspended in the air.
      if (u_motes > 0.001) {
        float dustField =
          dust(p, 12.0, 0.02, 2.0, t) +
          dust(p, 22.0, -0.012, 8.0, t) * 0.6;
        dustField *= 0.4 + ambient * 0.9 + nearLight * 0.35;
        dustField *= 0.7 + (1.0 - cloud) * 0.5;
        col += mix(u_light, u_glow, 0.32) * dustField * u_motes * 0.42;
      }

      // Stars only where the sky is clear.
      if (u_stars > 0.001) {
        float starField = stars(p, t);
        starField *= (1.0 - cloud * 0.85) * (0.55 + 0.45 * ambient);
        col += mix(u_light, vec3(1.0), 0.4) * starField * u_stars * 0.72;
      }

      if (u_rain > 0.001) {
        float rainField = rain(p, t);
        col += mix(u_light, u_haze, 0.45) * rainField * u_rain * 0.24;
      }

      // Film, not pixels.
      float grainTime = floor(t * 12.0);
      float grain = hash21(gl_FragCoord.xy + vec2(grainTime * 0.73, grainTime * 1.17)) - 0.5;
      col += grain * u_grain;

      // Vignette
      vec2 vp = p * vec2(0.94, 1.0);
      float vignette = smoothstep(0.38, 1.0, length(vp) * 1.18);
      col *= 1.0 - vignette * u_vignette;

      // Grade
      col *= u_exposure;
      col = (col - 0.5) * u_contrast + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, u_saturation);
      col = max(col, 0.0);

      // Soft shoulder so the glow blooms instead of clipping.
      vec3 over = max(col - 0.7, 0.0);
      col = min(col, 0.7) + 0.3 * (1.0 - exp(-over * 5.0));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

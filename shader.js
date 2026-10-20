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

    uniform sampler2D u_wave;
    uniform vec2 u_waveTexel;
    uniform float u_waveWarp;
    uniform float u_waveGlow;

    uniform float u_water;
    uniform float u_glints;
    uniform float u_ink;

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

    // Wind on the water: two layers of wavelets laid on a receding plane, so
    // they stretch into horizontal shimmer and tighten towards the top.
    float wavelets(vec2 sp, float t) {
      float z = 1.0 / (1.08 - sp.y * 0.72);
      vec2 g = vec2(sp.x * z, z);
      float h =
        noise(vec2(g.x * 6.0 + t * 0.9, g.y * 22.0 - t * 1.7)) * 0.62 +
        noise(vec2(g.x * 13.0 - t * 1.3, g.y * 41.0 + t * 2.3)) * 0.38;
      return h / (z * z);
    }

    // Small flickering points where the light's reflection breaks on the
    // wavelets. Cells are wider than tall, so each glint is a short dash.
    float glints(vec2 p, float t, float crest) {
      vec2 grid = vec2(p.x * 150.0, p.y * 230.0);
      vec2 id = floor(grid);
      vec2 f = fract(grid) - 0.5;
      float rnd = hash21(id + 31.7);

      if (rnd < 0.5) {
        return 0.0;
      }

      vec2 offset = (vec2(hash21(id + 5.1), hash21(id + 11.9)) - 0.5) * 0.5;
      float d = length((f - offset) * vec2(0.8, 1.8));
      float flicker = pow(0.5 + 0.5 * sin(t * (14.0 + rnd * 22.0) + rnd * 61.0), 10.0);

      return smoothstep(0.34, 0.0, d) * flicker * (0.15 + 0.85 * crest);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
      float t = u_time;

      // Water left by a touch. u_wave is a coarse height field written by
      // interaction.js: R height, G/B slope (x3), A ink. The slope bends the
      // reflection and catches the light.
      vec2 wuv = vec2(uv.x, 1.0 - uv.y);
      vec2 waveGrad = vec2(0.0);
      float waveLight = 0.0;

      if (u_waveWarp > 0.001 || u_waveGlow > 0.001) {
        vec4 surface = texture2D(u_wave, wuv);
        float wave = surface.r - 0.5;
        waveGrad = (surface.gb - 0.5) / 3.0;
        float slope = length(waveGrad);

        waveLight =
          smoothstep(0.015, 0.16, wave) * 0.62 +
          smoothstep(0.008, 0.075, slope) * 0.38;
      }

      // Wind on the surface. Off when u_water is zero.
      vec2 wind = vec2(0.0);
      float crest = 0.0;
      if (u_water > 0.001) {
        float eps = 0.0025;
        float w0 = wavelets(p, t);
        float wx = wavelets(p + vec2(eps, 0.0), t);
        float wy = wavelets(p + vec2(0.0, eps), t);
        wind = vec2(wx - w0, wy - w0) / eps * 0.003 * u_water;
        crest = smoothstep(0.42, 0.78, w0 * 1.6);
      }

      // Everything above the water is seen in it: read the sky through the
      // moving surface.
      vec2 warp = waveGrad * u_waveWarp;
      vec2 pr = p + wind + warp * 0.35;

      // On water the light's reflection stretches towards the viewer.
      vec2 lp = u_lightPos;
      float dist = length((pr - lp) * vec2(1.0, mix(1.0, 0.82, u_water)));
      float halo = exp(-dist / (u_lightRadius * 1.35));
      float core = exp(-pow(dist / (u_lightRadius * 0.235), 2.0));
      float nearLight = exp(-dist / (u_lightRadius * 0.8));
      float ambient = exp(-dist / (u_lightRadius * 2.5));
      float wide = exp(-dist / (u_lightRadius * 3.1));

      // A deep, breathing sky. The light sits inside it, not on top of it.
      vec3 col = mix(u_deep, u_night, smoothstep(-0.58, 0.62, pr.y));
      float cool = exp(-length((pr - vec2(-0.38, -0.3)) * vec2(0.8, 1.0)) / 0.92);
      col = mix(col, u_haze * 0.8, cool * 0.16);

      // A band of haze near the horizon gives the air a floor to stand on.
      float horizon = exp(-pow((pr.y - lp.y + 0.08) * 1.55, 2.0));
      float horizonWarmth = clamp(1.0 - dist / (u_lightRadius * 3.4), 0.0, 1.0);
      col = mix(col, u_haze, horizon * 0.018);
      col += mix(u_haze, u_glow, 0.3) * horizon * horizonWarmth * 0.035 * u_lightIntensity;

      // Wide bloom: the light spilling into the air rather than a lamp.
      col += mix(u_glow, u_light, 0.3) * wide * 0.04 * u_lightIntensity;
      col += mix(u_glow, u_light, 0.35) * halo * 0.16 * u_lightIntensity;
      col += u_glow * core * 0.45 * u_lightIntensity;

      // Weather: liquid, slow, uneven. Two passes of domain warping.
      vec2 q = vec2((pr.x + warp.x) * u_scale, (pr.y + warp.y) * u_scale * 1.45);
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
      float cloud = smoothstep(threshold, threshold + 0.09, weather);
      cloud *= mix(0.55, 1.0, smoothstep(0.18, 0.8, detail));

      // Let the light find an opening in the weather.
      float opening = smoothstep(u_lightRadius * 0.18, u_lightRadius * 1.5, dist);
      cloud *= mix(0.44, 1.0, opening);

      // The fine edge of a cloud catches the light.
      float inner = smoothstep(threshold + 0.095, threshold + 0.24, weather);
      float rim = clamp(cloud - inner, 0.0, 1.0);
      float reach = exp(-dist / (u_lightRadius * 1.7));

      vec3 cloudShadow = mix(u_night * 1.1, u_deep, 0.62);
      vec3 cloudShade = mix(cloudShadow, u_haze, smoothstep(0.22, 0.8, weather) * 0.9);

      // Distant weather turns cooler and dimmer; weather near the light
      // picks up transmission, as if the light were behind it.
      cloudShade = mix(cloudShade, u_night * 1.08, (1.0 - reach) * 0.12);
      float trans = pow(smoothstep(threshold, threshold + 0.34, weather), 2.0);
      cloudShade += mix(u_haze, u_light, 0.55) * trans * reach * 0.09;

      cloudShade += u_light * pow(smoothstep(0.35, 0.9, detail), 2.0) * 0.1;

      // A silver lining, warmer where the light is close.
      vec3 lining = mix(u_light, u_glow, clamp(nearLight * 0.6, 0.0, 1.0));
      cloudShade = mix(cloudShade, lining, rim * (0.15 + nearLight * 0.55));
      cloudShade = mix(cloudShade, u_glow, rim * nearLight * 0.14 * u_lightIntensity);

      col = mix(col, cloudShade, cloud * 0.88);

      // Light caught on the moving surface of the water.
      col += mix(u_light, u_glow, 0.42) * waveLight * u_waveGlow * mix(1.0, 0.45, u_water);

      // Light diffusing through the weather.
      col += mix(u_glow, u_light, 0.3) * halo * 0.13 * u_lightIntensity * (1.0 - cloud * 0.45);
      col += u_glow * core * 0.28 * u_lightIntensity * (1.0 - cloud * 0.72);

      // A high, nearly transparent veil makes the depth feel larger, and
      // catches a little of the light where it crosses the clearing.
      float veil = smoothstep(0.55, 0.82, detail) * smoothstep(-0.2, 0.35, pr.y);
      vec3 veilColor = mix(u_deep, u_light, 0.32);
      veilColor = mix(veilColor, mix(u_light, u_glow, 0.3), reach * 0.35);
      col = mix(col, veilColor, veil * 0.06);

      // Soft rays, only where the light is strong.
      float angle = atan(pr.y - lp.y, pr.x - lp.x);
      float rayNoise =
        noise(vec2(angle * 1.7 + 19.7, t * 0.06)) * 0.7 +
        noise(vec2(angle * 3.9 + 4.1, t * 0.031)) * 0.3;
      float rays = pow(max(sin(angle * 9.0 + rayNoise * 5.5), 0.0), 5.0);
      float rayFade = 0.6 + 0.4 * noise(vec2(angle * 2.2, t * 0.045 + 7.3));
      rays *= exp(-dist / (u_lightRadius * 1.5)) * rayFade;
      rays *= 1.0 - cloud * 0.55;
      col += mix(u_glow, u_light, 0.55) * rays * 0.06 * u_rays * u_lightIntensity;

      // The water itself. Near the bottom of the frame we look down into
      // it; towards the top it turns to a mirror.
      if (u_water > 0.001) {
        float mirror = mix(0.56, 1.0, smoothstep(-0.55, 0.48, p.y));
        vec3 body = mix(u_night, u_deep, 0.6) + u_haze * 0.035;
        col = mix(col, mix(body, col, mirror), u_water);

        // The wind leaves fine lines of light across the reflection.
        col += mix(u_haze, u_light, 0.4) * crest * (0.012 + ambient * 0.05) * u_water;
      }

      // Ripples from a touch, lit from the side that faces the light.
      if (u_waveGlow > 0.001) {
        vec2 toLight = normalize(lp - p + vec2(1e-4));
        float facing = dot(-waveGrad, toLight);
        float lit = clamp(facing * 9.0, 0.0, 1.0);
        float shade = clamp(-facing * 6.0, 0.0, 1.0);
        vec3 sheen = mix(u_light, u_glow, 0.35 + 0.4 * nearLight);
        col += sheen * lit * u_waveGlow * (0.35 + ambient * 0.9) * u_water;
        col *= 1.0 - shade * u_waveGlow * 0.7 * u_water;
      }

      // The light's path on the water: a broken column of glints running
      // from the light towards the viewer, narrow near it and wider below.
      if (u_glints > 0.001) {
        vec2 d = p - lp;
        float along = max(-d.y, 0.0);
        float width = u_lightRadius * (0.12 + along * 0.32);
        float reachDown = exp(-along / (u_lightRadius * 1.5));
        float reachUp = exp(-pow(max(d.y, 0.0) / (u_lightRadius * 0.28), 2.0));
        float path = exp(-pow(d.x / width, 2.0)) * reachDown * reachUp;
        float sparkle = glints(p + wind * 0.6, t, crest);
        float clear = 1.0 - cloud * 0.6;
        vec3 glintColor = mix(u_light, u_glow, 0.45);
        col += glintColor * path * 0.07 * u_glints * clear;
        col += mix(glintColor, vec3(1.0), 0.25) * sparkle * path * u_glints * 2.2 * clear;
      }

      // Ink drawn into the water, carried by the surface.
      if (u_ink > 0.001) {
        vec2 iuv = wuv + vec2(wind.x / aspect, -wind.y) * 0.7;
        float inkHere = texture2D(u_wave, iuv).a;
        vec2 o = u_waveTexel * 1.6;
        float inkAround = (
          texture2D(u_wave, iuv + vec2(o.x, 0.0)).a +
          texture2D(u_wave, iuv - vec2(o.x, 0.0)).a +
          texture2D(u_wave, iuv + vec2(0.0, o.y)).a +
          texture2D(u_wave, iuv - vec2(0.0, o.y)).a
        ) * 0.25;
        // Pigment gathers at the edge of a wet stroke.
        float edge = max(inkHere - inkAround, 0.0);
        vec3 inkColor = mix(u_light, u_glow, 0.3 + 0.5 * nearLight);
        float inkLight = inkHere * 0.6 + edge * 2.2 + inkAround * 0.22;
        col += inkColor * inkLight * (0.8 + 0.4 * crest) * u_ink;
      }

      // Dust suspended in the air.
      if (u_motes > 0.001) {
        float dustField =
          dust(pr, 12.0, 0.02, 2.0, t) +
          dust(pr, 22.0, -0.012, 8.0, t) * 0.6;
        dustField *= 0.4 + ambient * 0.9 + nearLight * 0.35;
        dustField *= 0.7 + (1.0 - cloud) * 0.5;
        col += mix(u_light, u_glow, 0.32) * dustField * u_motes * 0.42;
      }

      // Stars only where the sky is clear.
      if (u_stars > 0.001) {
        float starField = stars(pr, t);
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

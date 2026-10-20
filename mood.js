/*
 * The current mood.
 *
 * This is the file the agent edits each day after reading the diary prompt.
 * Numbers are deliberately generous: small adjustments go a long way.
 * See AGENT.md for the full field guide.
 */
window.MOOD = {
  title: "Threshold",
  date: "2026-10-20",
  description:
    "A quiet, wide dusk. Cool air, a low amber light, and the feeling of standing at the beginning of something.",

  palette: {
    night: "#04060d", // the darkest air, the edges of the room
    deep: "#0b1a2c", // the main body of the sky
    haze: "#3a626c", // drifting weather, the far distance
    light: "#d3dfdb", // lit edges, dust, a pale place in the clouds
    glow: "#ffd0a0", // the hidden light, the warm point of feeling
  },

  composition: {
    cloudCover: 0.54, // 0 = clear, 1 = heavy weather
    cloudScale: 1.52, // size of the moving cloud forms
    turbulence: 1.15, // how much the clouds curl and tear
    lightX: 0.65,
    lightY: 0.435,
    lightRadius: 0.4,
    lightIntensity: 0.78,
    rays: 0.22,
  },

  atmosphere: {
    grain: 0.03,
    vignette: 0.4,
    motes: 0.18,
    stars: 0.1,
    rain: 0.0,
  },

  motes: {
    streamers: 140,
    dust: 150,
    bokeh: 12,
    trailLength: 150,
    speed: 54,
    orbit: 11,
    driftX: 3,
    driftY: -2,
    fieldScale: 1,
    opacity: 0.95,
  },

  motion: {
    speed: 0.24, // 1.0 is lively; 0.2 is barely moving
    drift: 0.04, // horizontal travel of the weather
    parallax: 0.5, // how much the light follows the pointer (0 = off)
    reducedMotionScale: 0.16,
  },

  grade: {
    contrast: 1.04,
    saturation: 0.92,
    exposure: 1.0,
  },

  quality: {
    maxPixelRatio: 1.25,
    maxPixels: 3000000,
  },
};

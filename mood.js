/*
 * The current mood.
 *
 * This is the file the agent edits each day after reading the diary prompt.
 * Numbers are deliberately generous: small adjustments go a long way.
 * See AGENT.md for the full field guide.
 */
window.MOOD = {
  title: "Unfinished Gold",
  date: "2026-10-20",
  description:
    "A high, open gold. Quick light lifts through cool air and gathers around a warm centre, while a few long trails drift quietly past the edge.",

  palette: {
    night: "#05070b", // the darkest air, the edges of the room
    deep: "#16202c", // the main body of the sky
    haze: "#5c736f", // drifting weather, the cool distance
    light: "#f4e3c2", // lit edges, dust, warm parchment
    glow: "#ffb25e", // the hidden light, the point of celebration
  },

  composition: {
    cloudCover: 0.4, // 0 = clear, 1 = heavy weather
    cloudScale: 1.2, // size of the moving cloud forms
    turbulence: 0.9, // how much the clouds curl and tear
    lightX: 0.57,
    lightY: 0.35,
    lightRadius: 0.5,
    lightIntensity: 0.9,
    rays: 0.26,
  },

  atmosphere: {
    grain: 0.028,
    vignette: 0.34,
    motes: 0.22,
    stars: 0.05,
    rain: 0.0,
  },

  motes: {
    streamers: 185,
    strays: 9,
    dust: 180,
    bokeh: 16,
    trailLength: 190,
    speed: 62,
    orbit: 14,
    driftX: 4.5,
    driftY: -3.5,
    fieldScale: 0.94,
    opacity: 1.0,
  },

  interaction: {
    radius: 0.4, // size of the stir in scene units
    push: 0.08, // cloud displacement from drag velocity
    swirl: 0.08, // cloud displacement from the vortex
    streamWake: 0.22, // how much nearby streams follow the drag
    streamSwirl: 65, // vortex speed added to nearby streams (px/s)
    rippleSpeed: 0.45, // how far a tap ring travels over its life
    rippleStrength: 1.4, // brightness and distortion of the tap ring
    lightPull: 0.16, // how far the focal light leans toward a drag
    reducedMotionScale: 0.35,
  },

  motion: {
    speed: 0.26, // 1.0 is lively; 0.2 is barely moving
    drift: 0.05, // horizontal travel of the weather
    parallax: 0.55, // how much the light follows the pointer (0 = off)
    reducedMotionScale: 0.16,
  },

  grade: {
    contrast: 1.03,
    saturation: 0.95,
    exposure: 1.06,
  },

  quality: {
    maxPixelRatio: 1.25,
    maxPixels: 3000000,
  },
};

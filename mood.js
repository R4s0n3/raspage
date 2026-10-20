/*
 * The current mood.
 *
 * This is the file the agent edits each day after reading the diary prompt.
 * Numbers are deliberately generous: small adjustments go a long way.
 * See AGENT.md for the full field guide.
 */
window.MOOD = {
  title: "Drawing Water",
  date: "2026-10-20",
  description:
    "Still, dark water holding the evening sky. The gold light breaks into glints on the surface, slow trails skate across it, and anything drawn into it spreads like ink and fades.",

  palette: {
    night: "#03070b", // the darkest water, the edges of the room
    deep: "#0f2431", // the body of the water and the sky it holds
    haze: "#4f7d80", // reflected weather, cool green-blue distance
    light: "#efe6cf", // lit edges, glints, wet paper
    glow: "#ffb866", // the light on the water
  },

  composition: {
    cloudCover: 0.44, // 0 = clear, 1 = heavy weather
    cloudScale: 1.15, // size of the moving cloud forms
    turbulence: 0.85, // how much the clouds curl and tear
    lightX: 0.6,
    lightY: 0.3,
    lightRadius: 0.46,
    lightIntensity: 0.92,
    rays: 0.18,
  },

  atmosphere: {
    grain: 0.026,
    vignette: 0.38,
    motes: 0.14,
    stars: 0.06,
    rain: 0.0,
  },

  water: {
    surface: 1.0, // 0 = open air, 1 = the sky is seen in dark water
    glints: 0.85, // the light's broken path on the surface
    inkGlow: 0.75, // how brightly drawn ink shows in the water
  },

  motes: {
    streamers: 120,
    strays: 12,
    dust: 120,
    bokeh: 12,
    trailLength: 240,
    speed: 40,
    orbit: 9,
    driftX: 6,
    driftY: -1.5,
    fieldScale: 0.85,
    opacity: 0.82,
    flatten: 0.8, // 0 = free flight, 1 = streams glide flat on the water
  },

  interaction: {
    rows: 104, // water grid height; cells stay roughly square at any viewport
    radius: 3.0, // radius of a drop in grid cells
    drop: 0.08, // height deposited by each point along a stroke
    tap: 0.85, // height deposited by a single tap
    spacing: 2.2, // cells between deposits along a stroke
    speed: 0.27, // wave propagation, 0.5 is the stable maximum
    damping: 0.997, // how quickly the water goes still
    streamPush: 900, // how strongly streams ride the surface slope (px/s)
    warp: 1.4, // cloud displacement from the surface slope
    glow: 0.3, // light caught on the crests
    reducedMotionScale: 0.35,
    ink: 0.7, // light drawn into the water along a stroke (0 = none)
    inkRadius: 1.7, // width of the drawn line in grid cells
    inkFade: 0.998, // per-step fade at 60 Hz; higher = the drawing lingers
    inkSpread: 0.07, // how fast the ink bleeds outward
    inkFlow: 3.0, // how strongly ripples carry the ink
  },

  motion: {
    speed: 0.22, // 1.0 is lively; 0.2 is barely moving
    drift: 0.04, // horizontal travel of the weather
    parallax: 0.55, // how much the light follows the pointer (0 = off)
    reducedMotionScale: 0.16,
  },

  grade: {
    contrast: 1.05,
    saturation: 0.96,
    exposure: 1.08,
  },

  quality: {
    maxPixelRatio: 1.25,
    maxPixels: 3000000,
  },
};

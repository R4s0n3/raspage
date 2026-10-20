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
    "Still, dark water holding the evening sky. A few soft living lights drift through it on a slow heartbeat; they come close out of curiosity, and vanish the moment they are touched.",

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
    plankton: 0.8, // tiny living sparks that wake when the water is touched
    // One ink colour per person in a room, in the order they arrive. Keep
    // them close in brightness so no one shouts; the first is the light's own.
    inkColors: [
      "#ffcf8a", // the gold of the light
      "#a8e6d4", // seafoam
      "#f3ab9f", // dusk rose
      "#c4bdf3", // lavender mist
      "#a9d6f2", // moonlit blue
    ],
  },

  life: {
    creatures: 5, // soft drifters in the water (0 = none)
    size: 1.7, // body scale
    pulse: 0.32, // heartbeats per second; slow = calm, quick = restless
    speed: 24, // px/s at the strongest push of a pulse
    tendrils: 4, // trailing threads per drifter
    tendrilLength: 150, // px of memory each one trails
    sway: 1.0, // how much the tendrils undulate
    wander: 0.55, // how freely they turn
    gather: 0.25, // pull towards the light: lonely 0, together 1
    curiosity: 0.55, // how readily they come to a touch
    glow: 1.0, // their own light
    excite: 1.0, // how brightly disturbed water lights them up
    shy: 1.0, // touched or brushed past, they bolt and vanish (0 = fearless)
    hideFor: 12, // seconds before a vanished drifter returns
  },

  motes: {
    streamers: 0, // the light streams rest today; the water is alive instead
    strays: 0,
    dust: 90,
    bokeh: 14,
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

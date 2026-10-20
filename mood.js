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
    "The same dark water under a low, close sky that never breaks. The air hangs thick and stale over it, the light is a dim ember, and only a few tired lights drift below; they keep their distance today, but they are still there.",

  palette: {
    night: "#06080a", // the darkest water, the edges of the room
    deep: "#1a2224", // stale water under a low lid of sky
    haze: "#5f6550", // close, sour olive-grey air that won't move
    light: "#cfc8b2", // dulled edges, glints, damp paper
    glow: "#d9944f", // the light on the water, down to an ember
  },

  composition: {
    cloudCover: 0.8, // 0 = clear, 1 = heavy weather
    cloudScale: 1.35, // size of the moving cloud forms
    turbulence: 1.15, // how much the clouds curl and tear
    lightX: 0.64,
    lightY: 0.34,
    lightRadius: 0.32,
    lightIntensity: 0.6,
    rays: 0.06,
  },

  atmosphere: {
    grain: 0.026,
    vignette: 0.52,
    motes: 0.2, // suspended specks in the thick air
    stars: 0.0,
    rain: 0.0,
  },

  water: {
    surface: 1.0, // 0 = open air, 1 = the sky is seen in dark water
    glints: 0.45, // the light's broken path on the surface
    inkGlow: 0.65, // how brightly drawn ink shows in the water
    plankton: 0.45, // tiny living sparks that wake when the water is touched
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
    creatures: 3, // soft drifters in the water (0 = none)
    size: 1.5, // body scale
    pulse: 0.18, // heartbeats per second; slow = calm, quick = restless
    speed: 14, // px/s at the strongest push of a pulse
    tendrils: 4, // trailing threads per drifter
    tendrilLength: 110, // px of memory each one trails
    sway: 0.6, // how much the tendrils undulate
    wander: 0.45, // how freely they turn
    gather: 0.45, // pull towards the light: lonely 0, together 1
    curiosity: 0.35, // how readily they come to a touch
    glow: 0.7, // their own light
    excite: 1.2, // how brightly disturbed water lights them up
    shy: 1.3, // touched or brushed past, they bolt and vanish (0 = fearless)
    hideFor: 20, // seconds before a vanished drifter returns
  },

  motes: {
    streamers: 0, // the light streams rest today; the water is alive instead
    strays: 0,
    dust: 140, // the air is full of it
    bokeh: 8,
    trailLength: 240,
    speed: 40,
    orbit: 9,
    driftX: 2,
    driftY: 0.5,
    fieldScale: 0.85,
    opacity: 0.7,
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
    glow: 0.24, // light caught on the crests
    reducedMotionScale: 0.35,
    ink: 0.7, // light drawn into the water along a stroke (0 = none)
    inkRadius: 1.7, // width of the drawn line in grid cells
    inkFade: 0.998, // per-step fade at 60 Hz; higher = the drawing lingers
    inkSpread: 0.07, // how fast the ink bleeds outward
    inkFlow: 3.0, // how strongly ripples carry the ink
  },

  motion: {
    speed: 0.16, // 1.0 is lively; 0.2 is barely moving
    drift: 0.015, // horizontal travel of the weather: the air barely moves
    parallax: 0.55, // how much the light follows the pointer (0 = off)
    reducedMotionScale: 0.16,
  },

  grade: {
    contrast: 0.97,
    saturation: 0.8,
    exposure: 0.92,
  },

  quality: {
    maxPixelRatio: 1.25,
    maxPixels: 3000000,
  },
};

/*
 * The shape of a mood, for anything that writes one that is not a person.
 *
 * Each number has the comfortable range from AGENT.md's field guide. The
 * schema is what the translator asks Claude to fill in; clampMood() is what
 * keeps the result inside the engine's comfortable ranges, whatever came
 * back. Fields a mood should not change from day to day (resolution, grid
 * size, reduced-motion scales) are not in the schema at all: they always come
 * from the base mood.
 *
 * Claude's strict JSON mode compiles the schema into a grammar with a size
 * limit (about 55 fields), so the schema asks only for the fields in
 * TRANSLATED: the ones that carry a day's feeling. clampMood() still checks
 * every field in FIELDS, and the rest come from the base mood.
 */
"use strict";

const HEX = "hex";
const HEX5 = "hex5";

// [min, max] for numbers, [min, max, "int"] for counts.
const FIELDS = {
  palette: { night: HEX, deep: HEX, haze: HEX, light: HEX, glow: HEX },
  composition: {
    cloudCover: [0.05, 0.95],
    cloudScale: [0.8, 2.4],
    turbulence: [0.5, 1.8],
    lightX: [0, 1],
    lightY: [0, 1],
    lightRadius: [0.25, 0.7],
    lightIntensity: [0.4, 1.15],
    rays: [0, 1],
  },
  atmosphere: {
    grain: [0.01, 0.06],
    vignette: [0, 0.8],
    motes: [0, 1],
    stars: [0, 1],
    rain: [0, 1],
  },
  water: {
    surface: [0, 1],
    glints: [0, 1],
    inkGlow: [0, 1.2],
    plankton: [0, 1],
    inkColors: HEX5,
  },
  life: {
    creatures: [0, 8, "int"],
    size: [0.6, 2],
    pulse: [0.15, 0.9],
    speed: [10, 50],
    tendrils: [0, 7, "int"],
    tendrilLength: [40, 220],
    sway: [0, 2],
    wander: [0, 1.5],
    gather: [0, 1],
    curiosity: [0, 1],
    glow: [0.4, 1.5],
    excite: [0, 2],
    shy: [0, 1.5],
    hideFor: [4, 40],
  },
  sound: {
    volume: [0, 0.8],
    water: [0, 1],
    lap: [0, 1],
    wind: [0, 1],
    windTone: [200, 1200],
    drips: [0, 12],
    drop: [0, 1],
    pitch: [0.6, 1.5],
    stir: [0, 1],
    space: [0, 0.8],
    foam: [0, 1],
    detail: [0, 1],
    splash: [0, 1],
    width: [0, 1],
    warmth: [0, 1],
  },
  motes: {
    streamers: [0, 300, "int"],
    strays: [0, 40, "int"],
    dust: [0, 300, "int"],
    bokeh: [0, 30, "int"],
    trailLength: [40, 260],
    speed: [15, 100],
    orbit: [0, 28],
    driftX: [-25, 25],
    driftY: [-25, 25],
    fieldScale: [0.5, 2],
    opacity: [0.3, 1.2],
    flatten: [0, 1],
  },
  interaction: {
    radius: [2, 5],
    drop: [0.02, 0.15],
    tap: [0.3, 1.2],
    spacing: [1.5, 4],
    speed: [0.15, 0.4],
    damping: [0.993, 0.999],
    streamPush: [200, 1600],
    warp: [0.5, 2.5],
    glow: [0.1, 0.5],
    ink: [0, 1],
    inkRadius: [1, 3],
    inkFade: [0.994, 0.999],
    inkSpread: [0, 0.15],
    inkFlow: [0, 5],
  },
  motion: {
    speed: [0.05, 0.5],
    drift: [0, 0.2],
    parallax: [0, 1],
  },
  grade: {
    contrast: [0.9, 1.15],
    saturation: [0.7, 1.1],
    exposure: [0.8, 1.25],
  },
};

// The fields a translation sets (44 numbers and colours, plus the title and
// description). Keep it under the grammar limit: about 55 fields in all.
const TRANSLATED = {
  palette: ["night", "deep", "haze", "light", "glow"],
  composition: [
    "cloudCover",
    "cloudScale",
    "turbulence",
    "lightX",
    "lightY",
    "lightRadius",
    "lightIntensity",
    "rays",
  ],
  atmosphere: ["stars", "rain"],
  water: ["surface", "glints", "plankton"],
  life: [
    "creatures",
    "pulse",
    "speed",
    "tendrilLength",
    "gather",
    "curiosity",
    "glow",
    "shy",
  ],
  sound: ["water", "lap", "wind", "windTone", "drips", "pitch"],
  motes: ["streamers", "dust", "bokeh", "trailLength", "speed", "orbit", "opacity"],
  motion: ["speed", "drift"],
  grade: ["contrast", "saturation", "exposure"],
};

const TEXT = { title: 60, description: 400 };

const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const fieldSchema = (spec) => {
  if (spec === HEX) {
    return { type: "string", description: "#rrggbb" };
  }
  if (spec === HEX5) {
    return {
      type: "array",
      items: { type: "string", description: "#rrggbb" },
      description: "exactly five #rrggbb ink colours, one per person",
    };
  }
  const [min, max, kind] = spec;
  return {
    type: kind === "int" ? "integer" : "number",
    description: `${min} to ${max}`,
  };
};

// The JSON schema for structured outputs. Ranges live in the descriptions,
// because numeric constraints are not part of the supported schema subset.
const moodJsonSchema = () => {
  const groups = {};
  for (const [group, names] of Object.entries(TRANSLATED)) {
    const properties = {};
    for (const name of names) {
      properties[name] = fieldSchema(FIELDS[group][name]);
    }
    groups[group] = object(properties);
  }
  return object({
    title: {
      type: "string",
      description: "two to four words naming the weather, never the events",
    },
    description: {
      type: "string",
      description:
        "one or two sentences describing the atmosphere for a screen reader; no events, names or places",
    },
    ...groups,
  });
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isHex = (value) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());

const clean = (value, spec, fallback) => {
  if (spec === HEX) {
    return isHex(value) ? value.trim().toLowerCase() : fallback;
  }
  if (spec === HEX5) {
    const colours = Array.isArray(value) ? value.filter(isHex) : [];
    const base = Array.isArray(fallback) ? fallback : [];
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      const colour = colours[i] ?? base[i];
      if (colour) {
        out.push(colour.trim().toLowerCase());
      }
    }
    return out;
  }
  const [min, max, kind] = spec;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const number = clamp(value, min, max);
  return kind === "int" ? Math.round(number) : number;
};

const text = (value, limit, fallback) => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, limit);
  return trimmed || fallback;
};

// Merge a raw mood onto the base and keep every field inside its range.
// Anything not in FIELDS (quality, grid size, ...) comes from the base.
const clampMood = (raw, base, date) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const mood = JSON.parse(JSON.stringify(base));
  mood.title = text(source.title, TEXT.title, base.title);
  mood.description = text(source.description, TEXT.description, base.description);
  if (date) {
    mood.date = date;
  }
  for (const [group, fields] of Object.entries(FIELDS)) {
    const from = source[group] && typeof source[group] === "object" ? source[group] : {};
    mood[group] = mood[group] || {};
    for (const [name, spec] of Object.entries(fields)) {
      mood[group][name] = clean(from[name], spec, mood[group][name]);
    }
  }
  return mood;
};

module.exports = { FIELDS, TRANSLATED, moodJsonSchema, clampMood };

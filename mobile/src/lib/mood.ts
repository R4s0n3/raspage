/*
 * A mood: the same object as mood.js at the repository root. The app only
 * reads its palette and title; the engine reads the rest.
 */
export type Palette = {
  night: string;
  deep: string;
  haze: string;
  light: string;
  glow: string;
};

export type Mood = {
  title: string;
  description?: string;
  date?: string;
  palette: Palette;
  [field: string]: unknown;
};

// The app's own colours before any weather exists: the site's evening water.
export const FALLBACK_PALETTE: Palette = {
  night: "#06080a",
  deep: "#1a2224",
  haze: "#5f6550",
  light: "#cfc8b2",
  glow: "#d9944f",
};

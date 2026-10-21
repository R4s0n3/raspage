/*
 * A day's weather in a few pixels: its sky, its haze, and the light where
 * the mood put it.
 */
import { StyleSheet, View } from "react-native";

import type { Mood } from "@/lib/mood";

export function Swatch({ mood, size }: { mood: Mood; size: number }) {
  const { palette } = mood;
  const composition = (mood.composition ?? {}) as { lightX?: number; lightY?: number };
  const light = size * 0.34;
  const x = (composition.lightX ?? 0.6) * size - light / 2;
  const y = (composition.lightY ?? 0.4) * size - light / 2;

  return (
    <View
      style={[
        styles.sky,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.deep, borderColor: palette.night },
      ]}
    >
      <View style={[styles.haze, { backgroundColor: palette.haze, borderRadius: size }]} />
      <View
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: light,
          height: light,
          borderRadius: light / 2,
          backgroundColor: palette.glow,
          shadowColor: palette.glow,
          shadowOpacity: 0.9,
          shadowRadius: light,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sky: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  haze: {
    position: "absolute",
    left: "-20%",
    right: "-20%",
    top: "55%",
    bottom: "-40%",
    opacity: 0.55,
  },
});

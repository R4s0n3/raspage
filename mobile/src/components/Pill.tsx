/*
 * The app's only control: a soft, translucent pill that sits on the weather
 * and takes its colours from it.
 */
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { FALLBACK_PALETTE, type Palette } from "@/lib/mood";

type Props = {
  label: string;
  onPress: () => void;
  palette?: Palette;
  strong?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Pill({ label, onPress, palette = FALLBACK_PALETTE, strong, disabled, style }: Props) {
  const press = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: strong ? palette.light + "e6" : palette.night + "8c",
          borderColor: palette.light + "33",
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: strong ? palette.night : palette.light }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  label: {
    fontSize: 15,
    letterSpacing: 0.4,
  },
});

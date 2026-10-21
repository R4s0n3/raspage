/*
 * Today: your weather, full screen. Nothing else on it but a way to write
 * and a way back through the days.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MoodView } from "@/components/MoodView";
import { Pill } from "@/components/Pill";
import { dayKey } from "@/lib/dates";
import { diary, type Day } from "@/lib/diary";
import { FALLBACK_PALETTE } from "@/lib/mood";

export default function Today() {
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState<Day | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [focused, setFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      diary.getDay(dayKey()).then((day) => {
        setToday(day);
        setLoaded(true);
      });
      return () => setFocused(false);
    }, []),
  );

  const palette = today?.mood.palette ?? FALLBACK_PALETTE;

  return (
    <View style={styles.screen}>
      {loaded && <MoodView mood={today?.mood ?? null} paused={!focused} />}

      {loaded && !today && (
        <View style={[styles.invite, { top: insets.top + 72 }]} pointerEvents="none">
          <Text style={[styles.inviteText, { color: palette.light }]}>How was today?</Text>
        </View>
      )}

      <View style={[styles.bar, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <Pill label="Days" palette={palette} onPress={() => router.push("/days")} />
        <Pill label={today ? "Write more" : "Write"} palette={palette} strong onPress={() => router.push("/write")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  invite: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  inviteText: {
    fontSize: 22,
    fontWeight: "300",
    letterSpacing: 0.6,
    opacity: 0.85,
  },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
});

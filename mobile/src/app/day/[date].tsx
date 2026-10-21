/*
 * One day again: its weather, alive, and — only if you ask — your own words.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MoodView } from "@/components/MoodView";
import { Pill } from "@/components/Pill";
import { formatDay } from "@/lib/dates";
import { diary, type Day } from "@/lib/diary";
import { FALLBACK_PALETTE } from "@/lib/mood";

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState<Day | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    diary.getDay(date).then(setDay);
  }, [date]);

  const palette = day?.mood.palette ?? FALLBACK_PALETTE;

  return (
    <View style={[styles.screen, { backgroundColor: palette.night }]}>
      {day && <MoodView mood={day.mood} />}

      <View style={[styles.top, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <Pill label="Days" palette={palette} onPress={() => router.back()} />
        <Text style={[styles.date, { color: palette.light }]}>{formatDay(date)}</Text>
      </View>

      {reading && day && (
        <View style={[styles.veil, { backgroundColor: palette.night + "e0" }]}>
          <ScrollView contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 140, paddingHorizontal: 24 }}>
            <Text style={[styles.title, { color: palette.glow }]}>{day.mood.title}</Text>
            <Text style={[styles.entry, { color: palette.light }]}>{day.entry}</Text>
          </ScrollView>
        </View>
      )}

      {day && (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
          <Pill
            label={reading ? "Back to the weather" : "Read your words"}
            palette={palette}
            onPress={() => setReading((value) => !value)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 2,
  },
  date: {
    fontSize: 15,
    opacity: 0.85,
  },
  veil: {
    ...StyleSheet.absoluteFill,
  },
  title: {
    fontSize: 15,
    letterSpacing: 0.6,
    marginBottom: 16,
    opacity: 0.9,
  },
  entry: {
    fontSize: 18,
    lineHeight: 28,
  },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
});

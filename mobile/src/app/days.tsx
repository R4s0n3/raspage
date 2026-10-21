/*
 * The days: a month at a time, each day with an entry shown as its weather.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pill } from "@/components/Pill";
import { Swatch } from "@/components/Swatch";
import { dayKey, formatMonth } from "@/lib/dates";
import { diary, type Day } from "@/lib/diary";
import { FALLBACK_PALETTE } from "@/lib/mood";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function Days() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [days, setDays] = useState<Map<string, Day>>(new Map());
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });

  useFocusEffect(
    useCallback(() => {
      diary.listDays().then((list) => setDays(new Map(list.map((day) => [day.date, day]))));
    }, []),
  );

  // The latest weather colours the page.
  const palette = days.values().next().value?.mood.palette ?? FALLBACK_PALETTE;
  const today = dayKey();
  const cell = Math.floor((Math.min(width, 520) - 32) / 7);

  const cells = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const lead = (first.getDay() + 6) % 7; // weeks start on Monday
    const count = new Date(month.year, month.month + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => dayKey(new Date(month.year, month.month, i + 1))),
    ];
  }, [month]);

  const step = (delta: number) =>
    setMonth(({ year, month: m }) => {
      const next = new Date(year, m + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const isCurrentMonth = month.year === now.getFullYear() && month.month === now.getMonth();

  return (
    <View style={[styles.screen, { backgroundColor: palette.night, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pill label="Today" palette={palette} onPress={() => router.back()} />
      </View>

      <View style={styles.month}>
        <Pill label="‹" palette={palette} onPress={() => step(-1)} />
        <Text style={[styles.monthName, { color: palette.light }]}>{formatMonth(month.year, month.month)}</Text>
        <Pill label="›" palette={palette} onPress={() => step(1)} disabled={isCurrentMonth} />
      </View>

      <View style={[styles.grid, { width: cell * 7 }]}>
        {WEEKDAYS.map((name, i) => (
          <Text key={"w" + i} style={[styles.weekday, { width: cell, color: palette.light }]}>
            {name}
          </Text>
        ))}
        {cells.map((key, i) => {
          if (!key) {
            return <View key={"e" + i} style={{ width: cell, height: cell }} />;
          }
          const day = days.get(key);
          const number = Number(key.slice(8));
          return (
            <Pressable
              key={key}
              disabled={!day}
              accessibilityRole="button"
              accessibilityLabel={day ? `${key}: ${day.mood.title}` : key}
              onPress={() => router.push({ pathname: "/day/[date]", params: { date: key } })}
              style={({ pressed }) => [styles.cell, { width: cell, height: cell, opacity: pressed ? 0.6 : 1 }]}
            >
              {day ? (
                <Swatch mood={day.mood} size={cell - 10} />
              ) : (
                <Text
                  style={[
                    styles.number,
                    { color: palette.light, opacity: key === today ? 0.9 : key > today ? 0.15 : 0.35 },
                  ]}
                >
                  {number}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
  },
  month: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 24,
  },
  monthName: {
    fontSize: 19,
    minWidth: 170,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  weekday: {
    textAlign: "center",
    fontSize: 12,
    opacity: 0.45,
    marginBottom: 8,
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    fontSize: 14,
  },
});

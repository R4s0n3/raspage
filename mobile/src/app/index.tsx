/*
 * Today: your weather, full screen. Nothing else on it but a way to write,
 * a way back through the days, and a way to your friends' weather.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MoodView } from "@/components/MoodView";
import type { Visit } from "@/components/mood-html";
import { Pill } from "@/components/Pill";
import { dayKey } from "@/lib/dates";
import { getAccount } from "@/lib/account";
import { diary, type Day } from "@/lib/diary";
import { FALLBACK_PALETTE } from "@/lib/mood";
import { RELAY } from "@/lib/server";

export default function Today() {
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState<Day | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Your own water on the relay: friends who visit draw here with you.
  const [home, setHome] = useState<Visit | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);

  // The account can appear (first entry, Friends) or go (deleted) while
  // away from this screen; the water follows when you come back.
  const checkAccount = useCallback(async () => {
    const account = await getAccount();
    setHome((current) =>
      account?.id === current?.visit && account?.token === current?.token
        ? current
        : account
          ? { url: RELAY, visit: account.id, token: account.token }
          : null,
    );
    setAccountChecked(true);
  }, []);
  const [focused, setFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      checkAccount();
      diary.getDay(dayKey()).then((day) => {
        setToday(day);
        setLoaded(true);
      });
      return () => setFocused(false);
    }, [checkAccount]),
  );

  const palette = today?.mood.palette ?? FALLBACK_PALETTE;

  return (
    <View style={styles.screen}>
      {/* A different room is a different page: rebuild when it changes. */}
      {loaded && accountChecked && (
        <MoodView key={home?.visit ?? "alone"} mood={today?.mood ?? null} paused={!focused} room={home} />
      )}

      {loaded && !today && (
        <View style={[styles.invite, { top: insets.top + 72 }]} pointerEvents="none">
          <Text style={[styles.inviteText, { color: palette.light }]}>How was today?</Text>
        </View>
      )}

      <View style={[styles.bar, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <Pill label="Days" palette={palette} onPress={() => router.push("/days")} />
        <Pill label={today ? "Write more" : "Write"} palette={palette} strong onPress={() => router.push("/write")} />
        <Pill label="Friends" palette={palette} onPress={() => router.push("/friends")} />
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

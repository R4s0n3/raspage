/*
 * A friend's water: their latest weather, alive. If they are here too, you
 * draw into the same water, each in your own colour.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MoodView } from "@/components/MoodView";
import type { Visit } from "@/components/mood-html";
import { Pill } from "@/components/Pill";
import { getAccount } from "@/lib/account";
import { describeDay } from "@/lib/dates";
import { listFriends, type Friend } from "@/lib/friends";
import { FALLBACK_PALETTE } from "@/lib/mood";
import { RELAY } from "@/lib/server";

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [friend, setFriend] = useState<Friend | null>(null);
  const [room, setRoom] = useState<Visit | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    Promise.all([listFriends(), getAccount()])
      .then(([friends, account]) => {
        const found = friends.find((candidate) => candidate.id === id) ?? null;
        setFriend(found);
        setMissing(!found);
        if (found && account) {
          setRoom({ url: RELAY, visit: found.id, token: account.token });
        }
      })
      .catch(() => setMissing(true));
  }, [id]);

  const palette = friend?.mood?.palette ?? FALLBACK_PALETTE;

  return (
    <View style={[styles.screen, { backgroundColor: palette.night }]}>
      {/* Made once the visit is known: the room is fixed when the page is built. */}
      {friend && room && <MoodView mood={friend.mood} room={room} />}

      <View style={[styles.top, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <Pill label="Friends" palette={palette} onPress={() => router.back()} />
        {friend && (
          <Text style={[styles.title, { color: palette.light }]} numberOfLines={1}>
            {friend.name || "A friend"}
            {friend.moodDate ? ` · ${describeDay(friend.moodDate)}` : ""}
          </Text>
        )}
      </View>

      {missing && (
        <View style={styles.center}>
          <Text style={[styles.message, { color: palette.light }]}>This friend's weather isn't here any more.</Text>
        </View>
      )}
      {friend && !friend.mood && (
        <View style={styles.center} pointerEvents="none">
          <Text style={[styles.message, { color: palette.light }]}>No weather from {friend.name || "them"} yet.</Text>
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
  title: {
    flex: 1,
    fontSize: 15,
    opacity: 0.85,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  message: {
    fontSize: 17,
    textAlign: "center",
    opacity: 0.8,
  },
});

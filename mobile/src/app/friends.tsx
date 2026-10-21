/*
 * Friends: the sky of everyone you share weather with. Only their weather
 * is here, never their words, and only yours goes to them.
 */
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NameForm } from "@/components/NameForm";
import { Pill } from "@/components/Pill";
import { Swatch } from "@/components/Swatch";
import { deleteAccount, ensureAccount, getAccount, setName } from "@/lib/account";
import { describeDay } from "@/lib/dates";
import { diary } from "@/lib/diary";
import {
  acceptInvite,
  createInvite,
  formatCode,
  listFriends,
  removeFriend,
  shareLatest,
  type Friend,
} from "@/lib/friends";
import { FALLBACK_PALETTE, type Palette } from "@/lib/mood";
import { ServerError } from "@/lib/server";

type State =
  | { kind: "loading" }
  | { kind: "naming" }
  | { kind: "ready"; friends: Friend[] }
  | { kind: "unavailable"; message: string };

const describeError = (error: unknown) => {
  if (error instanceof ServerError) {
    if (error.status === 0) {
      return "Couldn't reach the server. Check your connection.";
    }
    if (error.status === 503) {
      return "Friends aren't set up on this server yet.";
    }
    return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
  }
  return "Something went wrong.";
};

// Alert has no buttons on the web build; the browser's own confirm does.
const confirm = (title: string, message: string, action: string, onConfirm: () => void) => {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
};

export default function Friends() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [palette, setPalette] = useState<Palette>(FALLBACK_PALETTE);
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const account = await getAccount();
      if (!account?.name) {
        setState({ kind: "naming" });
        return;
      }
      const friends = await listFriends();
      setState({ kind: "ready", friends });
      shareLatest();
    } catch (error) {
      setState({ kind: "unavailable", message: describeError(error) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      diary.listDays().then(([latest]) => latest && setPalette(latest.mood.palette));
      load();
    }, [load]),
  );

  const chooseName = async (name: string) => {
    try {
      const account = await ensureAccount();
      if (!account) {
        throw new ServerError(503, "unavailable");
      }
      await setName(name);
      await load();
    } catch (error) {
      setState({ kind: "unavailable", message: describeError(error) });
    }
  };

  const invite = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { code: made } = await createInvite();
      const link = Linking.createURL(`invite/${made}`);
      const message = `Share weather with me on moodpage: ${link}\n\nOr enter the code ${formatCode(made)} under Friends.`;
      if (Platform.OS === "web") {
        setNotice(`Your invite code: ${formatCode(made)} (valid for 7 days, for one friend)`);
      } else {
        await Share.share({ message });
      }
    } catch (error) {
      setNotice(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim() || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { friend } = await acceptInvite(code.trim());
      setCode("");
      setEntering(false);
      setNotice(`You and ${friend.name || "your friend"} now share weather.`);
      await load();
    } catch (error) {
      setNotice(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = (friend: Friend) =>
    confirm(
      `Stop sharing with ${friend.name || "this friend"}?`,
      "You will no longer see each other's weather. You can share again with a new invite.",
      "Stop sharing",
      async () => {
        await removeFriend(friend.id).catch(() => {});
        load();
      },
    );

  const leave = () =>
    confirm(
      "Delete your account?",
      "Your friends, invites and shared weather are removed from the server. Your diary stays on this phone.",
      "Delete",
      async () => {
        try {
          await deleteAccount();
          setState({ kind: "naming" });
        } catch (error) {
          setNotice(describeError(error));
        }
      },
    );

  const columns = width > 600 ? 3 : 2;
  const card = (Math.min(width, 640) - 32 - (columns - 1) * 12) / columns;

  return (
    <View style={[styles.screen, { backgroundColor: palette.night }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          alignItems: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pill label="Today" palette={palette} onPress={() => router.back()} />
        </View>

        {state.kind === "loading" && <ActivityIndicator color={palette.glow} style={styles.spinner} />}

        {state.kind === "unavailable" && (
          <View style={styles.block}>
            <Text style={[styles.message, { color: palette.light }]}>{state.message}</Text>
            <Pill label="Try again" palette={palette} onPress={load} />
          </View>
        )}

        {state.kind === "naming" && (
          <View style={styles.block}>
            <Text style={[styles.note, { color: palette.light }]}>
              Friends see your latest weather, never your words. You find each other with invite codes; nobody can search
              for you.
            </Text>
            <NameForm palette={palette} label="Continue" onSubmit={chooseName} />
          </View>
        )}

        {state.kind === "ready" && (
          <>
            {state.friends.length === 0 ? (
              <Text style={[styles.message, { color: palette.light }]}>
                No friends here yet. Invite someone to share weather with.
              </Text>
            ) : (
              <View style={[styles.grid, { width: Math.min(width, 640) - 32 }]}>
                {state.friends.map((friend) => (
                  <Pressable
                    key={friend.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${friend.name || "A friend"}${friend.mood ? ": " + friend.mood.title : ""}`}
                    onPress={() => router.push({ pathname: "/friend/[id]", params: { id: friend.id } })}
                    onLongPress={() => remove(friend)}
                    style={({ pressed }) => [styles.card, { width: card, opacity: pressed ? 0.7 : 1 }]}
                  >
                    {friend.mood ? (
                      <Swatch mood={friend.mood} size={card * 0.62} />
                    ) : (
                      <View
                        style={[
                          styles.empty,
                          { width: card * 0.62, height: card * 0.62, borderColor: palette.light + "33" },
                        ]}
                      />
                    )}
                    <Text style={[styles.name, { color: palette.light }]} numberOfLines={1}>
                      {friend.name || "A friend"}
                    </Text>
                    <Text style={[styles.when, { color: palette.light }]}>
                      {friend.moodDate ? describeDay(friend.moodDate) : "no weather yet"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.block}>
              {notice && <Text style={[styles.notice, { color: palette.glow }]}>{notice}</Text>}
              <Pill label="Invite a friend" palette={palette} strong onPress={invite} disabled={busy} />
              {entering ? (
                <View style={styles.codeRow}>
                  <TextInput
                    style={[styles.code, { color: palette.light, borderColor: palette.light + "40" }]}
                    value={code}
                    onChangeText={setCode}
                    placeholder="XXXX-XXXX"
                    placeholderTextColor={palette.light + "55"}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoFocus
                    maxLength={12}
                    returnKeyType="go"
                    onSubmitEditing={join}
                  />
                  <Pill label="Join" palette={palette} onPress={join} disabled={!code.trim() || busy} />
                </View>
              ) : (
                <Pill label="I have a code" palette={palette} onPress={() => setEntering(true)} />
              )}
            </View>

            <Text style={[styles.note, { color: palette.light }]}>
              Your latest weather is shared with your friends, never your words. Hold a friend to stop sharing.
            </Text>
            <Pressable accessibilityRole="button" onPress={leave} style={styles.leave}>
              <Text style={[styles.leaveText, { color: palette.light }]}>Delete my account</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
    marginBottom: 24,
  },
  spinner: {
    marginTop: 80,
  },
  block: {
    alignSelf: "center",
    maxWidth: 420,
    width: "100%",
    gap: 14,
    marginVertical: 24,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
    opacity: 0.85,
    marginVertical: 24,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    opacity: 0.6,
    maxWidth: 420,
  },
  notice: {
    fontSize: 14,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  card: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 6,
  },
  empty: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
  name: {
    fontSize: 16,
    marginTop: 4,
  },
  when: {
    fontSize: 12,
    opacity: 0.55,
  },
  codeRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  code: {
    flex: 1,
    fontSize: 18,
    letterSpacing: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    outlineWidth: 0,
  },
  leave: {
    marginTop: 20,
    padding: 8,
  },
  leaveText: {
    fontSize: 13,
    opacity: 0.45,
    textDecorationLine: "underline",
  },
});

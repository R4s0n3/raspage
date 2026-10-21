/*
 * An invite link, opened: who it is from, and a way to accept. Accepting
 * makes you friends; the invite is then used up.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NameForm } from "@/components/NameForm";
import { Pill } from "@/components/Pill";
import { ensureAccount, getAccount, setName } from "@/lib/account";
import { acceptInvite, lookupInvite } from "@/lib/friends";
import { FALLBACK_PALETTE } from "@/lib/mood";
import { ServerError } from "@/lib/server";

const palette = FALLBACK_PALETTE;

export default function Invite() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState<string | null | undefined>(undefined);
  const [named, setNamed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    lookupInvite(code)
      .then(({ from: sender }) => setFrom(sender.name))
      .catch((caught) =>
        setError(
          caught instanceof ServerError && caught.status === 404
            ? "This invite has expired or was already used. Ask for a new one."
            : "Couldn't reach the server. Check your connection.",
        ),
      );
    getAccount().then((account) => setNamed(Boolean(account?.name)));
  }, [code]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptInvite(code);
      router.replace("/friends");
    } catch (caught) {
      setError(caught instanceof ServerError ? caught.message.charAt(0).toUpperCase() + caught.message.slice(1) + "." : "Something went wrong.");
      setBusy(false);
    }
  };

  const nameAndAccept = async (name: string) => {
    await ensureAccount();
    await setName(name);
    await accept();
  };

  const who = from || "Someone";

  return (
    <View style={[styles.screen, { backgroundColor: palette.night, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pill label="Close" palette={palette} onPress={() => router.replace("/")} />
      </View>
      <View style={styles.body}>
        {error ? (
          <Text style={[styles.message, { color: palette.light }]}>{error}</Text>
        ) : from === undefined || named === null ? (
          <ActivityIndicator color={palette.glow} />
        ) : (
          <>
            <Text style={[styles.message, { color: palette.light }]}>
              {who} would like to share weather with you.
            </Text>
            <Text style={[styles.note, { color: palette.light }]}>
              You will see each other's latest weather, never each other's words.
            </Text>
            {named ? (
              <Pill label="Share weather" palette={palette} strong onPress={accept} disabled={busy} />
            ) : (
              <NameForm palette={palette} label="Share weather" onSubmit={nameAndAccept} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: 18,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  message: {
    fontSize: 21,
    lineHeight: 29,
    textAlign: "center",
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    opacity: 0.6,
  },
});

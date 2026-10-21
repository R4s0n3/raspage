/*
 * The recovery code: show yours, or bring an account back with one. With it,
 * a new phone keeps your friends and your name; the diary itself never left
 * the old phone.
 */
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pill } from "@/components/Pill";
import { getAccount, recoveryCode, restoreAccount } from "@/lib/account";
import { FALLBACK_PALETTE } from "@/lib/mood";
import { ServerError } from "@/lib/server";

const palette = FALLBACK_PALETTE;

export default function Recovery() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [entered, setEntered] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restoring = mode === "restore";

  useEffect(() => {
    if (!restoring) {
      getAccount().then((account) => setCode(account ? recoveryCode(account) : null));
    }
  }, [restoring]);

  const copy = async () => {
    if (!code) {
      return;
    }
    await Clipboard.setStringAsync(code.replace(/\s+/g, ""));
    setCopied(true);
  };

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await restoreAccount(entered);
      router.replace("/friends");
    } catch (error) {
      setMessage(
        error instanceof ServerError
          ? error.status === 0
            ? "Couldn't reach the server. Check your connection."
            : error.message.charAt(0).toUpperCase() + error.message.slice(1) + "."
          : "Something went wrong.",
      );
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.night }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pill label="Close" palette={palette} onPress={() => router.back()} />
      </View>

      {restoring ? (
        <View style={styles.block}>
          <Text style={[styles.title, { color: palette.light }]}>Bring back your account</Text>
          <Text style={[styles.note, { color: palette.light }]}>
            Enter the recovery code you saved. Your name and friends come back; your diary stays on the phone it was
            written on.
          </Text>
          <TextInput
            style={[styles.input, { color: palette.light, borderColor: palette.light + "40" }]}
            value={entered}
            onChangeText={setEntered}
            placeholder="Recovery code"
            placeholderTextColor={palette.light + "55"}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          {message && <Text style={[styles.message, { color: palette.glow }]}>{message}</Text>}
          <Pill label="Restore" palette={palette} strong onPress={restore} disabled={!entered.trim() || busy} />
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={[styles.title, { color: palette.light }]}>Your recovery code</Text>
          <Text style={[styles.note, { color: palette.light }]}>
            Keep this somewhere safe, like a password manager. On a new phone it brings back your name and your friends.
            Anyone who has it can be you, so never share it.
          </Text>
          {code ? (
            <>
              <Text selectable style={[styles.code, { color: palette.glow }]}>
                {code}
              </Text>
              <Pill label={copied ? "Copied" : "Copy"} palette={palette} strong onPress={copy} />
              {Platform.OS !== "web" && (
                <Text style={[styles.note, { color: palette.light }]}>
                  Clear your clipboard after you have saved it.
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.message, { color: palette.light }]}>
              You don't have an account yet. It is made when you first share weather or make a friend.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
    marginBottom: 32,
  },
  block: {
    width: "100%",
    maxWidth: 420,
    gap: 16,
  },
  title: {
    fontSize: 21,
    textAlign: "center",
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.65,
    textAlign: "center",
  },
  code: {
    fontSize: 20,
    lineHeight: 30,
    letterSpacing: 1,
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    marginVertical: 8,
  },
  input: {
    minHeight: 96,
    fontSize: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlignVertical: "top",
    outlineWidth: 0,
  },
  message: {
    fontSize: 15,
    textAlign: "center",
  },
});

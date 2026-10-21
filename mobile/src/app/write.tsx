/*
 * Writing the day. The words stay on this phone; they are sent once to be
 * turned into weather, and only the weather is kept with them.
 *
 * Writing again on the same day continues the same entry, and the whole day
 * is translated again: the weather evolves rather than starting over.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pill } from "@/components/Pill";
import { translateEntry, TranslateError } from "@/lib/api";
import { dayKey, formatDay } from "@/lib/dates";
import { diary } from "@/lib/diary";
import { shareMood } from "@/lib/friends";
import { FALLBACK_PALETTE } from "@/lib/mood";

const MAX_ENTRY = 6000;

export default function Write() {
  const insets = useSafeAreaInsets();
  const date = dayKey();
  const [entry, setEntry] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [palette, setPalette] = useState(FALLBACK_PALETTE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    diary.getDay(date).then((day) => {
      if (day) {
        setEntry(day.entry);
        setPalette(day.mood.palette);
      }
      setLoaded(true);
    });
  }, [date]);

  const save = async () => {
    const words = entry.trim();
    if (!words || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const mood = await translateEntry(words, date);
      await diary.saveDay({ date, entry: words, mood, createdAt: Date.now() });
      // Friends see the new weather; if that fails they see it next time.
      shareMood(mood, date).catch(() => {});
      router.back();
    } catch (caught) {
      setError(caught instanceof TranslateError ? caught.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: palette.night, paddingTop: insets.top + 16 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={[styles.date, { color: palette.light }]}>{formatDay(date)}</Text>
        <Pill label="Close" palette={palette} onPress={() => router.back()} disabled={busy} />
      </View>

      <TextInput
        style={[styles.input, { color: palette.light }]}
        value={entry}
        onChangeText={setEntry}
        editable={loaded && !busy}
        placeholder="How did today feel? What happened, what did you notice?"
        placeholderTextColor={palette.light + "66"}
        multiline
        autoFocus
        maxLength={MAX_ENTRY}
        textAlignVertical="top"
        selectionColor={palette.glow}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {error && <Text style={[styles.error, { color: palette.glow }]}>{error}</Text>}
        <Text style={[styles.note, { color: palette.light }]}>
          Your words stay on this phone. They are sent once to make the weather and are not kept anywhere else. Only
          the weather is shared with your friends.
        </Text>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={palette.glow} />
            <Text style={[styles.note, { color: palette.light }]}>Listening for the weather…</Text>
          </View>
        ) : (
          <Pill label="Make the weather" palette={palette} strong onPress={save} disabled={!entry.trim()} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  date: {
    fontSize: 17,
    opacity: 0.8,
  },
  input: {
    flex: 1,
    outlineWidth: 0,
    fontSize: 19,
    lineHeight: 28,
    paddingVertical: 8,
  },
  footer: {
    gap: 12,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.6,
    textAlign: "center",
  },
  error: {
    fontSize: 14,
    textAlign: "center",
  },
  busy: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
});

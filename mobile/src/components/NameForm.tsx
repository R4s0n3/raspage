/*
 * Choosing the name your friends see. It is the only thing about you the
 * server knows besides your weather.
 */
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { Palette } from "@/lib/mood";
import { Pill } from "./Pill";

type Props = {
  palette: Palette;
  label: string;
  onSubmit: (name: string) => Promise<void>;
};

export function NameForm({ palette, label, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={[styles.question, { color: palette.light }]}>What should your friends call you?</Text>
      <TextInput
        style={[styles.input, { color: palette.light, borderColor: palette.light + "40" }]}
        value={name}
        onChangeText={setName}
        placeholder="A name or a nickname"
        placeholderTextColor={palette.light + "66"}
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        selectionColor={palette.glow}
      />
      <Pill label={label} palette={palette} strong onPress={submit} disabled={!name.trim() || busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  question: {
    fontSize: 19,
    textAlign: "center",
  },
  input: {
    fontSize: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    outlineWidth: 0,
  },
});

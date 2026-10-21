/*
 * The web build's moodpage: the same engine page in an iframe, spoken to
 * with postMessage instead of injected JavaScript.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FALLBACK_PALETTE } from "@/lib/mood";
import { moodHtml, type MoodViewProps } from "./mood-html";

export function MoodView({ mood, paused = false }: MoodViewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const firstMood = useRef(mood);
  const html = useMemo(() => moodHtml(firstMood.current), []);

  const send = (message: object) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), "*");
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) {
        return;
      }
      try {
        if (JSON.parse(event.data)?.type === "ready") {
          setReady(true);
        }
      } catch {
        // Not ours.
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (ready && mood) {
      send({ type: "mood", mood });
    }
  }, [ready, mood]);

  useEffect(() => {
    if (ready) {
      send({ type: paused ? "pause" : "resume" });
    }
  }, [ready, paused]);

  const night = mood?.palette.night ?? FALLBACK_PALETTE.night;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night }]}>
      <iframe
        ref={frame}
        srcDoc={html}
        title="moodpage"
        style={{
          border: 0,
          width: "100%",
          height: "100%",
          display: "block",
          opacity: ready ? 1 : 0,
          transition: "opacity 600ms ease",
        }}
      />
    </View>
  );
}

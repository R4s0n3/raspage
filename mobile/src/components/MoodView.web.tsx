/*
 * The web build's moodpage: the same engine page in an iframe, spoken to
 * with postMessage instead of injected JavaScript.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FALLBACK_PALETTE } from "@/lib/mood";
import { logFromPage, moodHtml, type MoodViewProps, type PageMessage } from "./mood-html";

export function MoodView({
  mood,
  paused = false,
  room = null,
  onPeers,
  record = false,
  onGesture,
  replay = null,
}: MoodViewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // The latest callbacks, for the page's messages to reach.
  const handlers = useRef({ onPeers, onGesture });
  handlers.current = { onPeers, onGesture };

  const firstMood = useRef(mood);
  const html = useMemo(() => moodHtml(firstMood.current, room), []);

  const send = (message: object) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), "*");
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) {
        return;
      }
      try {
        const message: PageMessage = JSON.parse(event.data);
        if (message?.type === "ready") {
          setReady(true);
        } else if (message?.type === "peers") {
          handlers.current.onPeers?.(message.count);
        } else if (message?.type === "gesture") {
          handlers.current.onGesture?.(message.gesture);
        }
        logFromPage(message);
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

  useEffect(() => {
    if (ready) {
      send({ type: "record", on: record });
    }
  }, [ready, record]);

  useEffect(() => {
    if (ready && replay) {
      send({ type: "replay", gestures: replay.gestures, slot: replay.slot ?? 1 });
    }
    // A replay plays once, when its id is new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, replay?.id]);

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

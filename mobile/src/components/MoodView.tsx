/*
 * A living moodpage: the engine from the repository root, running in a
 * WebView. The page is built once; later moods are sent in and change the
 * weather in place, so the sky never reloads.
 */
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { FALLBACK_PALETTE } from "@/lib/mood";
import { logFromPage, moodHtml, type MoodViewProps, type PageMessage } from "./mood-html";

export function MoodView({ mood, paused = false }: MoodViewProps) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState(0);

  // Only the first mood is baked into the page; the rest arrive as messages.
  const firstMood = useRef(mood);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => moodHtml(firstMood.current), [key]);

  const send = (message: object) => {
    ref.current?.injectJavaScript(
      `window.moodpageHost && window.moodpageHost.receive(${JSON.stringify(message)}); true;`,
    );
  };

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

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message: PageMessage = JSON.parse(event.nativeEvent.data);
      if (message?.type === "ready") {
        setReady(true);
      }
      logFromPage(message);
    } catch {
      // Not ours.
    }
  };

  // The system may reclaim a WebView in the background; start it again with
  // the weather it should be showing.
  const restart = () => {
    firstMood.current = mood;
    setReady(false);
    setKey((value) => value + 1);
  };

  const night = mood?.palette.night ?? FALLBACK_PALETTE.night;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night }]}>
      <WebView
        key={key}
        ref={ref}
        source={{ html }}
        originWhitelist={["*"]}
        onMessage={onMessage}
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
        style={{ flex: 1, backgroundColor: night, opacity: ready ? 1 : 0 }}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

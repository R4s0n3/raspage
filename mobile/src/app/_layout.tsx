import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { FALLBACK_PALETTE } from "@/lib/mood";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: FALLBACK_PALETTE.night },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="write" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="days" />
        <Stack.Screen name="day/[date]" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="friend/[id]" />
        <Stack.Screen name="invite/[code]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="recovery" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      </Stack>
    </>
  );
}

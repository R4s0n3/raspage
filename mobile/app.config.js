/*
 * app.json, plus what depends on where the server is: links to
 * https://<server>/invite/... open the app (iOS universal links, Android
 * app links) when the server is a real https domain. The server publishes
 * the matching files under /.well-known (server/links.js).
 *
 * EXPO_PUBLIC_MOODPAGE_API comes from mobile/.env when developing, and from
 * eas.json for cloud builds.
 */
const api = process.env.EXPO_PUBLIC_MOODPAGE_API || "";
const domain = /^https:\/\//.test(api) ? new URL(api).host : null;

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    ...(domain ? { associatedDomains: [`applinks:${domain}`] } : {}),
  },
  android: {
    ...config.android,
    ...(domain
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: [{ scheme: "https", host: domain, pathPrefix: "/invite" }],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
  },
});

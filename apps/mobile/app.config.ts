import type { ExpoConfig } from "expo/config";

/**
 * Expo app config. Kept as TS so env-driven values stay typed.
 * `scheme` powers deep links (hadithsearch://hadith/{id}); the web
 * universal-link host is added once a production domain is decided
 * (see plan/02-web-app.md).
 */
const config: ExpoConfig = {
  name: "Hadith Search",
  slug: "hadith-search",
  version: "0.0.1",
  orientation: "portrait",
  scheme: "hadithsearch",
  owner: "slashcommit",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.hadithsearch.app",
  },
  android: {
    package: "com.hadithsearch.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "7f2f7c98-afe5-44a7-827b-176964f17bc6",
    },
  },
};

export default config;

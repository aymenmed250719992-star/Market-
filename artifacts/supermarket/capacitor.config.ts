import type { CapacitorConfig } from "@capacitor/cli";

const remoteUrl = process.env.CAP_SERVER_URL ?? "https://market--robox250719992.replit.app";

const config: CapacitorConfig = {
  appId: "dz.supermarket.manager",
  appName: "السوبرماركت",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    url: remoteUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0a0a0a",
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0a0a0a",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#FF3C00",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;

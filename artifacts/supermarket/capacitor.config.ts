import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.supermarket.algeria",
  appName: "السوبرماركت",
  webDir: "dist/public",
  bundledWebRuntime: false,
  backgroundColor: "#0a0a0a",
  android: {
    allowMixedContent: true,
    backgroundColor: "#0a0a0a",
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0a0a0a",
  },
  server: {
    androidScheme: "https",
    iosScheme: "https",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#FF3C00",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#FF3C00",
    },
  },
};

export default config;

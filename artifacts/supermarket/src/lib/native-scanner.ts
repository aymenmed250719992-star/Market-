import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function scanBarcodeNative(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  const supported = await BarcodeScanner.isSupported();
  if (!supported.supported) throw new Error("الماسح غير مدعوم على هذا الجهاز");

  // Ensure Google Barcode Scanner module is installed (Android)
  try {
    const moduleStatus = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!moduleStatus.available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    }
  } catch { /* iOS doesn't need this */ }

  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== "granted" && perm.camera !== "limited") {
    throw new Error("لم يتم منح إذن الكاميرا");
  }

  const { barcodes } = await BarcodeScanner.scan();
  if (!barcodes.length) return null;
  return barcodes[0].rawValue ?? null;
}

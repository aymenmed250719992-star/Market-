import sharp from "sharp";
import fs from "fs";
import path from "path";

const SRC = path.join(import.meta.dirname, "..", "resources", "icon-only.png");
const ROOT = path.join(import.meta.dirname, "..");

if (!fs.existsSync(SRC)) {
  console.error("Missing", SRC);
  process.exit(1);
}

const androidIcons = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];

const iosIcons = [
  ["AppIcon-20x20@1x.png", 20], ["AppIcon-20x20@2x.png", 40], ["AppIcon-20x20@3x.png", 60],
  ["AppIcon-29x29@1x.png", 29], ["AppIcon-29x29@2x.png", 58], ["AppIcon-29x29@3x.png", 87],
  ["AppIcon-40x40@1x.png", 40], ["AppIcon-40x40@2x.png", 80], ["AppIcon-40x40@3x.png", 120],
  ["AppIcon-60x60@2x.png", 120], ["AppIcon-60x60@3x.png", 180],
  ["AppIcon-76x76@1x.png", 76], ["AppIcon-76x76@2x.png", 152],
  ["AppIcon-83.5x83.5@2x.png", 167],
  ["AppIcon-512@2x.png", 1024],
];

async function genAndroid() {
  for (const [folder, size] of androidIcons) {
    const dir = path.join(ROOT, "android/app/src/main/res", folder);
    if (!fs.existsSync(dir)) continue;
    await sharp(SRC).resize(size, size).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(SRC).resize(size, size).png().toFile(path.join(dir, "ic_launcher_round.png"));
    await sharp(SRC).resize(size, size).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
    console.log("✓ Android", folder, size);
  }
  // splash
  const splashDir = path.join(ROOT, "android/app/src/main/res/drawable");
  if (fs.existsSync(splashDir)) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } })
      .composite([{ input: await sharp(SRC).resize(800, 800).toBuffer(), gravity: "center" }])
      .png()
      .toFile(path.join(splashDir, "splash.png"));
    console.log("✓ Android splash");
  }
}

async function genIos() {
  const iconDir = path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
  if (!fs.existsSync(iconDir)) { console.log("skip ios"); return; }
  for (const [name, size] of iosIcons) {
    await sharp(SRC).resize(size, size).png().toFile(path.join(iconDir, name));
    console.log("✓ iOS", name);
  }
  // splash
  const splashDir = path.join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset");
  if (fs.existsSync(splashDir)) {
    const splashBuf = await sharp({ create: { width: 2732, height: 2732, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } })
      .composite([{ input: await sharp(SRC).resize(800, 800).toBuffer(), gravity: "center" }])
      .png().toBuffer();
    await sharp(splashBuf).resize(1366, 1366).toFile(path.join(splashDir, "splash-2732x2732.png"));
    await sharp(splashBuf).resize(2048, 2048).toFile(path.join(splashDir, "splash-2732x2732-1.png"));
    await sharp(splashBuf).toFile(path.join(splashDir, "splash-2732x2732-2.png"));
    console.log("✓ iOS splash");
  }
}

await genAndroid();
await genIos();
console.log("Done.");

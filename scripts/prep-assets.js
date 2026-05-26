// Prepares assets/icon-only.png and assets/splash.png for @capacitor/assets
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "assets", "logo.png");
const ASSETS = path.join(ROOT, "assets");

async function main() {
  if (!fs.existsSync(LOGO)) {
    throw new Error("logo.png not found at " + LOGO);
  }

  // icon-only.png at 1024x1024 (transparent background, logo fitted)
  await sharp(LOGO)
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(ASSETS, "icon-only.png"));
  console.log("Wrote assets/icon-only.png (1024x1024)");

  // icon-foreground.png (logo on transparent, smaller safe area for adaptive)
  await sharp(LOGO)
    .resize(648, 648, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 188,
      bottom: 188,
      left: 188,
      right: 188,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(ASSETS, "icon-foreground.png"));
  console.log("Wrote assets/icon-foreground.png (1024x1024)");

  // icon-background.png (solid dark color)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 13, g: 17, b: 23, alpha: 1 },
    },
  })
    .png()
    .toFile(path.join(ASSETS, "icon-background.png"));
  console.log("Wrote assets/icon-background.png (1024x1024)");

  // splash.png at 2732x2732 with logo centered on dark background
  const logoBuf = await sharp(LOGO)
    .resize(1200, 1200, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 13, g: 17, b: 23, alpha: 1 },
    },
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(ASSETS, "splash.png"));
  console.log("Wrote assets/splash.png (2732x2732)");

  // splash-dark.png (same as splash for now)
  fs.copyFileSync(
    path.join(ASSETS, "splash.png"),
    path.join(ASSETS, "splash-dark.png")
  );
  console.log("Wrote assets/splash-dark.png (2732x2732)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

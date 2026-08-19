#!/usr/bin/env node
/**
 * Leitet `apps/web/public/icons/hermes-agent.png` aus dem offiziellen
 * Hermes-Markenzeichen ab.
 *
 * Quelle ist `apps/desktop/assets/icon.png` im Hermes-Checkout (MIT © 2025
 * Nous Research) — dasselbe Icon, das die Hermes-Desktop-App verwendet. Das
 * Original ist 1024 × 1024 mit transparentem Rand um ein abgerundetes
 * Markenquadrat. Dieses Skript schneidet auf das Quadrat zu, gleicht auf ein
 * exaktes Quadrat aus (sonst verzerrt das SVG-`<image>`) und skaliert auf
 * 128 px — genug für 64 px auf Retina, die Workbench zeigt es bei 14–24 px.
 *
 * Nur nötig, wenn Nous das Markenzeichen ändert:
 *   node scripts/build-hermes-icon.mjs [<pfad-zum-hermes-checkout>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function hermesCheckout() {
  if (process.argv[2]) return resolve(process.argv[2]);
  const configPath = join(repoRoot, "config/wrapt.local.json");
  if (existsSync(configPath)) {
    const checkout = JSON.parse(readFileSync(configPath, "utf8"))?.hermes?.checkoutDirectory;
    if (checkout) return checkout;
  }
  return join(process.env.HOME ?? "", ".hermes/hermes-agent");
}

const source = join(hermesCheckout(), "apps/desktop/assets/icon.png");
const target = join(repoRoot, "apps/web/public/icons/hermes-agent.png");

if (!existsSync(source)) {
  console.error(`Hermes-Markenzeichen nicht gefunden: ${source}`);
  console.error("Pfad zum Hermes-Checkout als Argument übergeben.");
  process.exit(1);
}

// Pillow statt einer npm-Abhängigkeit: Die Ableitung läuft einmal pro
// Markenwechsel, dafür lohnt kein zusätzliches Bildpaket im Frontend-Baum.
const script = `
from PIL import Image
image = Image.open(${JSON.stringify(source)}).convert("RGBA")
mark = image.crop(image.getbbox())
width, height = mark.size
side = max(width, height)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(mark, ((side - width) // 2, (side - height) // 2))
canvas.resize((128, 128), Image.LANCZOS).save(${JSON.stringify(target)}, optimize=True)
`;

execFileSync("python3", ["-c", script], { stdio: "inherit" });
console.log(`Hermes-Icon geschrieben: ${target}`);

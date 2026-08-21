#!/usr/bin/env node
/**
 * Leitet das komplette App-Icon-Set aus dem Root-`favicon.svg` ab.
 *
 * Quelle ist `/favicon.svg` im Repo-Root — dieselbe Datei, die T3 Code als
 * Projekt-Icon in der Seitenleiste verwendet. Dadurch zeigen Browser-Favicon,
 * PWA-Icons, iOS (apple-touch-icon) und Android (maskable) auf dasselbe
 * Markenzeichen.
 *
 * Die regulären PNGs erhalten einen sichtbaren Motivanteil von 82 % und den
 * vollen Theme-Hintergrund #0a0a0a. Das maskable-Icon bleibt mit 66 % in der
 * Android-Safe-Zone und füllt den restlichen Bereich mit demselben Hintergrund.
 *
 * Aufruf:
 *   node scripts/build-app-icons.mjs
 *
 * Die gebauten Icons liegen im Repo. Liegt das komplette Set bereits vor,
 * überspringt das Skript den Python-Schritt — der Build braucht dann keine
 * cairosvg-/Pillow-Installation (z. B. in der CI). Zum Neubauen erst die
 * Ziele löschen oder `--force` übergeben.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const source = join(repoRoot, "favicon.svg");
const iconDir = join(repoRoot, "apps/web/public/icons");
const webFavicon = join(repoRoot, "apps/web/public/favicon.svg");

if (!existsSync(source)) {
  console.error(`Quell-Icon nicht gefunden: ${source}`);
  process.exit(1);
}

const targets = [
  webFavicon,
  join(iconDir, "favicon-32.png"),
  join(iconDir, "apple-touch-icon.png"),
  join(iconDir, "icon-192.png"),
  join(iconDir, "icon-512.png"),
  join(iconDir, "icon-maskable-512.png"),
];

if (!process.argv.includes("--force") && targets.every(existsSync)) {
  console.log("App-Icon-Set liegt bereits vor; Neubau übersprungen (--force erzwingt).");
  process.exit(0);
}

// cairosvg (SVG -> PNG) und Pillow (Skalierung) statt einer npm-Abhängigkeit.
// Das Rendering läuft auf 1024 px Basis, damit kleine Stufen (32 px) per
// LANCZOS scharf bleiben.
const script = `
import io
import cairosvg
from PIL import Image

SOURCE = ${JSON.stringify(source)}
ICON_DIR = ${JSON.stringify(iconDir)}
WEB_FAVICON = ${JSON.stringify(webFavicon)}
BACKGROUND = (10, 10, 10, 255)
RENDER_BASE = 1024
REGULAR_RATIO = 0.82
MASKABLE_RATIO = 0.66

svg = open(SOURCE, "rb").read()

def render(base):
    png = cairosvg.svg2png(bytestring=svg, output_width=base, output_height=base)
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    return image

content = render(RENDER_BASE)

def crop_to_content(image):
    box = image.getchannel("A").getbbox()
    if box is None:
        raise RuntimeError("Das Quell-Icon enthält keine sichtbare Grafik.")
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    side = max(width, height)
    center_x, center_y = (left + right) / 2, (top + bottom) / 2
    return image.crop((
        int(center_x - side / 2),
        int(center_y - side / 2),
        int(center_x + side / 2),
        int(center_y + side / 2),
    ))

def compose_icon(image, ratio):
    artwork = crop_to_content(image).resize(
        (int(RENDER_BASE * ratio), int(RENDER_BASE * ratio)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (RENDER_BASE, RENDER_BASE), BACKGROUND)
    offset = (RENDER_BASE - artwork.width) // 2
    canvas.alpha_composite(artwork, (offset, offset))
    return canvas

regular = compose_icon(content, REGULAR_RATIO)
maskable = compose_icon(content, MASKABLE_RATIO)

def emit(image, size, path):
    image.convert("RGBA").resize((size, size), Image.LANCZOS).save(path, optimize=True)

emit(regular, 32, f"{ICON_DIR}/favicon-32.png")
emit(regular, 180, f"{ICON_DIR}/apple-touch-icon.png")
emit(regular, 192, f"{ICON_DIR}/icon-192.png")
emit(regular, 512, f"{ICON_DIR}/icon-512.png")
emit(maskable, 512, f"{ICON_DIR}/icon-maskable-512.png")

with open(WEB_FAVICON, "wb") as handle:
    handle.write(svg)
`;

execFileSync("python3", ["-c", script], { stdio: "inherit" });
console.log(`App-Icon-Set aus ${source} abgeleitet (Icons + Web-Favicon).`);

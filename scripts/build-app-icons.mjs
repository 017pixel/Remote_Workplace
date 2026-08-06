#!/usr/bin/env node
/**
 * Leitet das komplette App-Icon-Set aus dem Root-`favicon.svg` ab.
 *
 * Quelle ist `/favicon.svg` im Repo-Root — dieselbe Datei, die T3 Code als
 * Projekt-Icon in der Seitenleiste verwendet. Dadurch zeigen Browser-Favicon,
 * PWA-Icons, iOS (apple-touch-icon) und Android (maskable) auf dasselbe
 * Markenzeichen.
 *
 * Alle PNGs erhalten den vollen Theme-Hintergrund #0a0a0a (wie bisher), das
 * maskable-Icon zusätzlich die Android-Safe-Zone: Icon zentriert auf 66 %.
 *
 * Aufruf:
 *   node scripts/build-app-icons.mjs
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
MASKABLE_RATIO = 0.66

svg = open(SOURCE, "rb").read()

def render(base):
    png = cairosvg.svg2png(bytestring=svg, output_width=base, output_height=base)
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    canvas = Image.new("RGBA", (base, base), BACKGROUND)
    canvas.alpha_composite(image)
    return canvas, image

canvas, content = render(RENDER_BASE)

def emit(image, size, path):
    image.convert("RGBA").resize((size, size), Image.LANCZOS).save(path, optimize=True)

emit(canvas, 32, f"{ICON_DIR}/favicon-32.png")
emit(canvas, 180, f"{ICON_DIR}/apple-touch-icon.png")
emit(canvas, 192, f"{ICON_DIR}/icon-192.png")
emit(canvas, 512, f"{ICON_DIR}/icon-512.png")

box = content.getbbox()
cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
side = max(box[2] - box[0], box[3] - box[1])
target = int(RENDER_BASE * MASKABLE_RATIO)
icon = content.crop((
    int(cx - side / 2), int(cy - side / 2),
    int(cx + side / 2), int(cy + side / 2),
)).resize((target, target), Image.LANCZOS)
maskable = Image.new("RGBA", (RENDER_BASE, RENDER_BASE), BACKGROUND)
maskable.paste(icon, ((RENDER_BASE - target) // 2, (RENDER_BASE - target) // 2), icon)
emit(maskable, 512, f"{ICON_DIR}/icon-maskable-512.png")

with open(WEB_FAVICON, "wb") as handle:
    handle.write(svg)
`;

execFileSync("python3", ["-c", script], { stdio: "inherit" });
console.log(`App-Icon-Set aus ${source} abgeleitet (Icons + Web-Favicon).`);

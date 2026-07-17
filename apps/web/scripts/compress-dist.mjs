import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants, brotliCompress, gzip } from "node:zlib";
import { promisify } from "node:util";

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const repositoryRoot = new URL("../../../", import.meta.url);
const distDirectory = new URL("../dist/", import.meta.url);

async function environmentDefaults() {
  try {
    const source = await readFile(new URL(".env", repositoryRoot), "utf8");
    return Object.fromEntries(source
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]));
  } catch {
    return {};
  }
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(entry.name, directory);
    return entry.isDirectory() ? filesBelow(new URL(`${entry.name}/`, directory)) : [url];
  }));
  return nested.flat();
}

const defaults = await environmentDefaults();
const threshold = Number(process.env.COMPRESSION_THRESHOLD_BYTES ?? defaults.COMPRESSION_THRESHOLD_BYTES ?? 1_024);
const quality = Number(process.env.BROTLI_QUALITY ?? defaults.BROTLI_QUALITY ?? 4);
const compressible = /\.(?:css|html|js|json|svg|webmanifest)$/;

await Promise.all((await filesBelow(distDirectory)).map(async (url) => {
  if (!compressible.test(url.pathname)) return;
  const metadata = await stat(url);
  if (metadata.size < threshold) return;
  const source = await readFile(url);
  const [brotli, gzipped] = await Promise.all([
    compressBrotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }),
    compressGzip(source, { level: 9 }),
  ]);
  if (brotli.length < source.length) await writeFile(new URL(`${url.pathname}.br`, url), brotli);
  if (gzipped.length < source.length) await writeFile(new URL(`${url.pathname}.gz`, url), gzipped);
}));

import { Worker } from "node:worker_threads";

interface EmbeddingCandidate {
  id: string;
  vectorJson: string;
}

const MAX_CONCURRENT_WORKERS = 2;
const MAX_QUEUED_SEARCHES = 20;
const WORKER_TIMEOUT_MILLISECONDS = 3_000;

let activeWorkers = 0;
const queue: Array<() => void> = [];

const workerSource = `
  const { parentPort, workerData } = require("node:worker_threads");
  const query = workerData.query;
  const norm = Math.sqrt(query.reduce((sum, value) => sum + value * value, 0)) || 1;
  const ranked = [];
  for (const row of workerData.candidates) {
    try {
      const vector = JSON.parse(row.vectorJson);
      if (!Array.isArray(vector) || vector.length !== query.length) continue;
      let squareSum = 0;
      let dot = 0;
      let valid = true;
      for (let index = 0; index < vector.length; index += 1) {
        const value = vector[index];
        if (!Number.isFinite(value)) {
          valid = false;
          break;
        }
        squareSum += value * value;
        dot += value * query[index];
      }
      if (valid) ranked.push({ id: row.id, similarity: dot / (norm * (Math.sqrt(squareSum) || 1)) });
    } catch {
      // Beschädigte oder alte Embeddings werden übersprungen.
    }
  }
  ranked.sort((left, right) => right.similarity - left.similarity);
  parentPort.postMessage(ranked.slice(0, workerData.limit).map((row) => row.id));
`;

function releaseWorkerSlot() {
  activeWorkers -= 1;
  queue.shift()?.();
}

async function acquireWorkerSlot(): Promise<void> {
  if (activeWorkers < MAX_CONCURRENT_WORKERS) {
    activeWorkers += 1;
    return;
  }
  if (queue.length >= MAX_QUEUED_SEARCHES) {
    throw new Error("Die Warteschlange für die semantische Suche ist ausgelastet.");
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  activeWorkers += 1;
}

/**
 * JSON-Parsing und Cosinusvergleich laufen außerhalb des Fastify-Eventloops.
 * Kandidatenzahl und parallele Worker sind begrenzt, damit Chat-Spitzen weder
 * Heap noch CPU unkontrolliert vervielfachen.
 */
export async function rankEmbeddingCandidates(
  query: number[],
  candidates: EmbeddingCandidate[],
  limit: number,
): Promise<string[]> {
  await acquireWorkerSlot();
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: { query, candidates, limit },
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
  });
  try {
    return await new Promise<string[]>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        void worker.terminate();
        finish(() => reject(new Error("Die semantische Suche hat ihr Zeitlimit überschritten.")));
      }, WORKER_TIMEOUT_MILLISECONDS);
      timeout.unref();
      worker.once("message", (ids: unknown) => finish(() => {
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
          reject(new Error("Die semantische Suche lieferte ein ungültiges Ergebnis."));
          return;
        }
        resolve(ids);
      }));
      worker.once("error", (error) => finish(() => reject(error)));
      worker.once("exit", (code) => {
        if (code !== 0) finish(() => reject(new Error(`Der Worker für die semantische Suche endete mit Status ${code}.`)));
      });
    });
  } finally {
    await worker.terminate();
    releaseWorkerSlot();
  }
}

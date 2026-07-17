import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "4179", 10);
const host = process.env.HOST ?? "127.0.0.1";

createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  createReadStream(join(directory, "index.html")).pipe(response);
}).listen(port, host, () => {
  process.stdout.write(`Embedding harness listening on http://${host}:${port}\n`);
});

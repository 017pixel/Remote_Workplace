import http from "node:http";
import net from "node:net";

const WORKBENCH = { host: "127.0.0.1", port: 3010 };
const T3 = { host: "127.0.0.1", port: 3774 };
const PREFIX = "/workbench";

function pick(pathname) {
  return pathname === PREFIX || pathname.startsWith(PREFIX + "/") ? WORKBENCH : T3;
}

function rewrite(pathname) {
  if (pathname === PREFIX) return "/";
  if (pathname.startsWith(PREFIX + "/")) return pathname.slice(PREFIX.length);
  return pathname;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const t = pick(u.pathname);
  const path = rewrite(u.pathname) + u.search;
  const proxy = http.request(
    {
      host: t.host,
      port: t.port,
      path,
      method: req.method,
      headers: { ...req.headers, host: `${t.host}:${t.port}` },
      timeout: 30000,
    },
    (resp) => {
      res.writeHead(resp.statusCode, resp.headers);
      resp.pipe(res);
    },
  );
  req.pipe(proxy);
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad gateway");
  });
  req.on("error", () => proxy.destroy());
});

server.on("upgrade", (req, clientSocket, head) => {
  const u = new URL(req.url, "http://localhost");
  const t = pick(u.pathname);
  const path = rewrite(u.pathname) + u.search;
  const upstream = net.connect(t.port, t.host, () => {
    let lines = `${req.method} ${path} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === "proxy-connection") continue;
      lines += `${key}: ${value}\r\n`;
    }
    lines += `Host: ${t.host}:${t.port}\r\nConnection: Upgrade\r\n\r\n`;
    upstream.write(lines);
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

server.listen(8080, "127.0.0.1", () => {
  console.log("reverse proxy listening on 127.0.0.1:8080");
});

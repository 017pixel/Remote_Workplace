import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Zentrale Personalisierung (Branding + Tailscale-Hosts): erst workbench.local.json,
// sonst das committete workbench.example.json.
function loadWorkbenchConfig() {
  const directory = resolve(import.meta.dirname, "../../config");
  for (const name of ["workbench.local.json", "workbench.example.json"]) {
    try {
      return JSON.parse(readFileSync(resolve(directory, name), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Workbench-Konfiguration fehlt (config/workbench.local.json oder .example.json).");
}

export default defineConfig(({mode}) => {
  const environment = loadEnv(mode, "../..", "");
  const wb = loadWorkbenchConfig();
  const appNamePlugin = {
    name: "workbench-app-name",
    transformIndexHtml(html: string) {
      return html.replaceAll("__APP_NAME__", wb.branding.appName).replaceAll("__APP_SHORT_NAME__", wb.branding.shortName);
    },
  };
  const backendTarget = process.env.WORKBENCH_DEV_BACKEND_URL || environment.WORKBENCH_DEV_BACKEND_URL || "http://127.0.0.1:3010";
  const devTailscaleUser = process.env.WORKBENCH_DEV_TAILSCALE_USER || environment.WORKBENCH_DEV_TAILSCALE_USER;
  const developmentProxyHeaders = devTailscaleUser ? { "tailscale-user-login": devTailscaleUser } : undefined;
  const proxyOptions = { target: backendTarget, ws: true, changeOrigin: true, ...(developmentProxyHeaders ? { headers: developmentProxyHeaders } : {}) };
  const sameOriginProxyOptions = { ...proxyOptions, changeOrigin: false };
  return ({
  base: "/workbench/",
  plugins: [react(), tailwindcss(), appNamePlugin],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [
      wb.tailscale.hostname,
      wb.tailscale.ip,
      "localhost",
    ],
    proxy: {
      "/api": sameOriginProxyOptions,
      "/t3": proxyOptions,
      "/assets": proxyOptions,
      "/.well-known/t3": proxyOptions,
      "/favicon.ico": proxyOptions,
      "/apple-touch-icon.png": proxyOptions,
      "/ws": proxyOptions,
      "/workbench/api": {
        target: backendTarget,
        ws: true,
        changeOrigin: false,
        ...(developmentProxyHeaders ? { headers: developmentProxyHeaders } : {}),
        rewrite: (path) => path.replace(/^\/workbench/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    // Gehashte Chunks bleiben für bereits geöffnete Tabs erreichbar. Die
    // Lazy-Loader können dadurch bei einem laufenden Build weiterladen, statt
    // auf eine fehlende Datei zu treffen.
    emptyOutDir: false,
    sourcemap: false,
  },
  test: {
    // React lädt ohne NODE_ENV=test/development den Production-Build, dem das
    // stabile `React.act` fehlt. Auf Produktionsmaschinen steht NODE_ENV oft
    // schon auf `production`; Tests sollen davon unabhängig deterministisch
    // mit dem Development-Build laufen.
    env: { NODE_ENV: "test" },
  },
  });
});

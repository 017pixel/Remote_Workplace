import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Zentrale Personalisierung (Branding + Tailscale-Hosts): erst wrapt.local.json,
// sonst das committete wrapt.example.json.
function loadWraptConfig() {
  const directory = resolve(import.meta.dirname, "../../config");
  for (const name of ["wrapt.local.json", "wrapt.example.json", "workbench.local.json"]) {
    try {
      const value = JSON.parse(readFileSync(resolve(directory, name), "utf8"));
      if (value.branding?.appName === "Remote Workplace") value.branding.appName = "Wrapt";
      if (value.branding?.shortName === "Workplace") value.branding.shortName = "Wrapt";
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Wrapt-Konfiguration fehlt (config/wrapt.local.json oder config/wrapt.example.json).");
}

export default defineConfig(({mode}) => {
  const environment = loadEnv(mode, "../..", "");
  const wb = loadWraptConfig();
  const appNamePlugin = {
    name: "wrapt-app-name",
    transformIndexHtml(html: string) {
      return html.replaceAll("__APP_NAME__", wb.branding.appName).replaceAll("__APP_SHORT_NAME__", wb.branding.shortName);
    },
  };
  const backendTarget = process.env.WRAPT_DEV_BACKEND_URL || environment.WRAPT_DEV_BACKEND_URL || "http://127.0.0.1:3010";
  const devTailscaleUser = process.env.WRAPT_DEV_TAILSCALE_USER || environment.WRAPT_DEV_TAILSCALE_USER;
  const developmentProxyHeaders = devTailscaleUser ? { "tailscale-user-login": devTailscaleUser } : undefined;
  const proxyOptions = { target: backendTarget, ws: true, changeOrigin: true, ...(developmentProxyHeaders ? { headers: developmentProxyHeaders } : {}) };
  const sameOriginProxyOptions = { ...proxyOptions, changeOrigin: false };
  return ({
  base: "/wrapt/",
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
      "/wrapt/api": {
        target: backendTarget,
        ws: true,
        changeOrigin: false,
        ...(developmentProxyHeaders ? { headers: developmentProxyHeaders } : {}),
        rewrite: (path) => path.replace(/^\/wrapt/, ""),
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
    setupFiles: ["src/test/setup.ts"],
    // React lädt ohne NODE_ENV=test/development den Production-Build, dem das
    // stabile `React.act` fehlt. Auf Produktionsmaschinen steht NODE_ENV oft
    // schon auf `production`; Tests sollen davon unabhängig deterministisch
    // mit dem Development-Build laufen.
    env: { NODE_ENV: "test" },
  },
  });
});

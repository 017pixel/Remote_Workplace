import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({mode}) => {
  const environment = loadEnv(mode, "../..", "");
  const backendTarget = process.env.WORKBENCH_DEV_BACKEND_URL || environment.WORKBENCH_DEV_BACKEND_URL || "http://127.0.0.1:3010";
  const devTailscaleUser = process.env.WORKBENCH_DEV_TAILSCALE_USER || environment.WORKBENCH_DEV_TAILSCALE_USER;
  const developmentProxyHeaders = devTailscaleUser ? { "tailscale-user-login": devTailscaleUser } : undefined;
  const proxyOptions = { target: backendTarget, ws: true, changeOrigin: true, ...(developmentProxyHeaders ? { headers: developmentProxyHeaders } : {}) };
  return ({
  base: "/workbench/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [
      "benjaminsserver.tail6494b7.ts.net",
      "100.99.141.56",
      "localhost",
    ],
    proxy: {
      "/api": proxyOptions,
      "/t3": proxyOptions,
      "/assets": proxyOptions,
      "/.well-known/t3": proxyOptions,
      "/favicon.ico": proxyOptions,
      "/apple-touch-icon.png": proxyOptions,
      "/ws": proxyOptions,
      "/workbench/api": {
        target: backendTarget,
        ws: true,
        changeOrigin: true,
        ...(developmentProxyHeaders ? { headers: developmentProxyHeaders } : {}),
        rewrite: (path) => path.replace(/^\/workbench/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  });
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8088";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/user-assets/" : "/",
  plugins: [react()],
  build: { outDir: "dist/user-assets" },
  server: { port: 5174, host: true, proxy: { "/api": apiProxyTarget } },
  test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", css: true },
}));

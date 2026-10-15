import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveApiBase, resolveSiteUrl } from "./src/urlConfig.js";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && mode === "production") {
    resolveApiBase(env.VITE_API_URL, { production: true });
    resolveSiteUrl(env.VITE_SITE_URL, { production: true });
  }
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:4000";
  const forward = {
    target,
    changeOrigin: false,
    configure(proxy) {
      proxy.on("error", (err, _req, res) => {
        console.error(
          `\n[vite] cannot reach the API at ${target} (${err.code ?? err.message}).\n        Start it with "npm run dev" in /server, and make sure PORT in server/.env matches (or set VITE_PROXY_TARGET).\n`,
        );
        if (res && !res.headersSent && typeof res.writeHead === "function") {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              code: "BACKEND_UNAVAILABLE",
              message:
                "The Nessence server is not running or cannot be reached.",
            }),
          );
        }
      });
    },
  };
  return {
    test: {
      environment: "jsdom",
      globals: true,
      css: false,
      testTimeout: 20000,
      setupFiles: ["./test/setup.js"],
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) =>
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              id,
            )
              ? "vendor"
              : undefined,
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": forward,
        "/media": forward,
        "/sitemap.xml": forward,
        "/robots.txt": forward,
      },
    },
  };
});

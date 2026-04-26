import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import pkg from "./package.json" with { type: "json" };

// Unique per-build identifier. Used by the runtime version check to detect
// when the user is running a stale bundle (LINE WebView / browser cache).
const BUILD_ID = `${pkg.version}.${Date.now()}`;

// Emits dist/build-info.json so the running app can poll it and compare
// against the embedded __BUILD_ID__. Nginx serves this file with no-cache.
function buildInfoPlugin(buildId: string): Plugin {
  return {
    name: "build-info",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-info.json",
        source: `${JSON.stringify({
          buildId,
          builtAt: new Date().toISOString(),
        })}\n`,
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
    buildInfoPlugin(BUILD_ID),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Charts library - largest dependency (~400KB)
          recharts: ["recharts"],
          // Radix UI primitives - grouped for better caching
          "radix-ui": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-tabs",
          ],
          // React core + React-dependent libraries
          "react-vendor": [
            "react",
            "react-dom",
            "react-router-dom",
            "lucide-react",
            "cmdk",
            "sonner",
            "react-hook-form",
            "recur-tw",
          ],
          // Data fetching
          tanstack: ["@tanstack/react-query"],
          // Backend services
          supabase: ["@supabase/supabase-js"],
          // Pure utility libraries (no React dependency)
          vendor: [
            "axios",
            "clsx",
            "tailwind-merge",
            "class-variance-authority",
            "zod",
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5187,
    cors: true,
    proxy: {
      "/api": {
        target: "http://localhost:8087",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { marketingHtmlPlugin } from "./vite-plugin-marketing-html";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react(), marketingHtmlPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      // More specific CSS entry first so it is not treated as a subpath of the TS entry.
      {
        find: "@call-agent/ui/styles.css",
        replacement: path.resolve(
          monorepoRoot,
          "packages/ui/src/styles/index.css",
        ),
      },
      {
        find: "@call-agent/ui",
        replacement: path.resolve(monorepoRoot, "packages/ui/src/index.ts"),
      },
      {
        find: "@call-agent/contracts",
        replacement: path.resolve(
          monorepoRoot,
          "packages/contracts/src/index.ts",
        ),
      },
      {
        find: "react",
        replacement: path.resolve(__dirname, "node_modules/react"),
      },
      {
        find: "react-dom",
        replacement: path.resolve(__dirname, "node_modules/react-dom"),
      },
    ],
  },
  server: {
    port: 5173,
    fs: {
      allow: [monorepoRoot],
    },
    proxy: {
      // Nest global prefix is "api" — do not strip /api (get-demo form, etc.)
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173,
  },
});

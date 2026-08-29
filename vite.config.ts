import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

function hasMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

function longRequestPlugin(): Plugin {
  return {
    name: "moti:long-requests",
    apply: "serve",
    configureServer(server) {
      const apply = () => {
        const http = server.httpServer;
        if (!http) return;
        http.timeout = 0;
        http.headersTimeout = 0;
        http.requestTimeout = 0;
      };
      apply();
      server.httpServer?.once("listening", apply);
    },
  };
}

function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "moti:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        await mod.ensureDbReady?.();
      } catch (error) {
        console.error("[moti] database bootstrap failed:", error);
      }
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  ssr: {
    external: ["@electric-sql/pglite", "@openai/codex-sdk", "@openai/codex"],
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    pgliteBootstrapPlugin(),
    longRequestPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "node-server",
            traceDeps: ["@electric-sql/pglite*", "@openai/codex*"],
            routeRules: { "/**": { maxDuration: 480 } },
          }),
        ]
      : []),
    viteReact(),
  ],
}));

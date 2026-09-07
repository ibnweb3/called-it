import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const src = fileURLToPath(new URL("./src", import.meta.url));

// Only @chain/config is borrowed from the monorepo — pure data (rpc urls,
// chain id, token addresses), zero deps, safe to import eagerly. Everything
// else here talks to the vault + tUSDC directly over raw viem; no
// @somnia-chain/markets-sdk, so no browser-bundling question to answer.
// Served as the /house section of the Called It site (calledit-somnia.pages.dev/house),
// so assets resolve under /house/. Override with BASE=/ for a standalone deploy.
const base = process.env.BASE ?? "/house/";

export default defineConfig({
  base,
  plugins: [react()],
  envPrefix: ["VITE_"],
  resolve: {
    alias: {
      "@": src,
      "@chain/config": fileURLToPath(new URL("../../packages/chain/src/config.ts", import.meta.url)),
    },
  },
  server: { port: process.env.PORT ? Number(process.env.PORT) : 5174 },
  build: { target: "es2022" },
});

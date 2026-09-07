import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const src = fileURLToPath(new URL("./src", import.meta.url));

// Only @chain/config is borrowed from the monorepo — pure data (rpc urls,
// chain id, token addresses), zero deps, safe to import eagerly. Everything
// else here talks to the vault + tUSDC directly over raw viem; no
// @somnia-chain/markets-sdk, so no browser-bundling question to answer.
export default defineConfig({
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

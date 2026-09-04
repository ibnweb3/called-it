import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const src = fileURLToPath(new URL("./src", import.meta.url));
const chainSrc = fileURLToPath(new URL("../../packages/chain/src/index.ts", import.meta.url));

// `@called-it/chain` ships TypeScript source, so it is aliased into the app's
// own compile graph rather than treated as a prebuilt dependency.
//
// SPEC §3 open question: it wraps `@somnia-chain/markets-sdk`, which has not
// been confirmed to bundle for a browser. Set CHAIN_IN_BROWSER=0 to swap it for
// a stub that reports "unavailable" instead of breaking the build — the rest of
// the app (all reads, demo mode) keeps working.
const chainInBrowser = process.env.CHAIN_IN_BROWSER !== "0";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@": src,
      // pure-data module (rpc urls, token addresses) — safe to import eagerly
      "@chain/config": fileURLToPath(new URL("../../packages/chain/src/config.ts", import.meta.url)),
      "@called-it/chain": chainInBrowser ? chainSrc : `${src}/lib/chain-stub.ts`,
    },
  },
  server: { port: process.env.PORT ? Number(process.env.PORT) : 5173 },
  build: { target: "es2022" },
});

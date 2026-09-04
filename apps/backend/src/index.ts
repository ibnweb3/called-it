// Called It backend entrypoint: migrate (on db import), start the indexer, wire
// the Telegram notifier, serve the API.

import "./db.js"; // opens + migrates the SQLite cache
import { env } from "./env.js";
import { buildServer } from "./server.js";
import { startIndexer, stopIndexer } from "./indexer.js";
import { startTelegramNotifier } from "./telegram.js";

async function main(): Promise<void> {
  const app = await buildServer();

  startIndexer();
  startTelegramNotifier();

  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`Called It backend on :${env.port} — ${env.network}`);

  const shutdown = async (sig: string) => {
    app.log.info(`${sig} — shutting down`);
    stopIndexer();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

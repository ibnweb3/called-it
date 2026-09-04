import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { env } from "./env.js";
import { registerAuthRoutes } from "./auth.js";
import { registerRoundRoutes } from "./routes/rounds.js";
import { registerPriceRoutes } from "./routes/price.js";
import { registerPlayerRoutes } from "./routes/players.js";
import { registerCallRoutes } from "./routes/calls.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerLiveRoute } from "./routes/live.js";
import { config } from "./chain.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  await app.register(cors, {
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((s) => s.trim()),
  });
  await app.register(jwt, { secret: env.jwtSecret });
  await app.register(websocket);

  app.get("/health", async () => ({
    ok: true,
    network: env.network,
    chainId: config.chainId,
    venueId: config.venueId,
  }));

  registerAuthRoutes(app);
  registerRoundRoutes(app);
  registerPriceRoutes(app);
  registerPlayerRoutes(app);
  registerCallRoutes(app);
  registerRoomRoutes(app);
  registerLiveRoute(app);

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const code = err.statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    reply.code(code).send({ error: err.message });
  });

  return app;
}

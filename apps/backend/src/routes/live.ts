// GET /v1/live — a WebSocket the web app and the bot subscribe to.
//
// Server → client frames:
//   { t: "hello", now }
//   { t: "round", round }          new or updated round
//   { t: "locking", round }        ~60s before lock
//   { t: "settled", round }        round resolved/voided
//   { t: "result", ... }           a graded call — only to sockets that
//                                  subscribed with this address
//   { t: "tick", now }             15s heartbeat
//
// Client → server:
//   { subscribe: { address } }     also receive this address's results

import type { FastifyInstance } from "fastify";
import { bus } from "../events.js";

export function registerLiveRoute(app: FastifyInstance): void {
  app.get("/v1/live", { websocket: true }, (socket) => {
    let watching: string | null = null;
    const send = (obj: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
    };

    send({ t: "hello", now: Math.floor(Date.now() / 1000) });

    const onRoundNew = (r: unknown) => send({ t: "round", round: r });
    const onRoundUpd = (r: unknown) => send({ t: "round", round: r });
    const onLocking = (p: { round: unknown }) => send({ t: "locking", round: p.round });
    const onSettled = (p: { round: unknown }) => send({ t: "settled", round: p.round });
    const onGraded = (p: { address: string }) => {
      if (watching && p.address.toLowerCase() === watching) send({ t: "result", ...p });
    };

    bus.onT("round:new", onRoundNew);
    bus.onT("round:update", onRoundUpd);
    bus.onT("round:locking", onLocking);
    bus.onT("round:settled", onSettled);
    bus.onT("call:graded", onGraded);

    const heartbeat = setInterval(() => send({ t: "tick", now: Math.floor(Date.now() / 1000) }), 15_000);

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.subscribe?.address && typeof msg.subscribe.address === "string") {
          watching = msg.subscribe.address.toLowerCase();
          send({ t: "subscribed", address: watching });
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.on("close", () => {
      clearInterval(heartbeat);
      bus.off("round:new", onRoundNew);
      bus.off("round:update", onRoundUpd);
      bus.off("round:locking", onLocking);
      bus.off("round:settled", onSettled);
      bus.off("call:graded", onGraded);
    });
  });
}

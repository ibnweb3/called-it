// Squad rooms. Create a room, share the link, everyone calls the same windows,
// see a room leaderboard. Weekly-ish scoping is done at read time (last 7 days
// of graded calls) so there's no reset job.

import type { FastifyInstance } from "fastify";
import { getAddress } from "viem";
import { createRoom, getRoom, joinRoom, roomMembers, getStreak, gradedRoomCalls, getPlayer } from "../db.js";
import { roomId as newRoomId } from "../lib/ids.js";
import { requireAuth } from "../auth.js";

const WEEK = 7 * 24 * 3600;

export function registerRoomRoutes(app: FastifyInstance): void {
  app.post<{ Body: { name: string } }>(
    "/v1/rooms",
    { preHandler: requireAuth },
    async (req, reply) => {
      const name = String(req.body.name ?? "").trim().slice(0, 40);
      if (name.length < 2) return reply.code(400).send({ error: "name too short" });
      let id = newRoomId();
      for (let i = 0; i < 5 && getRoom(id); i++) id = newRoomId();
      createRoom(id, name, req.player!);
      joinRoom(id, req.player!);
      return { id, name };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/rooms/:id/join",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!getRoom(req.params.id)) return reply.code(404).send({ error: "no such room" });
      joinRoom(req.params.id, req.player!);
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>("/v1/rooms/:id", async (req, reply) => {
    const room = getRoom(req.params.id);
    if (!room) return reply.code(404).send({ error: "no such room" });

    const since = Math.floor(Date.now() / 1000) - WEEK;
    const members = roomMembers(req.params.id);

    const board = members
      .map((addr) => {
        // this week's calls this player made *in this room*
        const rows = gradedRoomCalls(addr, req.params.id, since);
        const wins = rows.filter((r) => r.outcome === "won").length;
        const net = rows.reduce((a, r) => a + (r.payout - r.spent), 0);
        return {
          address: getAddress(addr),
          handle: getPlayer(addr)?.handle ?? null,
          calls: rows.length,
          wins,
          net: Math.round(net * 1e4) / 1e4,
          bestStreak: getStreak(addr).best,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.net - a.net);

    return {
      id: room.id,
      name: room.name,
      memberCount: members.length,
      weekStart: since,
      leaderboard: board.map((r, i) => ({ rank: i + 1, ...r })),
    };
  });
}

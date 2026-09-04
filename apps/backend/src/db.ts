// SQLite via node:sqlite (built into Node 22.5+ — no native build step). The DB
// is a rebuildable cache; the chain is the source of truth.

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface PlayerRow {
  address: string;
  handle: string | null;
  created_at: number;
  tg_chat_id: string | null;
  notify_rounds: number;
}

export interface RoundRow {
  market_id: string;
  asset: string;
  interval_sec: number;
  opens_at: number;
  locks_at: number;
  status: string;
  opening_price: number | null;
  closing_price: number | null;
  result: string | null;
  first_seen: number;
  settled_at: number | null;
}

export interface CallRow {
  id: number;
  address: string;
  market_id: string;
  side: string;
  chip_usd: number;
  contracts: number;
  spent: number;
  avg_price: number;
  tx_hash: string | null;
  room_id: string | null;
  placed_at: number;
  outcome: string | null;
  payout: number | null;
}

export interface StreakRow {
  address: string;
  current: number;
  best: number;
  total_calls: number;
  total_wins: number;
  net_usd: number;
  updated_at: number | null;
}

export interface RoomRow {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export const db = new DatabaseSync(env.databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
db.exec(readFileSync(join(here, "schema.sql"), "utf8"));

export const now = () => Math.floor(Date.now() / 1000);

type Params = Record<string, string | number | null> | (string | number | null)[];

const stmts = new Map<string, StatementSync>();
function prep(sql: string): StatementSync {
  let s = stmts.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmts.set(sql, s);
  }
  return s;
}
function one<T>(sql: string, params: Params = []): T | undefined {
  const r = Array.isArray(params) ? prep(sql).get(...params) : prep(sql).get(params);
  return r as unknown as T | undefined;
}
function many<T>(sql: string, params: Params = []): T[] {
  const r = Array.isArray(params) ? prep(sql).all(...params) : prep(sql).all(params);
  return r as unknown as T[];
}
function run(sql: string, params: Params = []): void {
  if (Array.isArray(params)) prep(sql).run(...params);
  else prep(sql).run(params);
}

// ─── players ────────────────────────────────────────────────────────────────

export function upsertPlayer(address: string): PlayerRow {
  const addr = address.toLowerCase();
  run(`INSERT INTO players (address, created_at) VALUES (?, ?) ON CONFLICT(address) DO NOTHING`, [addr, now()]);
  return one<PlayerRow>(`SELECT * FROM players WHERE address = ?`, [addr])!;
}

export function getPlayer(address: string): PlayerRow | undefined {
  return one<PlayerRow>(`SELECT * FROM players WHERE address = ?`, [address.toLowerCase()]);
}

export function linkTelegram(address: string, chatId: string, notifyRounds: boolean): void {
  run(`UPDATE players SET tg_chat_id = ?, notify_rounds = ? WHERE address = ?`, [
    chatId,
    notifyRounds ? 1 : 0,
    address.toLowerCase(),
  ]);
}

export function setHandle(address: string, handle: string): void {
  run(`UPDATE players SET handle = ? WHERE address = ?`, [handle, address.toLowerCase()]);
}

export function playersLinkedForRoundAlerts(): PlayerRow[] {
  return many<PlayerRow>(`SELECT * FROM players WHERE tg_chat_id IS NOT NULL AND notify_rounds = 1`);
}

// ─── rounds ─────────────────────────────────────────────────────────────────

export function upsertRound(r: Omit<RoundRow, "first_seen" | "settled_at">): void {
  run(
    `INSERT INTO rounds (market_id, asset, interval_sec, opens_at, locks_at, status,
        opening_price, closing_price, result, first_seen)
     VALUES (@market_id, @asset, @interval_sec, @opens_at, @locks_at, @status,
        @opening_price, @closing_price, @result, @first_seen)
     ON CONFLICT(market_id) DO UPDATE SET
        status        = excluded.status,
        opening_price = COALESCE(excluded.opening_price, rounds.opening_price),
        closing_price = COALESCE(excluded.closing_price, rounds.closing_price),
        result        = COALESCE(excluded.result, rounds.result)`,
    { ...r, first_seen: now() },
  );
}

export function markRoundSettled(marketId: string, result: string, closing: number | null): void {
  run(
    `UPDATE rounds SET status = ?, result = ?, closing_price = COALESCE(?, closing_price),
        settled_at = ? WHERE market_id = ?`,
    [result === "VOID" ? "voided" : "resolved", result, closing, now(), marketId],
  );
}

export function setRoundResult(marketId: string, result: string, closing: number | null): void {
  run(`UPDATE rounds SET result = ?, closing_price = COALESCE(?, closing_price) WHERE market_id = ?`, [
    result,
    closing,
    marketId,
  ]);
}

export function getRound(marketId: string): RoundRow | undefined {
  return one<RoundRow>(`SELECT * FROM rounds WHERE market_id = ?`, [marketId]);
}

export function roundHistory(asset: string | undefined, limit: number): RoundRow[] {
  return asset
    ? many<RoundRow>(
        `SELECT * FROM rounds WHERE result IS NOT NULL AND asset = ? ORDER BY locks_at DESC LIMIT ?`,
        [asset, limit],
      )
    : many<RoundRow>(`SELECT * FROM rounds WHERE result IS NOT NULL ORDER BY locks_at DESC LIMIT ?`, [limit]);
}

// ─── calls ──────────────────────────────────────────────────────────────────

export function recordCall(c: {
  address: string;
  market_id: string;
  side: string;
  chip_usd: number;
  contracts: number;
  spent: number;
  avg_price: number;
  tx_hash: string | null;
  room_id: string | null;
}): CallRow {
  const addr = c.address.toLowerCase();
  run(
    `INSERT INTO calls (address, market_id, side, chip_usd, contracts, spent, avg_price, tx_hash, room_id, placed_at)
     VALUES (@address, @market_id, @side, @chip_usd, @contracts, @spent, @avg_price, @tx_hash, @room_id, @placed_at)
     ON CONFLICT(address, market_id) DO UPDATE SET
        side = excluded.side, chip_usd = excluded.chip_usd, contracts = excluded.contracts,
        spent = excluded.spent, avg_price = excluded.avg_price, tx_hash = excluded.tx_hash,
        room_id = COALESCE(excluded.room_id, calls.room_id)`,
    { ...c, address: addr, placed_at: now() },
  );
  return one<CallRow>(`SELECT * FROM calls WHERE address = ? AND market_id = ?`, [addr, c.market_id])!;
}

export function callsForRound(marketId: string): CallRow[] {
  return many<CallRow>(`SELECT * FROM calls WHERE market_id = ?`, [marketId]);
}

export function gradeCall(id: number, outcome: string, payout: number): void {
  run(`UPDATE calls SET outcome = ?, payout = ? WHERE id = ?`, [outcome, payout, id]);
}

export function callsForPlayer(address: string, limit = 50): CallRow[] {
  return many<CallRow>(`SELECT * FROM calls WHERE address = ? ORDER BY placed_at DESC LIMIT ?`, [
    address.toLowerCase(),
    limit,
  ]);
}

export function playerCallForRound(address: string, marketId: string): CallRow | undefined {
  return one<CallRow>(`SELECT * FROM calls WHERE address = ? AND market_id = ?`, [address.toLowerCase(), marketId]);
}

// ─── streaks ────────────────────────────────────────────────────────────────

export function getStreak(address: string): StreakRow {
  const addr = address.toLowerCase();
  run(`INSERT INTO streaks (address) VALUES (?) ON CONFLICT(address) DO NOTHING`, [addr]);
  return one<StreakRow>(`SELECT * FROM streaks WHERE address = ?`, [addr])!;
}

export function writeStreak(s: StreakRow): void {
  run(
    `UPDATE streaks SET current = @current, best = @best, total_calls = @total_calls,
        total_wins = @total_wins, net_usd = @net_usd, updated_at = @updated_at WHERE address = @address`,
    { ...s, updated_at: now() },
  );
}

export function topStreaks(limit: number): (StreakRow & { handle: string | null })[] {
  return many<StreakRow & { handle: string | null }>(
    `SELECT s.*, p.handle FROM streaks s LEFT JOIN players p ON p.address = s.address
     WHERE s.total_calls > 0 ORDER BY s.best DESC, s.net_usd DESC LIMIT ?`,
    [limit],
  );
}

// ─── rooms ──────────────────────────────────────────────────────────────────

export function createRoom(id: string, name: string, createdBy: string): void {
  run(`INSERT INTO rooms (id, name, created_by, created_at) VALUES (?, ?, ?, ?)`, [
    id,
    name,
    createdBy.toLowerCase(),
    now(),
  ]);
}

export function getRoom(id: string): RoomRow | undefined {
  return one<RoomRow>(`SELECT * FROM rooms WHERE id = ?`, [id]);
}

export function joinRoom(roomId: string, address: string): void {
  run(`INSERT INTO room_members (room_id, address, joined_at) VALUES (?, ?, ?) ON CONFLICT(room_id, address) DO NOTHING`, [
    roomId,
    address.toLowerCase(),
    now(),
  ]);
}

export function roomMembers(roomId: string): string[] {
  return many<{ address: string }>(`SELECT address FROM room_members WHERE room_id = ?`, [roomId]).map((r) => r.address);
}

export function gradedRoomCalls(
  address: string,
  roomId: string,
  since: number,
): { outcome: string; payout: number; spent: number }[] {
  return many(
    `SELECT outcome, payout, spent FROM calls
     WHERE address = ? AND room_id = ? AND placed_at >= ? AND outcome IS NOT NULL`,
    [address.toLowerCase(), roomId, since],
  );
}

// ─── meta ───────────────────────────────────────────────────────────────────

export function getMeta(key: string): string | undefined {
  return one<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, [key])?.value;
}

export function setMeta(key: string, value: string): void {
  run(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
}

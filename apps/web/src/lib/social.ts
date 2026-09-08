// The squads backend for demo mode (apps/backend in SOCIAL_ONLY mode).
//
// Demo rounds stay 100% local — this only carries the things that have to be
// shared to mean anything: who is in a squad, the squad's weekly board, and the
// global streak leaderboard. The connected wallet signs a login message once
// (real proof of the address, no key held anywhere); play-money call results
// are reported here after the local engine settles them so a room's board is
// the same for everyone in it.
//
// Every method fails soft: a dead server raises a PlayerFacingError the screen
// can toast, and DemoGateway falls back to its local behaviour.

import { signLogin, type Connection } from "./wallet";
import { PlayerFacingError } from "./gateway";
import type { LeaderRow, RoomDetail } from "./types";

const JWT_STORE = "calledit.jwt";

export interface DemoCallReport {
  marketId: string;
  side: "UP" | "DOWN";
  chipUsd: number;
  contracts: number;
  spent: number;
  avgPrice: number;
  outcome: "won" | "lost" | "void";
  payout: number;
  roomId?: string | null;
}

export class SocialClient {
  private token: string | null;

  constructor(private readonly baseUrl: string) {
    this.token = read(JWT_STORE);
  }

  get authed(): boolean {
    return this.token !== null;
  }

  /** Sign the login message with the connected wallet, trade it for a session. */
  async auth(conn: Connection): Promise<void> {
    const issuedAt = Date.now();
    let signature: `0x${string}`;
    try {
      signature = await signLogin(conn, issuedAt);
    } catch (err) {
      // user rejected the signature, or the wallet choked — not fatal
      throw new PlayerFacingError(
        "Sign the message to use squads",
        (err as Error)?.message?.slice(0, 120) || undefined,
      );
    }
    const res = await this.fetch("/v1/auth", {
      method: "POST",
      body: JSON.stringify({ address: conn.address, issuedAt, signature }),
    });
    const { token } = (await res.json()) as { token: string };
    this.token = token;
    write(JWT_STORE, token);
  }

  forget(): void {
    this.token = null;
    try {
      localStorage.removeItem(JWT_STORE);
    } catch {
      /* ignore */
    }
  }

  async createRoom(name: string): Promise<{ id: string; name: string }> {
    const res = await this.fetch("/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ name }),
      authed: true,
    });
    return (await res.json()) as { id: string; name: string };
  }

  async joinRoom(id: string): Promise<RoomDetail> {
    await this.fetch(`/v1/rooms/${encodeURIComponent(id)}/join`, { method: "POST", authed: true });
    return this.room(id);
  }

  async room(id: string): Promise<RoomDetail> {
    const res = await this.fetch(`/v1/rooms/${encodeURIComponent(id)}`);
    return (await res.json()) as RoomDetail;
  }

  async leaderboard(limit = 25): Promise<LeaderRow[]> {
    const res = await this.fetch(`/v1/leaderboard?limit=${limit}`);
    const { leaderboard } = (await res.json()) as { leaderboard: LeaderRow[] };
    return leaderboard;
  }

  async setHandle(handle: string): Promise<void> {
    await this.fetch("/v1/players/me/handle", {
      method: "POST",
      body: JSON.stringify({ handle }),
      authed: true,
    });
  }

  /** Fire-and-forget: report a settled play-money call so squad boards are real. */
  async reportCall(c: DemoCallReport): Promise<void> {
    await this.fetch("/v1/calls/demo", {
      method: "POST",
      body: JSON.stringify(c),
      authed: true,
    });
  }

  // ---------------------------------------------------------------- plumbing --

  private async fetch(
    path: string,
    init: RequestInit & { authed?: boolean } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body) headers["content-type"] = "application/json";
    if (init.authed) {
      if (!this.token) throw new PlayerFacingError("Connect your wallet to use squads");
      headers.authorization = `Bearer ${this.token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new PlayerFacingError("Can't reach the squad server", "Check your connection and try again.");
    }

    if (res.status === 401) {
      this.forget();
      throw new PlayerFacingError("Your session expired", "Reconnect your wallet.");
    }
    if (!res.ok) {
      const msg = await res
        .json()
        .then((j: { error?: string }) => j.error)
        .catch(() => null);
      throw new PlayerFacingError(msg || `Squad server error (${res.status})`);
    }
    return res;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — no persisted session, that's all */
  }
}

// Burner-wallet auth. The browser generates a key, signs a short login message
// with it once, and gets a 30-day session JWT. The backend never sees the key.
//
// This gates streak attribution, Telegram linking and room membership — not
// money (bets are signed and broadcast by the burner in the browser). So the
// bar is "prove you control this address recently", not full SIWE.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyMessage, isAddress, getAddress } from "viem";

const MAX_AGE_MS = 10 * 60_000;

export function loginMessage(address: string, issuedAt: number): string {
  return `Called It login\n${getAddress(address)}\n${issuedAt}`;
}

export async function verifyLogin(
  address: string,
  issuedAt: number,
  signature: `0x${string}`,
): Promise<boolean> {
  if (!isAddress(address)) return false;
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) return false;
  return verifyMessage({ address: getAddress(address), message: loginMessage(address, issuedAt), signature });
}

declare module "fastify" {
  interface FastifyRequest {
    /** lowercased address from a valid Bearer token, set by `requireAuth`. */
    player?: string;
  }
}

/** Prehandler: 401 unless a valid `Authorization: Bearer <jwt>` is present. */
export async function requireAuth(req: FastifyRequest): Promise<void> {
  try {
    const decoded = await req.jwtVerify<{ sub: string }>();
    req.player = decoded.sub.toLowerCase();
  } catch {
    throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  }
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post<{ Body: { address: string; issuedAt: number; signature: `0x${string}` } }>(
    "/v1/auth",
    {
      schema: {
        body: {
          type: "object",
          required: ["address", "issuedAt", "signature"],
          properties: {
            address: { type: "string" },
            issuedAt: { type: "number" },
            signature: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { address, issuedAt, signature } = req.body;
      if (!(await verifyLogin(address, issuedAt, signature))) {
        return reply.code(400).send({ error: "bad signature" });
      }
      const sub = getAddress(address);
      const token = app.jwt.sign({ sub }, { expiresIn: "30d" });
      return { token, address: sub };
    },
  );
}

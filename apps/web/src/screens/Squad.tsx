import { useCallback, useEffect, useState } from "react";
import { Btn, Bubble, Label, Sticker } from "@/components/kit";
import { Mascot } from "@/components/Mascot";
import { signedUsd, who } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { RoomDetail, RoomMember } from "@/lib/types";

/** Top N plus your own row if you're outside it — bounded regardless of how
 *  many people are actually in the room, so this never has to scroll. */
const TOP_N = 5;

/**
 * Squads (SPEC §5.6). A room is a name, a link, and a weekly table — the point
 * is the group chat, so the invite is one tap and the table fits on a phone.
 */
export function Squad() {
  const gateway = useApp((s) => s.gateway);
  const roomId = useApp((s) => s.roomId);
  const address = useApp((s) => s.address);
  const setRoom = useApp((s) => s.setRoom);
  const toast = useApp((s) => s.toast);

  const [room, setRoom_] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        setRoom_(await gateway.room(id));
      } catch {
        setRoom_(null);
      } finally {
        setLoading(false);
      }
    },
    [gateway],
  );

  useEffect(() => {
    if (roomId) void load(roomId);
    else setRoom_(null);
  }, [roomId, load]);

  async function create() {
    try {
      const made = await gateway.createRoom(name.trim());
      setRoom(made);
      setName("");
      toast(`${made.name} is open`, "good");
    } catch (err) {
      toast((err as Error).message || "Couldn't make that room", "bad");
    }
  }

  async function join(id: string) {
    try {
      const joined = await gateway.joinRoom(id.trim());
      setRoom({ id: joined.id, name: joined.name });
      setCode("");
      toast(`You're in ${joined.name}`, "good");
    } catch (err) {
      toast((err as Error).message || "No room with that code", "bad");
    }
  }

  const invite = roomId ? `${window.location.origin}/r/${roomId}` : "";
  const shown = room ? topAndYou(room.leaderboard, address, TOP_N) : [];

  return (
    <div className="screen">
      {room ? (
        <>
          <Sticker tilt="r" className="stack" style={{ gap: 7 }}>
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <div>
                <Label>this week</Label>
                <h2 style={{ fontSize: 20 }}>🏠 {room.name}</h2>
                <div className="tiny dim">
                  {room.memberCount} player{room.memberCount === 1 ? "" : "s"} · code{" "}
                  <span className="num">{room.id}</span>
                </div>
              </div>
              <Mascot mood="idle" size={40} />
            </div>

            <div className="row" style={{ gap: 6 }}>
              <Btn
                small
                tone="gold"
                onClick={() => {
                  void navigator.clipboard?.writeText(invite);
                  toast("Invite link copied", "info");
                }}
              >
                Copy invite
              </Btn>
              {"share" in navigator && (
                <Btn
                  small
                  tone="sky"
                  onClick={() =>
                    void navigator.share({ title: room.name, text: `Play ${room.name} on Called It`, url: invite })
                  }
                >
                  Share
                </Btn>
              )}
              <Btn small tone="ghost" onClick={() => setRoom(null)}>
                Play solo
              </Btn>
            </div>
          </Sticker>

          <ul className="list">
            <li className="row-between tiny dim" style={{ padding: "0 10px" }}>
              <span>player</span>
              <span style={{ display: "flex", gap: 16 }}>
                <span style={{ width: 30, textAlign: "right" }}>w/c</span>
                <span style={{ width: 26, textAlign: "right" }}>🔥</span>
                <span style={{ width: 54, textAlign: "right" }}>net</span>
              </span>
            </li>
            {shown.map((m) => (
              <li
                key={m.address}
                className={`list-row ${m.address.toLowerCase() === address.toLowerCase() ? "me" : ""}`}
              >
                <span className="rank num">{m.rank}</span>
                <span className="grow">{who(m.handle, m.address)}</span>
                <span className="num tiny" style={{ width: 30, textAlign: "right" }}>
                  {m.wins}/{m.calls}
                </span>
                <span className="num tiny" style={{ width: 26, textAlign: "right" }}>
                  {m.bestStreak}
                </span>
                <span className="num tiny" style={{ width: 54, textAlign: "right" }}>
                  {signedUsd(m.net)}
                </span>
              </li>
            ))}
          </ul>
          {room.leaderboard.length > shown.length && (
            <p className="more-note">
              top {TOP_N} of {room.leaderboard.length} — calls you make while this room is on carry its tag.
            </p>
          )}
        </>
      ) : (
        <>
          <Sticker className="stack center" style={{ justifyItems: "center", gap: 8, padding: 14 }}>
            <Mascot mood="idle" size={56} />
            <h2 style={{ fontSize: 20 }}>Play your friends</h2>
            <p className="dim tiny" style={{ maxWidth: 260 }}>
              A squad is a private table. Same rounds, same chips — but now somebody is watching.
            </p>
          </Sticker>

          {loading && <p className="tiny dim center">Looking for that room…</p>}
          {roomId && !loading && !room && (
            <Bubble tone="bad">That room has gone quiet. The link may be dead.</Bubble>
          )}

          <Sticker flat className="stack" style={{ gap: 7 }}>
            <div className="row" style={{ gap: 6 }}>
              <input
                className="field grow"
                placeholder="Squad name"
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
              />
              <Btn tone="gold" disabled={name.trim().length < 2} onClick={() => void create()}>
                Create
              </Btn>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input
                className="field grow"
                placeholder="Or a room code"
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                autoComplete="off"
                spellCheck={false}
              />
              <Btn disabled={code.length < 3} onClick={() => void join(code)}>
                Join
              </Btn>
            </div>
          </Sticker>
        </>
      )}
    </div>
  );
}

/** The leaderboard's own top N, plus your row appended if you fell outside it. */
function topAndYou(rows: RoomMember[], address: string, n: number): RoomMember[] {
  const top = rows.slice(0, n);
  const mine = rows.find((r) => r.address.toLowerCase() === address.toLowerCase());
  if (mine && !top.some((r) => r.address.toLowerCase() === address.toLowerCase())) {
    return [...top, mine];
  }
  return top;
}

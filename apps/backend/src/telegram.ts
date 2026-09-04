// Telegram — the notifier half. Off unless TELEGRAM_BOT_TOKEN is set.
//
// Phase 2 scope: outbound DMs only —
//   • your call settled  → result + streak
//   • a round you follow is about to lock (opt-in)
// Phase 4 adds the command bot (/start deep-link linking, /streak, quick-bet
// buttons). Linking today is done from the web app: it mints a code, the bot's
// deep link hands the code back, the web app calls POST /v1/players/me/telegram.

import { bus } from "./events.js";
import { getPlayer, playersLinkedForRoundAlerts } from "./db.js";
import { env } from "./env.js";

const API = env.telegramBotToken ? `https://api.telegram.org/bot${env.telegramBotToken}` : null;

async function dm(chatId: string, text: string): Promise<void> {
  if (!API) return;
  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.warn(`[telegram] sendMessage ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.warn(`[telegram] dm failed: ${(err as Error).message}`);
  }
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function startTelegramNotifier(): void {
  if (!API) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN unset — notifier off");
    return;
  }
  console.log("[telegram] notifier on");

  bus.onT("call:graded", (p) => {
    const player = getPlayer(p.address);
    if (!player?.tg_chat_id) return;

    const streak =
      p.streakCurrent >= 2 ? `  ·  streak ${p.streakCurrent}${p.streakCurrent === p.streakBest ? " (best!)" : ""}` : "";

    let text: string;
    if (p.result === "won") {
      text = `✅ <b>Called it</b> — ${p.asset} ${p.roundResult}.  +${money(p.payout)}${streak}`;
    } else if (p.result === "lost") {
      text = `❌ Missed — ${p.asset} closed ${p.roundResult}.  Streak reset.`;
    } else {
      text = `⚪️ ${p.asset} round voided — your ${money(p.call.spent)} stake is refundable.`;
    }
    void dm(player.tg_chat_id, text);
  });

  // Opt-in "closing soon" ping. One live 15m + one 1h window per asset, so this
  // is naturally a few pings an hour for people who asked for them.
  const lastPing = new Map<string, number>();
  bus.onT("round:locking", ({ round }) => {
    const key = `${round.asset}:${round.interval_sec}`;
    if (Date.now() - (lastPing.get(key) ?? 0) < round.interval_sec * 500) return;
    lastPing.set(key, Date.now());

    const mins = Math.round(round.interval_sec / 60);
    const url = env.webAppUrl ? `\n${env.webAppUrl}` : "";
    for (const player of playersLinkedForRoundAlerts()) {
      void dm(player.tg_chat_id!, `🟡 ${round.asset} ${mins}m round closes in ~1 min — last call.${url}`);
    }
  });
}

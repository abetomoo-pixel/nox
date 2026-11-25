// ★0211（相談役 11/25 の便 D1・起票157 の続き）: NOX からのメールを送る共通の部品（server 専用）。Resend の API を fetch で呼ぶ。
//   鍵は env の RESEND_API_KEY だけ（コードに書かない・Vercel の Production に Agoora が入れる）。**鍵が無い間は送らずに skipped（no_key）**＝画面のリンクとコピーで動く。
//   送り手 NOX <noreply@noxapp.jp>・reply-to support@noxapp.jp。8 秒の持ち時間（1 回目とやり直しを合わせて）・429／5xx／通信の失敗は 1 回だけやり直す。
//   ログに出すのは HTTP の状態と理由の語だけ（宛先・本文・リンクは出さない）。
export const MAIL_FROM = "NOX <noreply@noxapp.jp>";
export const MAIL_REPLY_TO = "support@noxapp.jp";
export const MAIL_TIMEOUT_MS = 8000;
export type MailResult = { status: "sent" | "skipped" | "failed"; reason?: string; http?: number };
export type MailInput = { to: string; subject: string; text: string; html?: string; idemKey?: string; replyTo?: string };
type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; headers: { get(k: string): string | null } }>;

/** 送る（鍵が無ければ送らない）。fetch と鍵と時計は検査のために差し替えられる */
export async function sendNoxMail(m: MailInput, deps: { fetch?: FetchLike; key?: string | null; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}): Promise<MailResult> {
  const key = deps.key !== undefined ? deps.key : (process.env.RESEND_API_KEY ?? "").trim() || null;
  if (!key) return { status: "skipped", reason: "no_key" };
  const f: FetchLike = deps.fetch ?? ((u, i) => fetch(u, i));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const until = now() + MAIL_TIMEOUT_MS;
  const body = JSON.stringify({ from: MAIL_FROM, to: [m.to], reply_to: m.replyTo ?? MAIL_REPLY_TO, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) });
  let last: MailResult = { status: "failed", reason: "unknown" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = until - now();
    if (left <= 0) return { status: "failed", reason: "timeout" };
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), left);
    try {
      const res = await f("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(m.idemKey ? { "Idempotency-Key": m.idemKey } : {}) }, body, signal: ac.signal });
      if (res.ok) return { status: "sent", http: res.status };
      last = { status: "failed", reason: `http_${res.status}`, http: res.status };
      if (!(res.status === 429 || res.status >= 500)) return last;
      const ra = Number(res.headers.get("retry-after"));
      if (attempt === 0) await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(2000, ra * 1000) : 1000);
    } catch (e) {
      last = { status: "failed", reason: (e as Error)?.name === "AbortError" ? "timeout" : "network" };
      if (attempt === 0 && last.reason === "network") await sleep(1000); else if (last.reason === "timeout") return last;
    } finally { clearTimeout(timer); }
  }
  console.error(`[mail] failed ${last.reason}`); // 宛先・本文は出さない
  return last;
}

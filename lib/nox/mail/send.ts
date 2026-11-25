// ★0212（窓口の段 1・2026-11-25）: NOX のメールを送る最小の部品（サーバ専用）。
//   ★枝 inquiry-1125 の仮の物＝main 側でこれから作る lib/nox/mail/send.ts の sendNoxMail（同じ名前と形）に置き換える。
//   送り方＝Resend の API を fetch・鍵は env の RESEND_API_KEY（コードに書かない）・鍵が無ければ送らずに skipped（no_key）・8 秒で打ち切り・ログに宛先と本文を出さない。
// サーバ専用（route からだけ import する・"use client" の部品から読まない）

export const NOX_MAIL_FROM = "NOX <noreply@noxapp.jp>";
export const NOX_MAIL_TIMEOUT_MS = 8000;
export type NoxMailResult = { status: "sent" | "skipped" | "failed"; reason?: string };

export async function sendNoxMail({ to, subject, text, replyTo }: { to: string; subject: string; text: string; replyTo?: string }): Promise<NoxMailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped", reason: "no_key" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NOX_MAIL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: NOX_MAIL_FROM, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: ac.signal,
    });
    if (res.ok) return { status: "sent" };
    console.error(`nox mail: http ${res.status}`); // 宛先・本文は出さない
    return { status: "failed", reason: `http_${res.status}` };
  } catch (e) {
    const timeout = (e as Error)?.name === "AbortError";
    console.error(`nox mail: ${timeout ? "timeout" : "network"}`);
    return { status: "failed", reason: timeout ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

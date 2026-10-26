// ★便 ON-3（2026-10-26・0176 ★1＝401 LINE）: サーバ専用の LINE 層（route から呼ぶ・ブラウザに出さない）。
//   secrets＝Vault（get_line_secret・service_role）／署名＝x-line-signature（HMAC-SHA256 base64・raw body）／id_token＝https://api.line.me/oauth2/v2.1/verify（client_id＝店の login_channel_id）／
//   session＝admin.auth.admin.generateLink(magiclink)→同じサーバで verifyOtp（demo/enter と同型・メールは送らない）／push＝Messaging API push＋台帳 1 行（line_push_log_write・デモ org は送らず台帳にも書かない）。
//   上限の判定は無い（上限を超えても送る＝429 は failed・429 で台帳に残る＝BANZEN と同じ）。宛先の userId・token は台帳にも console にも出さない。
import { createHmac, timingSafeEqual } from "node:crypto"; // node:crypto＝サーバ専用（ブラウザのバンドルに入れない＝route と server component からだけ import）
import type { SupabaseClient } from "@supabase/supabase-js";
import { linePushKindOfNotif, type LinePushKind, type LineSecretKind } from "./liff-endpoint";

export async function getLineSecret(admin: SupabaseClient, storeId: string, kind: LineSecretKind): Promise<string | null> {
  const { data, error } = await admin.rpc("get_line_secret", { p_store_id: storeId, p_kind: kind });
  if (error) { console.error(`line secret: read failed (${kind})`); return null; }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** Webhook の署名（LINE: channel secret で raw body を HMAC-SHA256 → base64） */
export function lineSignatureOk(channelSecret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** LIFF の id_token を LINE で確かめる（aud＝店のログインチャネル ID）。戻り＝LINE の userId（sub）か null */
export async function verifyLineIdToken(idToken: string, loginChannelId: string): Promise<{ sub: string; name?: string } | null> {
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: loginChannelId }).toString(),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { sub?: string; aud?: string; name?: string; exp?: number };
    if (!j.sub || j.aud !== loginChannelId) return null;
    if (typeof j.exp === "number" && j.exp * 1000 < Date.now()) return null;
    return { sub: j.sub, name: j.name };
  } catch { return null; }
}

/** Auth ユーザーのセッションを同じサーバで作る（magiclink を生成→verifyOtp＝cookie は @supabase/ssr が載せる）。メールは送らない */
export async function createSessionForAuthUser(admin: SupabaseClient, supabase: SupabaseClient, authUserId: string): Promise<boolean> {
  const { data: au, error: eUser } = await admin.auth.admin.getUserById(authUserId);
  const email = au?.user?.email;
  if (eUser || !email) { console.error("line session: user lookup failed"); return false; }
  const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (eLink || !tokenHash) { console.error("line session: link generation failed"); return false; }
  const { error: eOtp } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (eOtp) { console.error("line session: verify failed"); return false; }
  return true;
}

export type PushResult = { ok: boolean; status: number | null; requestId: string | null; skipped?: "demo" | "no_token" };
/** 関所＝push＋台帳 1 行（宛先 1 人）。デモ org は送らず台帳にも書かない（isDemo を呼び出し側が orgs.is_demo で解く）。台帳の失敗は送信の結果を変えない */
export async function pushAndLog(admin: SupabaseClient, p: { storeId: string; isDemo: boolean; lineUserId: string; text: string; kind: LinePushKind }): Promise<PushResult> {
  if (p.isDemo) return { ok: false, status: null, requestId: null, skipped: "demo" };
  const token = await getLineSecret(admin, p.storeId, "access_token");
  if (!token) return { ok: false, status: null, requestId: null, skipped: "no_token" };
  let status: number | null = null, requestId: string | null = null, detail: string | null = null;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: p.lineUserId, messages: [{ type: "text", text: p.text.slice(0, 5000) }] }),
    });
    status = res.status; requestId = res.headers.get("x-line-request-id");
    if (!res.ok) detail = (await res.text().catch(() => "")).slice(0, 300);
  } catch (e) { detail = e instanceof Error ? e.message.slice(0, 300) : "fetch failed"; }
  const ok = status !== null && status >= 200 && status < 300;
  const { error } = await admin.rpc("line_push_log_write", {
    p_store_id: p.storeId, p_kind: p.kind, p_recipient_count: 1, p_status: ok ? "sent" : "failed", p_http_status: status, p_line_request_id: requestId, p_error_detail: ok ? null : detail,
  });
  if (error) console.error(`line push: log failed ${error.message}`);
  return { ok, status, requestId };
}

/** Messaging API の reply（友だち追加・テキストに入口を返す＝無料・台帳に入れない） */
export async function replyLine(accessToken: string, replyToken: string, text: string): Promise<void> {
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
    });
  } catch { /* reply の失敗は無視（Webhook は 200 を返す） */ }
}

/** 紐付いた LINE を引く（subject＝cast／membership）。無ければ null */
export async function lineUserIdOf(admin: SupabaseClient, subjectKind: "cast" | "membership", subjectId: string): Promise<{ lineUserId: string; storeId: string; orgId: string } | null> {
  const { data } = await admin.from("line_links").select("line_user_id, store_id, org_id").eq("subject_kind", subjectKind).eq("subject_id", subjectId).maybeSingle();
  return data ? { lineUserId: data.line_user_id as string, storeId: data.store_id as string, orgId: data.org_id as string } : null;
}
export { linePushKindOfNotif };

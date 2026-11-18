// ★2026-11-18 夜（相談役 ⑤）: LINE のリッチメニューと友だちの確かめ＝サーバー専用（route からだけ import・アクセストークンはブラウザに出さない・ログにも出さない）。
//   作る＝POST /v2/bot/richmenu → 画像（api-data /richmenu/{id}/content）→ 友だち全員の既定（POST /v2/bot/user/all/richmenu/{id}）。どこかで失敗したら作ったメニューを消して理由を返す。
//   外す＝既定を外す（DELETE /v2/bot/user/all/richmenu）→ メニューを消す（DELETE /v2/bot/richmenu/{id}・無ければ 404 で良い）。
//   友だち＝GET /v2/bot/profile/{userId}（友だちでなければ 404）。
import { richMenuBodyOf, type RichMenuReason } from "./richmenu";
import { RICHMENU_PNG_BASE64 } from "./richmenu-image";

const API = "https://api.line.me/v2/bot";
const DATA = "https://api-data.line.me/v2/bot";
type R = { ok: true; id: string } | { ok: false; reason: RichMenuReason; detail: string };
async function call(token: string, url: string, init: RequestInit = {}): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    return { status: res.status, text: (await res.text().catch(() => "")).slice(0, 300) };
  } catch { return null; }
}
const fail = (r: { status: number; text: string } | null): { ok: false; reason: RichMenuReason; detail: string } =>
  r === null ? { ok: false, reason: "network", detail: "" } : { ok: false, reason: "line_http", detail: `${r.status} ${(() => { try { return (JSON.parse(r.text) as { message?: string }).message ?? ""; } catch { return ""; } })()}`.trim() };

export async function richMenuExists(token: string, id: string): Promise<boolean | null> {
  const r = await call(token, `${API}/richmenu/${encodeURIComponent(id)}`);
  return r === null ? null : r.status === 200 ? true : r.status === 404 ? false : null;
}
export async function createDefaultRichMenu(token: string, liffId: string): Promise<R> {
  const c = await call(token, `${API}/richmenu`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(richMenuBodyOf(liffId)) });
  if (!c || c.status !== 200) return fail(c);
  let id = "";
  try { id = String((JSON.parse(c.text) as { richMenuId?: string }).richMenuId ?? ""); } catch { /* noop */ }
  if (!id) return { ok: false, reason: "line_http", detail: "no richMenuId" };
  const img = await call(token, `${DATA}/richmenu/${encodeURIComponent(id)}/content`, { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.from(RICHMENU_PNG_BASE64, "base64") });
  if (!img || img.status !== 200) { await call(token, `${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }); return fail(img); }
  const def = await call(token, `${API}/user/all/richmenu/${encodeURIComponent(id)}`, { method: "POST" });
  if (!def || def.status !== 200) { await call(token, `${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }); return fail(def); }
  return { ok: true, id };
}
export async function removeRichMenu(token: string, id: string | null): Promise<{ ok: true } | { ok: false; reason: RichMenuReason; detail: string }> {
  const d = await call(token, `${API}/user/all/richmenu`, { method: "DELETE" });
  if (!d || (d.status !== 200 && d.status !== 404)) return fail(d);
  if (id) {
    const x = await call(token, `${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!x || (x.status !== 200 && x.status !== 404)) return fail(x);
  }
  return { ok: true };
}
/** 友だちか＝Messaging API のプロフィール（200＝友だち・404＝友だちでない・ほか＝わからない） */
export async function lineFriendOf(token: string, lineUserId: string): Promise<"friend" | "not_friend" | "unknown"> {
  const r = await call(token, `${API}/profile/${encodeURIComponent(lineUserId)}`);
  return r === null ? "unknown" : r.status === 200 ? "friend" : r.status === 404 ? "not_friend" : "unknown";
}

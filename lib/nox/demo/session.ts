// ★裁定328 追補4（便 D2-b・2026-10-08）: デモの「セッション 24 時間」をアプリ側で区切る器（Free プランは refresh token が無期限＝Auth 設定だけでは切れない）。
//   入場 route が httpOnly cookie nox_demo_until（入場時刻＋24h・epoch ms）を置き、middleware が「デモユーザー（env DEMO_USERS の auth user id）かつ cookie が期限切れ／欠落」
//   なら signOut → /demo?expired=1 へ送る。本番ユーザーは DEMO_USERS に無い＝ここを通らない（env が無い環境では誰もデモユーザーにならない）。
//   ★Edge（middleware）から import するため node:fs 等は使わない（seed.ts は fs を使うので分離）。
export const DEMO_UNTIL_COOKIE = "nox_demo_until";
export const DEMO_SESSION_MS = 24 * 60 * 60 * 1000; // 24 時間（328 追補1 ②）
export const DEMO_SESSION_JA = "お試しは 24 時間で終了します。再度入場できます。";
export const DEMO_EXPIRED_JA = "24 時間が経過したためデモを終了しました。下のボタンからもう一度入場できます。";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** env DEMO_USERS（JSON: {"muse:owner":"<auth user id>", …}）。無い・壊れている＝null */
export function parseDemoUsers(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === "string" && UUID_RE.test(v)) out[k] = v;
    return out;
  } catch { return null; }
}

/** auth user id がデモユーザー（DEMO_USERS の値）か。env が無い／壊れている＝false（本番ユーザーを巻き込まない） */
export function isDemoAuthUserId(raw: string | undefined, authUserId: string | null | undefined): boolean {
  if (!authUserId) return false;
  const map = parseDemoUsers(raw);
  if (!map) return false;
  const id = authUserId.toLowerCase();
  return Object.values(map).some((v) => v.toLowerCase() === id);
}

/** cookie に置く値（epoch ms の 10 進文字列）＝入場時刻＋24h */
export function demoUntilValue(nowMs: number): string {
  return String(nowMs + DEMO_SESSION_MS);
}

/** cookie が無い・数値でない・未来でない（≦now）＝期限切れ。上限超（24h より先）も不正として期限切れ扱い */
export function demoSessionExpired(cookieValue: string | undefined | null, nowMs: number): boolean {
  if (!cookieValue || !/^\d{10,16}$/.test(cookieValue)) return true;
  const until = Number(cookieValue);
  if (!Number.isFinite(until) || until <= nowMs) return true;
  if (until > nowMs + DEMO_SESSION_MS) return true;
  return false;
}

/** cookie の属性（httpOnly・Secure（https のとき）・SameSite=Lax・path=/・24h） */
export function demoUntilCookieOptions(secure: boolean): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number } {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(DEMO_SESSION_MS / 1000) };
}

/** middleware が期限判定を行わないパス（入場 route 自身・入口ページ・静的） */
export function isDemoSessionExemptPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/api/demo/") || pathname.startsWith("/auth/");
}

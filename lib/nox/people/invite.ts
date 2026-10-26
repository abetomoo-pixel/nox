// ★便 ON-3（2026-10-26・0176 ★2＝399 の残り I-1）: スタッフの「登録→招待の 2 段」の純関数（DB を知らない・ブラウザでも使う）。
//   登録＝staff_invite_create（Auth を作らない・staff_invites 1 行・平文トークンは 1 回だけ返る）→ 招待リンク <site>/i/<token> を本人へ →
//   受諾＝/i/[token]（公開面）で本人がパスワードを決める → POST /api/staff/invite/accept（service_role＝Auth を作って staff_invite_accept）→ そのままログイン。
//   既存の「初期パスワードを発行（今すぐ）」（POST /api/staff/create）は残す＝モーダルの「ログインの方法」で選ぶ（招待はメール必須）。
export const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/; // gen_random_uuid 2 本の 16 進（0176 staff_invite_create）
export const INVITE_DAYS = 14;
export const INVITE_PATH_PREFIX = "/i/";

/** 招待リンク（site は末尾の / を落とす） */
export const inviteUrlOf = (site: string, token: string): string => `${site.replace(/\/+$/, "")}${INVITE_PATH_PREFIX}${token}`;

export type InviteState = "ok" | "accepted" | "expired";
export const INVITE_STATE_LABEL: Record<InviteState, string> = { ok: "招待中", accepted: "受諾済み", expired: "期限切れ" };
export function inviteStateOf(row: { accepted_at: string | null; expires_at: string }, nowMs: number): InviteState {
  if (row.accepted_at) return "accepted";
  return new Date(row.expires_at).getTime() < nowMs ? "expired" : "ok";
}
/** '11/9 まで'（JST の日付） */
export function inviteExpiryTextOf(expiresAt: string): string {
  const d = new Date(new Date(expiresAt).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} まで`;
}

export type LoginMethod = "password" | "invite";
export const LOGIN_METHOD_OPTIONS = [["password", "初期パスワードを発行（今すぐ使える）"], ["invite", "招待リンク（本人がパスワードを決める）"]] as const;
export const LOGIN_METHOD_NOTE: Record<LoginMethod, string> = {
  password: "ログインIDと初期パスワードを登録直後に 1 回だけ表示します（メール未入力なら ID を自動発行）。",
  invite: `メールアドレス宛の招待リンク（${INVITE_DAYS} 日有効）を表示します。本人がリンクを開いてパスワードを決めるとログインできます（それまで Auth は作りません）。`,
};
/** 登録モーダルの入力検査（route／RPC と同じ上限） */
export function inviteFormErrorOf(f: { name: string; email: string; method: LoginMethod }): string | null {
  if (!f.name.trim()) return "名前を入力してください";
  if (f.name.trim().length > 50) return "名前は 50 文字までです";
  if (f.method === "invite") {
    const e = f.email.trim().toLowerCase();
    if (!e) return "招待リンクにはメールアドレスが必要です";
    if (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return "メールアドレスの形式を確認してください";
  }
  return null;
}

export const INVITE_PASSWORD_MIN = 8;
/** 受諾面のパスワード検査（8 文字以上・2 回一致） */
export function invitePasswordErrorOf(pw: string, pw2: string): string | null {
  if (pw.length < INVITE_PASSWORD_MIN) return `パスワードは ${INVITE_PASSWORD_MIN} 文字以上にしてください`;
  if (pw.length > 72) return "パスワードは 72 文字までです";
  if (pw !== pw2) return "確認用のパスワードが一致しません";
  return null;
}
/** 受諾面の見出し */
export const INVITE_ACCEPT_TITLE = "スタッフ登録の招待";
export const INVITE_NOT_FOUND = "この招待は見つからないか、期限切れです。お店に再発行を依頼してください。";
export const INVITE_ACCEPTED_NOTE = "この招待はすでに使われています。ログイン画面からお入りください。";
/** RPC／route のエラー語→日本語（staff_invite_create） */
export function inviteErrJa(msg: string): string {
  if (/email in use/.test(msg)) return "このメールアドレスは登録済みです（既存のスタッフは再配属から）";
  if (/invite exists/.test(msg)) return "このメールアドレスには有効な招待があります（一覧の「招待中」から再表示できます）";
  if (/bad email/.test(msg)) return "メールアドレスの形式を確認してください";
  if (/bad role/.test(msg)) return "役職が正しくありません";
  if (/billing locked/.test(msg)) return "現在このお店では操作できません（ご契約をご確認ください）";
  if (/forbidden/.test(msg)) return "権限がありません";
  if (/bad token/.test(msg)) return INVITE_NOT_FOUND;
  if (/user exists/.test(msg)) return "このログインはすでに登録されています";
  return msg;
}

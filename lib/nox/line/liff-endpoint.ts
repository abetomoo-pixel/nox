// ★便 ON-3（2026-10-26・0176 ★1＝401 LINE 連携と送信数・BZ-R）: LINE の入口 URL・設定キー・上限の段・状態の純関数（DB を知らない・ブラウザでも使う）。
//   店ごとにチャネル 2 つ（Messaging API＋LINE ログイン）・LIFF のエンドポイント＝<site>/liff/<storeId>・Webhook＝<site>/api/line/webhook/<storeId>。
//   公開値（stores.line_config）＝login_channel_id／liff_id／bot_destination（set_store_line_config）。シークレット（channel_secret／access_token）は Vault（POST /api/line/secret→set_line_secret）。
export const LINE_CONFIG_KEYS = ["login_channel_id", "liff_id", "bot_destination"] as const;
export type LineConfigKey = (typeof LINE_CONFIG_KEYS)[number];
export const LINE_CONFIG_LABEL: Record<LineConfigKey, string> = { login_channel_id: "LINE ログイン チャネル ID", liff_id: "LIFF ID", bot_destination: "bot の destination（任意）" };
export const LINE_SECRET_KINDS = ["channel_secret", "access_token"] as const;
export type LineSecretKind = (typeof LINE_SECRET_KINDS)[number];
export const LINE_SECRET_LABEL: Record<LineSecretKind, string> = { channel_secret: "チャネルシークレット（Messaging API）", access_token: "チャネルアクセストークン（長期・Messaging API）" };
export const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/;
export type LineConfig = { login_channel_id?: string | null; liff_id?: string | null; bot_destination?: string | null; channel_secret_ref?: string | null; access_token_ref?: string | null };

const site = (s: string) => s.replace(/\/+$/, "");
export const liffEntryUrlOf = (siteUrl: string, storeId: string): string => `${site(siteUrl)}/liff/${storeId}`;
/** 紐付け（bind）の入口＝入口 URL ＋ ?t=<平文トークン>&m=bind（1 回だけ・7 日） */
export const liffBindUrlOf = (siteUrl: string, storeId: string, token: string): string => `${liffEntryUrlOf(siteUrl, storeId)}?t=${encodeURIComponent(token)}&m=bind`;
export const webhookUrlOf = (siteUrl: string, storeId: string): string => `${site(siteUrl)}/api/line/webhook/${storeId}`;

/** 公開値の検査（RPC と同じ: 100 字・bot_destination は 'U'＋32 桁の 16 進） */
export function lineConfigErrorOf(patch: Partial<Record<LineConfigKey, string>>): string | null {
  for (const k of LINE_CONFIG_KEYS) {
    const v = (patch[k] ?? "").trim();
    if (v.length > 100) return `${LINE_CONFIG_LABEL[k]}は 100 文字までです`;
    if (k === "bot_destination" && v && !LINE_USER_ID_RE.test(v)) return "destination は U で始まる 33 文字（16 進）です";
  }
  return null;
}
/** 変わった鍵だけの patch（空＝null）。変更なし＝null */
export function lineConfigPatchOf(form: Record<LineConfigKey, string>, cur: LineConfig | null | undefined): Record<string, string | null> | null {
  const out: Record<string, string | null> = {};
  for (const k of LINE_CONFIG_KEYS) { const v = form[k].trim() || null; if (v !== ((cur?.[k] ?? null) || null)) out[k] = v; }
  return Object.keys(out).length === 0 ? null : out;
}
/** 設定済み＝アクセストークンが Vault にある（BANZEN line-push-status と同じ判定） */
export const lineConfiguredOf = (cfg: LineConfig | null | undefined): boolean => !!cfg?.access_token_ref;
/** ログイン可＝ログインチャネル ID と LIFF ID が揃っている */
export const lineLoginReadyOf = (cfg: LineConfig | null | undefined): boolean => !!cfg?.login_channel_id && !!cfg?.liff_id;

export const LINE_PLAN_TIERS = [200, 5000, 30000] as const;
export const LINE_LIMIT_DEFAULT = 200;
export const lineLimitLabelOf = (n: number): string => (n === 200 ? "200 通（無料）" : n === 5000 ? "5,000 通（ライト）" : n === 30000 ? "30,000 通（スタンダード）" : `${n.toLocaleString()} 通`);
export function lineLimitErrorOf(n: number): string | null { return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? null : "上限は 1〜1,000,000 の整数です"; }
/** − ／ ＋ で 1 段ずつ（段の外は最寄りの段へ） */
export function lineLimitStepOf(cur: number, dir: -1 | 1): number {
  const i = LINE_PLAN_TIERS.findIndex((t) => t === cur);
  if (i >= 0) return LINE_PLAN_TIERS[Math.min(LINE_PLAN_TIERS.length - 1, Math.max(0, i + dir))];
  const above = LINE_PLAN_TIERS.find((t) => t > cur);
  const below = [...LINE_PLAN_TIERS].reverse().find((t) => t < cur);
  return dir === 1 ? (above ?? cur) : (below ?? cur);
}
export const LINE_LIMIT_NOTE = "上限を超えそうでも、アプリから通知を止めることはありません（LINE 側が 429 を返した分は台帳に残ります）。";
export const LINE_SECRET_PLACEHOLDER = "変更時のみ入力";
export const LINE_BIND_NOTE = "このリンクを本人の LINE へ送ってください（7 日有効・1 回だけ）。開くと LINE でログインし、この人として紐付きます。";
/** 台帳の kind＝0176 の CHECK（line_push_log.kind）と 1 字一致（4 つ）。キャスト通知は shift_*→shift_changed／それ以外→notice に写す */
export const LINE_PUSH_KINDS = ["shift_published", "shift_changed", "punch_unclosed", "notice"] as const;
export type LinePushKind = (typeof LINE_PUSH_KINDS)[number];
export const linePushKindOfNotif = (kind: string): LinePushKind => (kind.startsWith("shift_") ? "shift_changed" : "notice");

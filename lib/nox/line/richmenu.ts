// ★2026-11-18 夜（相談役 ⑤・0201q の後）: LINE のリッチメニューと友だち追加の必須（純関数・ブラウザとサーバーの両方から使う）。
//   リッチメニュー＝LINE の設定を保存したとき（LIFF ID かアクセストークンを入れた保存）に NOX から自動で登録（友だち全員の既定のメニュー）・「作り直す」「外す」。
//   ボタン 3 つ＝ホーム／シフト／お知らせ（LIFF の入口の ?to=home／shift／notices＝裁定500-6 の許可表）。ID は set_store_line_extra で stores.line_config に。
//   友だち追加の必須＝店に公式アカウントの ID（bot_basic_id）があるときだけ（LIFF の getFriendship と、紐付けの route で Messaging API のプロフィール）。
import { RICHMENU_IMAGE_SIZE } from "./richmenu-image";

/** 公式アカウントの ID（ベーシック ID）＝'@'＋小文字の英数と . _ -（set_store_line_extra の検査と同じ） */
export const BOT_BASIC_ID_RE = /^@[0-9a-z._-]{1,40}$/;
export const RICHMENU_ID_RE = /^richmenu-[0-9a-f]{32}$/;
export const botBasicIdNormOf = (v: string): string => v.trim().toLowerCase();
export function botBasicIdErrorOf(v: string): string | null {
  const n = botBasicIdNormOf(v);
  return !n || BOT_BASIC_ID_RE.test(n) ? null : "公式アカウントの ID は @ で始まる英数字です（例 @123abcde）";
}
/** 友だち追加の URL（LINE の公式の形＝@ は %40） */
export const friendAddUrlOf = (botBasicId: string): string => `https://line.me/R/ti/p/${encodeURIComponent(botBasicId)}`;
/** 友だち追加を必須にするか＝店に公式アカウントの ID があるときだけ（無い店は今までどおり＝案内の URL が作れない） */
export const friendRequiredOf = (cfg: { bot_basic_id?: string | null } | null | undefined): boolean => !!cfg?.bot_basic_id && BOT_BASIC_ID_RE.test(cfg.bot_basic_id);
export const FRIEND_REQUIRED_TEXT = "先にお店の公式アカウントを友だちに追加してください。追加したら、この画面をもう一度開いてください。";
export const BOT_BASIC_ID_NOTE = "入れると、LINE の連携は公式アカウントを友だちに追加した人だけになります（追加の案内を出します）。空のままなら今までどおりです。";

export const RICHMENU_AREAS = [
  { to: "home", label: "ホーム" },
  { to: "shift", label: "シフト" },
  { to: "notices", label: "お知らせ" },
] as const;
/** Messaging API の rich menu object（2500×843・3 等分・ボタンは LIFF の URL＋?to=） */
export function richMenuBodyOf(liffId: string): Record<string, unknown> {
  const { width: W, height: H } = RICHMENU_IMAGE_SIZE;
  const xs = [0, Math.round(W / 3), Math.round((2 * W) / 3), W];
  return {
    size: { width: W, height: H },
    selected: true,
    name: "NOX メニュー",
    chatBarText: "メニュー",
    areas: RICHMENU_AREAS.map((a, i) => ({
      bounds: { x: xs[i], y: 0, width: xs[i + 1] - xs[i], height: H },
      action: { type: "uri", label: a.label, uri: `https://liff.line.me/${liffId}?to=${a.to}` },
    })),
  };
}
export const RICHMENU_ACTIONS = ["ensure", "rebuild", "remove"] as const;
export type RichMenuAction = (typeof RICHMENU_ACTIONS)[number];
export type RichMenuReason = "no_token" | "no_liff" | "line_http" | "network" | "save_failed" | "not_found";
export const RICHMENU_REASON_JA: Record<RichMenuReason, string> = {
  no_token: "チャネルアクセストークンが未設定です",
  no_liff: "LIFF ID が未設定です",
  line_http: "LINE が受け付けませんでした",
  network: "LINE に接続できませんでした",
  save_failed: "メニューの ID を保存できませんでした",
  not_found: "LINE の側にメニューがありません",
};
export const richMenuStateOf = (cfg: { richmenu_id_default?: string | null } | null | undefined): "on" | "off" => (cfg?.richmenu_id_default && RICHMENU_ID_RE.test(cfg.richmenu_id_default) ? "on" : "off");
export const RICHMENU_STATE_JA = { on: "使う（友だち全員）", off: "使わない" } as const;
/** 結果の 1 行（設定の保存とは別の行＝メニューの失敗で保存は止めない） */
export function richMenuResultTextOf(r: { ok: boolean; status?: string; reason?: string; detail?: string }): string {
  if (r.ok) return r.status === "exists" ? "リッチメニュー：登録済みです" : r.status === "removed" ? "リッチメニューを外しました" : "リッチメニューを登録しました（友だち全員）";
  const why = RICHMENU_REASON_JA[r.reason as RichMenuReason] ?? r.reason ?? "不明";
  return `リッチメニューを登録できませんでした（${why}${r.detail ? `：${r.detail}` : ""}）。設定の保存は済んでいます`;
}
/** 自動で登録するのは LIFF ID かアクセストークンを入れた保存のときだけ（「外す」の後に毎回付け直さない） */
export const richMenuAutoOf = (liffChanged: boolean, tokenEntered: boolean): boolean => liffChanged || tokenEntered;

// ★M-114（2026-11-06・便 F・裁定459）: LINE 通知の種類ごとの ON／OFF（純関数・DB を知らない・ブラウザでも使う）。
//   既定＝お知らせの「LINE で送る」だけ ON・シフト系（公開・追加／外し・時間変更・送り返し・基本の働き方の変更・催促）は既定 OFF。
//   設定の置き場＝stores.settings_json.line_notify（{ shift_published, shift_changed, remind, notice }＝boolean）。
//   ★キーが set_store_profile の白名単に無い間（0198 候補）は保存できない＝client は「既定値で OFF」として動く（既存 org＝CLUB NOX・デモ 6 店も OFF）。
export const LINE_NOTIFY_KINDS = ["notice", "shift_published", "shift_changed", "remind"] as const;
export type LineNotifyKind = (typeof LINE_NOTIFY_KINDS)[number];
export const LINE_NOTIFY_LABEL: Record<LineNotifyKind, string> = {
  notice: "お知らせ（「LINE で送る」にチェックしたとき）",
  shift_published: "シフトの公開（期間の確定）",
  shift_changed: "シフトの変更（追加／外し／時間変更・送り返し・基本の働き方の変更）",
  remind: "シフト希望の催促",
};
export const LINE_NOTIFY_DEFAULT: Record<LineNotifyKind, boolean> = { notice: true, shift_published: false, shift_changed: false, remind: false };
export const LINE_NOTIFY_KEY = "line_notify";
export const LINE_NOTIFY_COUNT_NOTE = "1 回の送信＝友だち（連携している人）の数ぶん数えられます。無料枠は月 200 通。";
export const LINE_PLAN_UPGRADE_NOTE = "無料枠を超えて送る店は、LINE 側でライトプラン（5,000 通／月・5,000 円＋税）へ。";
export const LINE_NOTIFY_SAVE_PENDING_NOTE = "種類ごとの保存は次の DB 更新（0198）の後に使えます。それまでは既定（お知らせだけ ON）で動きます。";

/** 店の設定から種類ごとの ON／OFF（キーが無い・型が違う＝既定） */
export function lineNotifyOf(settings: Record<string, unknown> | null | undefined): Record<LineNotifyKind, boolean> {
  const raw = settings && typeof settings === "object" ? (settings as Record<string, unknown>)[LINE_NOTIFY_KEY] : null;
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...LINE_NOTIFY_DEFAULT };
  for (const k of LINE_NOTIFY_KINDS) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}
export const lineNotifyOnOf = (settings: Record<string, unknown> | null | undefined, kind: LineNotifyKind): boolean => lineNotifyOf(settings)[kind];

/** 通知の kind（cast_notifications の kind・LINE 台帳の kind）→ 設定の種類。公開＝shift_published・shift_* ＝shift_changed・催促（other＋remind の印）＝remind・それ以外＝notice */
export function lineNotifyKindOfNotif(kind: string, opts?: { remind?: boolean }): LineNotifyKind {
  if (opts?.remind) return "remind";
  if (kind === "shift_published") return "shift_published";
  if (kind.startsWith("shift_") || kind === "availability_changed") return "shift_changed";
  return "notice";
}

/** お知らせの「LINE で送る」の確認文＝○人に送ります・今月の残り ○通。不足なら送らない（null＝送れる） */
export function noticeLineConfirmOf(input: { recipients: number; sent: number; limit: number }): { text: string; blocked: boolean } {
  const remain = Math.max(0, input.limit - input.sent);
  const blocked = input.recipients > remain;
  const text = blocked
    ? `LINE の今月の残りは ${remain.toLocaleString()} 通で、${input.recipients.toLocaleString()} 人には足りません。LINE では送らずに掲載だけします。`
    : `${input.recipients.toLocaleString()} 人に LINE で送ります（今月の残り ${remain.toLocaleString()} 通・送信後 ${(remain - input.recipients).toLocaleString()} 通）。`;
  return { text, blocked };
}

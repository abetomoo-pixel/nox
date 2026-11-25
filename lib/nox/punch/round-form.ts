// ★起票159（相談役 11/24 夜の決め＝店舗設定に「勤務時間の丸め」の欄と同意を足す・同意は店ごと＝C-1・文は BANZEN・版 v1）。
//   保存は set_store_profile の 3 キー（punch_round_unit・punch_round_mode・punch_round_consent_version）＝DB 変更 0（0175 の器）。
//   DB の線：単位 1／5／10／15／30・方向 staff_favor／store_favor／nearest・変えるときに単位が 1 より大きいと同意の版が要る（'consent required'）。
//   丸め 1 分（丸めない）へ戻すときは同意も版も要らない。DB を知らない純関数。
import { PUNCH_ROUND_CONSENT_VERSION } from "../setup/v5";

export const PUNCH_ROUND_UNITS = [1, 5, 10, 15, 30] as const;
export type PunchRoundUnit = (typeof PUNCH_ROUND_UNITS)[number];
export type PunchRoundMode = "staff_favor" | "store_favor" | "nearest";
export const PUNCH_ROUND_UNIT_OPTIONS = PUNCH_ROUND_UNITS.map((u) => [String(u), u === 1 ? "丸めない" : `${u} 分`] as const);
export const PUNCH_ROUND_MODE_OPTIONS = [
  ["staff_favor", "働く人に有利"],
  ["nearest", "四捨五入"],
  ["store_favor", "店に有利"],
] as const;
export const PUNCH_ROUND_MODE_NOTE: Record<PunchRoundMode, string> = {
  staff_favor: "出勤は切り下げ・退勤は切り上げ（勤務時間が短くならない）",
  nearest: "出勤も退勤も近いほうへ",
  store_favor: "出勤は切り上げ・退勤は切り下げ（勤務時間が短くなることがある）",
};
export type PunchRoundForm = { unit: number; mode: PunchRoundMode };

/** 保存できるか（null＝できる）。consent＝同意のチェック */
export function punchRoundErrOf(cur: PunchRoundForm, f: PunchRoundForm, consent: boolean): string | null {
  if (!(PUNCH_ROUND_UNITS as readonly number[]).includes(f.unit)) return "丸めの単位を選んでください";
  if (!PUNCH_ROUND_MODE_OPTIONS.some(([v]) => v === f.mode)) return "丸めの向きを選んでください";
  if (f.unit === cur.unit && f.mode === cur.mode) return "変更がありません";
  if (f.unit > 1 && !consent) return "丸めを使うには、下の同意にチェックしてください";
  return null;
}

/** set_store_profile の patch（変えたときだけ呼ぶ）。丸めない（1 分）は版を送らない */
export function punchRoundPatchOf(f: PunchRoundForm, consent: boolean): Record<string, unknown> {
  return { punch_round_unit: f.unit, punch_round_mode: f.mode, ...(f.unit > 1 && consent ? { punch_round_consent_version: PUNCH_ROUND_CONSENT_VERSION } : {}) };
}

/** 一覧の 1 行（今の設定） */
export const punchRoundLineOf = (f: PunchRoundForm): string => (f.unit <= 1 ? "丸めない（1 分）" : `${f.unit} 分・${PUNCH_ROUND_MODE_OPTIONS.find(([v]) => v === f.mode)?.[1] ?? f.mode}`);

/** RPC の英語の理由 → 日本語 */
export function punchRoundErrJa(m: string): string {
  if (m.includes("consent required")) return "丸めを使うには、オーナーが同意にチェックしてください";
  if (m.includes("consent outdated")) return "同意の文が新しくなりました。もう一度同意にチェックしてください"; // ★0213: 版が上がった（今の丸めは止めない・次の保存でチェック）
  if (m.includes("not found")) return "店が見つかりません";
  if (m.includes("forbidden")) return "この設定はオーナーだけが変更できます";
  if (m.includes("billing locked")) return "ご契約の状態により保存できません";
  if (m.includes("bad punch_round")) return "丸めの単位か向きが正しくありません";
  return "保存できませんでした";
}

// ★0213（相談役 11/25 の D4）: set_punch_round（オーナーだけ・変えた営業日から効く）の引数・保存の文・履歴の 1 行・注記
export const punchRoundArgsOf = (storeId: string, f: PunchRoundForm, consent: boolean): { p_store_id: string; p_unit: number; p_mode: PunchRoundMode; p_consent_version: string | null } =>
  ({ p_store_id: storeId, p_unit: f.unit, p_mode: f.mode, p_consent_version: f.unit > 1 && consent ? PUNCH_ROUND_CONSENT_VERSION : null });
const mdOf = (ymd: string): string => `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
export const punchRoundSavedMsgOf = (f: PunchRoundForm, r: { effective_from?: string } | null): string =>
  `勤務時間の丸めを「${punchRoundLineOf(f)}」にしました${r?.effective_from ? `（${mdOf(r.effective_from)}の営業日から）` : ""}`;
export const punchRoundHistoryLineOf = (h: { effective_from: string; unit: number; mode: PunchRoundMode }): string => `${mdOf(h.effective_from)}から ${punchRoundLineOf(h)}`;
export const PUNCH_ROUND_EFFECT_NOTE = "変えた日の営業日から効きます。それより前の日は前の丸めのまま・確定済みの給与は変わりません。同じ日のうちに直したときは、その日の設定を上書きします。";
export const PUNCH_ROUND_NOT_APPLIED_NOTE = "この店は勤務時間を確定シフトで決めている（または打刻しない）ので、丸めは効きません。";

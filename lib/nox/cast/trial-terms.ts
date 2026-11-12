// ★0201c（裁定480・484・2026-11-12）: 体験入店の条件＝店の既定（settings_json の trial_wage・trial_back・既存の trial_guarantee_days）と
//   キャストごとの上書き（casts.trial_wage・trial_days・trial_started_on＝null は店の既定）・本採用／見送り（cast_trial_decide）。純関数（DB を知らない）。
//   ここは条件の記録と表示だけ＝体入の時給を給与に当てる式は入れない（お金の式は変えない）。
import { TRIAL_GUARANTEE_DAYS_DEFAULT } from "./trial-flow";
import { mig0201cOn } from "@/lib/nox/rules-0175/flag";

export const SET_CAST_TRIAL_RPC = "set_cast_trial";
export const TRIAL_DECIDE_RPC = "cast_trial_decide";
export type TrialBack = "same" | "none";
export const TRIAL_BACK_OPTIONS: ReadonlyArray<readonly [TrialBack, string]> = [["same", "本採用と同じ"], ["none", "なし"]];
export const TRIAL_WAGE_MAX = 100000;

/** 店の既定（欠損＝時給 未設定・バック 本採用と同じ・日数 3） */
export function trialStoreTermsOf(sj: Record<string, unknown> | null | undefined): { wage: number | null; back: TrialBack; days: number } {
  const w = sj?.trial_wage;
  const d = sj?.trial_guarantee_days;
  return {
    wage: typeof w === "number" && Number.isInteger(w) && w >= 0 && w <= TRIAL_WAGE_MAX ? w : null,
    back: sj?.trial_back === "none" ? "none" : "same",
    days: typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 90 ? d : TRIAL_GUARANTEE_DAYS_DEFAULT,
  };
}

/** 店設定の patch（変更分だけ）。wage は空欄なら送らない（白名単は整数 0〜100000）。不正は err */
export function trialStorePatchOf(form: { wage: string; back: TrialBack; days: string }, cur: { wage: number | null; back: TrialBack; days: number }):
  { ok: true; patch: Record<string, unknown> } | { ok: false; err: string } {
  const patch: Record<string, unknown> = {};
  const w = form.wage.trim();
  if (w !== "") {
    const n = Number(w);
    if (!Number.isInteger(n) || n < 0 || n > TRIAL_WAGE_MAX) return { ok: false, err: "体入の時給は 0〜100,000 円の整数で入力してください" };
    if (n !== cur.wage) patch.trial_wage = n;
  }
  const d = Number(form.days.trim());
  if (!Number.isInteger(d) || d < 1 || d > 90) return { ok: false, err: "体入の日数は 1〜90 日で入力してください" };
  if (d !== cur.days) patch.trial_guarantee_days = d;
  if (form.back !== cur.back) patch.trial_back = form.back;
  return { ok: true, patch };
}

/** set_cast_trial の引数（空欄＝null＝店の既定） */
export function trialCastArgsOf(castId: string, form: { wage: string; days: string; startedOn: string }):
  { ok: true; args: { p_cast_id: string; p_wage: number | null; p_days: number | null; p_started_on: string | null } } | { ok: false; err: string } {
  const w = form.wage.trim(), d = form.days.trim(), s = form.startedOn.trim();
  const wage = w === "" ? null : Number(w);
  if (wage !== null && (!Number.isInteger(wage) || wage < 0 || wage > TRIAL_WAGE_MAX)) return { ok: false, err: "体入の時給は 0〜100,000 円の整数で入力してください" };
  const days = d === "" ? null : Number(d);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 90)) return { ok: false, err: "体入の日数は 1〜90 日で入力してください" };
  if (s !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, err: "開始日が正しくありません" };
  return { ok: true, args: { p_cast_id: castId, p_wage: wage, p_days: days, p_started_on: s === "" ? null : s } };
}

/** cast_trial_decide の引数（本採用＝プラン・見送り＝プランなし）。p_from＝今日（保証時給の期間中の本採用は RPC が保証の翌日から＝裁定484） */
export function trialDecideArgsOf(castId: string, decision: "hire" | "decline", planId: string | null, today: string): { p_cast_id: string; p_decision: "hire" | "decline"; p_plan_id: string | null; p_from: string } {
  return { p_cast_id: castId, p_decision: decision, p_plan_id: decision === "hire" ? planId : null, p_from: today };
}

/** キャストの一覧に足す列（体入の個人の上書き 3 列） */
export function trialCastColsOf(): string {
  return mig0201cOn() ? ", trial_wage, trial_days, trial_started_on" : "";
}

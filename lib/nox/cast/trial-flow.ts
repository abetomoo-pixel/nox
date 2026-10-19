// ★便 GV-C C-14f（GV-65・裁定396）: 体入の一括操作（client の順呼び＝新 RPC なし）の純関数。
//   「体入を追加」＝cast_create（在籍区分 体入）→ set_cast_plan（体験入店）→ set_cast_guarantee（店設定の既定日数・金額＝体験入店プランの基本時給）。
//   本採用＝set_cast_plan（店の既定プラン default_plan_id・確認なし・audit は RPC 側）。
//   ★在籍区分（casts.kind）を書く RPC が無い（cast_create のみ）＝本採用で kind は「体入」のまま＝0175 待ち。
//     そのため体入タブは「在籍区分 体入 かつ 今のプランが体験入店（またはプランなし）」で絞る（仮決め・本採用したキャストは体入タブから外れる）。
import { addDays } from "@/lib/nox/cast/guarantee";

export const TRIAL_KIND = "体入";
export const TRIAL_PLAN_NAME = "体験入店";
export const TRIAL_GUARANTEE_DAYS_DEFAULT = 3;

/** 店設定（0173 ★7）: trial_guarantee_days 整数 1〜90（既定 3）／default_plan_id（null 可） */
export function trialSettingsOf(sj: Record<string, unknown> | null | undefined): { days: number; defaultPlanId: string | null } {
  const d = sj?.trial_guarantee_days;
  const days = typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 90 ? d : TRIAL_GUARANTEE_DAYS_DEFAULT;
  const p = sj?.default_plan_id;
  return { days, defaultPlanId: typeof p === "string" && p ? p : null };
}

/** 体入タブに出すか（在籍・区分 体入・今のプランが体験入店またはプランなし） */
export function isTrialCastOf(c: { is_active: boolean; kind?: string | null }, planName: string | null): boolean {
  return c.is_active && c.kind === TRIAL_KIND && (planName === null || planName === TRIAL_PLAN_NAME);
}

/** 期限付き保証の期間＝開始日から days 日（両端含む） */
export function trialGuaranteeRangeOf(start: string, days: number): { start: string; end: string } {
  return { start, end: addDays(start, Math.max(1, days) - 1) };
}

/** 在籍キャスト（区分が体入でない）に体験入店プランを割り当てようとしたときの警告。該当しなければ null */
export function trialPlanWarnOf(castKind: string | null | undefined, planName: string | null | undefined): string | null {
  if (planName !== TRIAL_PLAN_NAME) return null;
  if (castKind === TRIAL_KIND) return null;
  return "在籍キャストに「体験入店」プランを割り当てようとしています（体入の方は「体入」タブの「体入を追加」から登録してください）";
}

/** 体入カードの保証の残日数チップ（今日を含む保証行が無ければ null） */
export function trialDaysLeftChipOf(daysLeft: number | null): string | null {
  if (daysLeft === null || daysLeft < 0) return null;
  return daysLeft === 0 ? "保証 今日まで" : `保証 あと${daysLeft}日`;
}

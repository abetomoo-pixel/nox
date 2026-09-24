// ★便 AU2（2026-09-24・週末バックログ 2）: 計画期間（shift_periods.status）の進行段＝純関数（DB を知らない）。
//   status の実値＝draft／open／closed／published（0101 の CHECK・遷移は shift_period_set の p_status＝自由・planbar は draft⇄published の 2 ボタン）。
//   語は 4 語固定（裁定274 の 3 タブ語「今日／作る／確定」と衝突しない）: 作成中／募集中／仮シフト調整／公開済み。
import { mdOf } from "./period";

export const PERIOD_STAGES = ["draft", "open", "closed", "published"] as const;
export type PeriodStatus = (typeof PERIOD_STAGES)[number];
export const PERIOD_STAGE_LABEL: Record<PeriodStatus, string> = { draft: "作成中", open: "募集中", closed: "仮シフト調整", published: "公開済み" };

/** status → 進行段の語（未知の値は「作成中」＝最初の段に倒す） */
export function periodStageOf(status: string | null | undefined): string {
  return PERIOD_STAGE_LABEL[(status ?? "draft") as PeriodStatus] ?? PERIOD_STAGE_LABEL.draft;
}
/** status → 段の番号 0〜3（未知は 0） */
export function stageIndexOf(status: string | null | undefined): number {
  const i = PERIOD_STAGES.indexOf((status ?? "draft") as PeriodStatus);
  return i < 0 ? 0 : i;
}

export type PeriodLike = { id: string; start_date: string; end_date: string; wish_deadline: string | null; status: string };

/** 帯の文字列「M/D〜M/D・締切 M/D」（締切なしは「締切 —」） */
export function periodBandText(p: PeriodLike): string {
  return `${mdOf(p.start_date)}〜${mdOf(p.end_date)}・締切 ${p.wish_deadline ? mdOf(p.wish_deadline) : "—"}`;
}

/** 日付を含む期間の番号（periods の並び順・両端含む）。無ければ -1 */
export function periodIndexOfDate(periods: readonly PeriodLike[], ymd: string): number {
  return periods.findIndex((p) => p.start_date <= ymd && ymd <= p.end_date);
}

/** 期間ごとのセル背景（既存トークンのみ・4 色を循環・新トークン 0） */
export const PERIOD_TONES = ["var(--goldface2)", "var(--primary-soft)", "var(--warning-soft)", "var(--card2)"] as const;
export const periodToneOf = (index: number): string | null => (index < 0 ? null : PERIOD_TONES[index % PERIOD_TONES.length]);

/** 確定シフトの「未確定」印: その日を含む期間があり、かつ公開済みでないとき true（期間の無い日は印なし＝表示を変えない側） */
export function isUnpublishedDay(periods: readonly PeriodLike[], ymd: string): boolean {
  const i = periodIndexOfDate(periods, ymd);
  return i >= 0 && periods[i].status !== "published";
}

// ★M-149（2026-11-10 相談役＝外部レビュー）: シフトの状態を 1 枚の手順図「希望の受付 → 確認 → 確定 → 本人へ公開」に（DB を知らない純関数）。
//   各一覧の状態の名前（希望＝審査中／採用・確認待ち／採用・確定／見送り・期間＝作成中／募集中／配置中／公開済み・シフト＝planned／proposed／confirmed）を
//   この 4 段のどれかに対応させる。実装に無い機能（自動配置など）は手順に書かない。
import { WISH_STATE_LABEL } from "./wish-state";
import { PERIOD_STAGE_LABEL } from "./period-stage";

export type FlowStage = "wish" | "check" | "fixed" | "public";
export const FLOW_STAGES: readonly FlowStage[] = ["wish", "check", "fixed", "public"] as const;
export const FLOW_LABEL: Record<FlowStage, string> = { wish: "希望の受付", check: "確認", fixed: "確定", public: "本人へ公開" };
/** 段ごとの説明（1 行）と、その段で一覧に出る状態の名前 */
export const FLOW_NOTE: Record<FlowStage, string> = {
  wish: "キャストがマイページから希望を出す（期間が「募集中」の間）",
  check: "店が希望を採用・時間を調整（キャストの確認が要る店は本人の確認待ち）",
  fixed: "店がシフトを確定（まだ本人のマイページには出ない）",
  public: "期間を「キャストに公開する」で本人のマイページに出る",
};
export const FLOW_STATE_NAMES: Record<FlowStage, readonly string[]> = {
  wish: [WISH_STATE_LABEL.pending, PERIOD_STAGE_LABEL.draft, PERIOD_STAGE_LABEL.open],
  check: [WISH_STATE_LABEL.accepted_wait, PERIOD_STAGE_LABEL.closed],
  fixed: [WISH_STATE_LABEL.accepted_fixed],
  public: [PERIOD_STAGE_LABEL.published],
};

/** シフトの行の status（planned／proposed／confirmed）と期間の公開 → 手順の段 */
export function shiftFlowStageOf(status: string, published: boolean): FlowStage {
  if (status === "confirmed") return published ? "public" : "fixed";
  return "check";
}
/** 期間の status（draft／open／closed／published）→ 手順の段 */
export function periodFlowStageOf(status: string): FlowStage {
  return status === "published" ? "public" : status === "closed" ? "check" : "wish";
}

/** 確定したときに出す 1 行（その日を含む期間がまだ公開されていないとき） */
export const UNPUBLISHED_NOTE = "まだ本人には公開されません（「公開シフト」で「キャストに公開する」と本人のマイページに出ます）";
export function confirmNoteOf(anyUnpublished: boolean): string {
  return anyUnpublished ? `。${UNPUBLISHED_NOTE}` : "";
}

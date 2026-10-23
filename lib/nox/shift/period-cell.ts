// ★便 SH-UI-b2 B2-1／B2-3（2026-10-23）: カレンダーの日セルの地色＝その日が属する期間の状態（募集中／配置中／公開済み／期間なし）・期間の境目・
//   提出一覧の行から希望を処理するための行の形（純関数・DB を知らない）。期間は日単位で排他が前提。
import { effectiveStageOf, type PeriodStatus } from "./period-stage";

export type PeriodCellStage = "open" | "closed" | "published" | "draft" | "none";
export type PeriodCellLike = { id: string; start_date: string; end_date: string; wish_deadline: string | null; status: string };

/** 日 → 期間の状態（実効段＝締切を過ぎた募集中は配置中）。属する期間が無ければ none */
export function periodCellStageOf(periods: readonly PeriodCellLike[], ymd: string, today: string): PeriodCellStage {
  const p = periods.find((x) => x.start_date <= ymd && ymd <= x.end_date);
  if (!p) return "none";
  return effectiveStageOf(p, today) as PeriodStatus;
}

/** セルの class＝pst-open／pst-closed／pst-published／pst-draft／pst-none（色は globals.css・語は凡例で） */
export const periodCellClassOf = (stage: PeriodCellStage): string => `pst-${stage}`;

/** 凡例（4 つ・順＝進行の順）。draft は①の作成中＝カレンダーには出さない（期間なしと同じ灰） */
export const PERIOD_LEGEND: ReadonlyArray<readonly [PeriodCellStage, string]> = [["open", "募集中"], ["closed", "配置中"], ["published", "公開済み"], ["none", "期間なし"]];
export const PERIOD_STAGE_WORD: Record<PeriodCellStage, string> = { open: "募集中", closed: "配置中", published: "公開済み", draft: "作成中", none: "期間なし" };

const addDays = (ymd: string, n: number): string => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const periodIdOf = (periods: readonly PeriodCellLike[], ymd: string): string | null => periods.find((x) => x.start_date <= ymd && ymd <= x.end_date)?.id ?? null;

/** 期間の境目＝前日／翌日が別の期間（または期間なし）なら左／右に 1px の区切り（class pb-l／pb-r） */
export function periodBoundaryOf(periods: readonly PeriodCellLike[], ymd: string): { left: boolean; right: boolean } {
  const me = periodIdOf(periods, ymd);
  return { left: periodIdOf(periods, addDays(ymd, -1)) !== me, right: periodIdOf(periods, addDays(ymd, 1)) !== me };
}
export const periodBoundaryClassOf = (b: { left: boolean; right: boolean }): string => [b.left ? "pb-l" : "", b.right ? "pb-r" : ""].filter(Boolean).join(" ");

// ── B2-3 提出一覧の行から希望を処理 ──
export type WishLike = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string; kind?: string | null };
export type ShiftLike = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string; wish_id?: string | null };
export type WishRowState = "未処理" | "確定" | "調整中" | "見送り";
export type WishRow<W extends WishLike = WishLike, S extends ShiftLike = ShiftLike> = { wish: W; shift: S | null; state: WishRowState };

/** 希望の 4 状態（裁定345／380／406）＝pending→未処理・rejected→見送り・accepted→生成 shift が confirmed なら確定、planned／proposed なら調整中（shift が見つからなければ確定扱い＝採用済み） */
export function wishRowStateOf(w: WishLike, shift: ShiftLike | null): WishRowState {
  if (w.status === "rejected") return "見送り";
  if (w.status === "pending") return "未処理";
  if (shift && shift.status !== "confirmed") return "調整中";
  return "確定";
}

/** そのキャスト・その期間の希望（withdrawn は除く・日付順）に生成 shift（wish_id）を結ぶ（型は呼び出し側の Wish／Shift をそのまま返す） */
export function wishRowsOf<W extends WishLike, S extends ShiftLike>(wishes: readonly W[], shifts: readonly S[], castId: string, period: { start_date: string; end_date: string }): WishRow<W, S>[] {
  return wishes
    .filter((w) => w.cast_id === castId && w.date >= period.start_date && w.date <= period.end_date && w.status !== "withdrawn")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((w) => { const shift = shifts.find((s) => s.wish_id === w.id) ?? null; return { wish: w, shift, state: wishRowStateOf(w, shift) }; });
}

/** 一括確定の対象＝未処理（pending）の出勤希望だけ（休み希望は確定の対象外・定休日は呼び出し側で除く） */
export const unprocessedWishIdsOf = (rows: readonly WishRow<WishLike, ShiftLike>[]): string[] => rows.filter((r) => r.state === "未処理" && (r.wish.kind ?? "work") === "work").map((r) => r.wish.id);

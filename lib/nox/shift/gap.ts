// 裁定245-6／245-3 の純関数（DB 非依存・import なし・2026-09-11）。
//   gapOf(required, assigned, selected): シフト追加モーダルの日セル「不足 n」。
//     required <= 0（必要人数 未設定）→ null。required − assigned <= 0（充足済み）→ null（バッジなし）。
//     それ以外は不足数。このキャストを選択中（新規）の日は −1（0 は「充足」表示・負にはならない＝base >= 1 のとき selected で 0 まで）。
//   chunkOf(ids, size): 一括確定の分割（shift_confirm_bulk の上限 62 件＝0126）。順序保存・空は []。

export function gapOf(required: number, assigned: number, selected: boolean): number | null {
  if (!(required > 0)) return null;
  const base = required - assigned;
  if (base <= 0) return null;
  return selected ? base - 1 : base;
}

export function chunkOf<T>(ids: readonly T[], size = 62): T[][] {
  if (!(size > 0)) throw new Error("bad size");
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

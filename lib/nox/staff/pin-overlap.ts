// ★0201t（2026-11-19 夜・相談役 ③）: PIN の重なりの件数の案内（店長の PIN の画面）。件数だけ＝PIN そのもの・誰と重なったかは出さない。
export const PIN_OVERLAP_RPC = "pin_overlap_counts";
export type PinOverlapCounts = { overlap: number; unchecked: number };

/** 店ごとの件数 → 案内の文（0 件の種類は出さない・両方 0 は空）。店が複数（owner）のときは店の名前を前に付ける */
export function pinOverlapLinesOf(c: PinOverlapCounts, storeName?: string): string[] {
  const pre = storeName ? `${storeName}：` : "";
  const out: string[] = [];
  if (c.overlap > 0) out.push(`${pre}同じ店のほかの人と PIN が重なっているものが ${c.overlap} 件あります。PIN を設定し直してください（誰と重なっているかは表示しません）。`);
  if (c.unchecked > 0) out.push(`${pre}ほかの人との重なりをまだ確かめていない PIN が ${c.unchecked} 件あります（本人が店の端末で入ると確かめます。設定し直しても確かめられます）。`);
  return out;
}

/** RPC の返りを件数に（形が違えば null＝出さない） */
export function pinOverlapCountsOf(v: unknown): PinOverlapCounts | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  const overlap = n(o.overlap), unchecked = n(o.unchecked);
  return overlap === null || unchecked === null ? null : { overlap, unchecked };
}

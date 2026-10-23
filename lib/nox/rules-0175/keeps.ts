// ★連続便 3 追補 P-9（裁定419 候補・0175 v2 ★22）: キープボトルのタグ名（tag_label）と店の全キープ一覧の純関数。
//   既定のタグ名＝「{顧客名} {ボトル名}」（RPC bottle_keep_register も同じ式で自動生成）。棚＝既存の shelf_no。
//   RULES_0175_APPLIED=false の間は一覧タブ・タグ欄は出ない（従来の表示）。
export type KeepStatus = "active" | "pending" | "empty" | "removed";
export const KEEP_STATUS_LABEL: Record<string, string> = { active: "保管中", pending: "会計前", empty: "空", removed: "返却" };
export const keepStatusLabelOf = (s: string | null | undefined): string => KEEP_STATUS_LABEL[s ?? ""] ?? "終了";

/** タグ名の既定値＝「{顧客名} {ボトル名}」（60 字まで） */
export function tagLabelDefaultOf(customerName: string | null | undefined, bottleName: string | null | undefined): string {
  return `${(customerName ?? "").trim() || "（顧客）"} ${(bottleName ?? "").trim() || "（ボトル）"}`.slice(0, 60);
}
/** 表示用のタグ名＝tag_label が無ければ既定を組む */
export const keepTagOf = (k: { tag_label?: string | null }, customerName: string | null | undefined, bottleName: string | null | undefined): string => (k.tag_label && k.tag_label.trim()) || tagLabelDefaultOf(customerName, bottleName);

export type KeepListRow = {
  id: string; tag: string; customer: string; cast: string; bottle: string; remaining_pct: number | null; shelf_no: string | null;
  last_used_at: string | null; status: string; customer_id: string | null;
};
/** 検索＝タグ名・顧客名・ボトル名の部分一致（空＝全件） */
export function keepSearchOf<T extends { tag: string; customer: string; bottle: string }>(rows: readonly T[], q: string): T[] {
  const needle = q.trim();
  if (!needle) return [...rows];
  return rows.filter((r) => r.tag.includes(needle) || r.customer.includes(needle) || r.bottle.includes(needle));
}
/** 並び＝棚（空は末尾）→最終利用日（新しい順・無しは末尾） */
export function keepSortOf<T extends { shelf_no: string | null; last_used_at: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const sa = a.shelf_no ?? "￿", sb = b.shelf_no ?? "￿";
    if (sa !== sb) return sa < sb ? -1 : 1;
    const la = a.last_used_at ?? "", lb = b.last_used_at ?? "";
    return la === lb ? 0 : la > lb ? -1 : 1;
  });
}
/** レジのキープ呼び出しの表示＝タグ名で（「H様 山崎 10/23」の型＝tag＋最終利用日の月日） */
export function keepCallTextOf(tag: string, lastUsedAt: string | null | undefined): string {
  if (!lastUsedAt) return tag;
  const d = lastUsedAt.slice(0, 10); const m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  return Number.isFinite(m) && Number.isFinite(day) && m > 0 ? `${tag} ${m}/${day}` : tag;
}

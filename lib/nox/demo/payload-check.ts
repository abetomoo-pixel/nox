// ★2026-11-18（相談役 B＝read_1118 b の案 1）: デモの reset の前に payload の形を確かめる（DB を知らない純関数）。合わなければ消さずに失敗で返す。
//   11/17 21:10 の LUNA：体験入店のプランだけ pay_rate_tiers の鍵が無く、wipe の後の load で NOT NULL に当たって店が空のまま残った（wipe と load は別の取引）。
//   確かめること：① 表ごとに全行の鍵がそろう（"$" で始まる鍵は日付の写しの印＝見ない）② NOT NULL の列（payload-not-null.json＝本番の列の定義から生成）に null が無い ③ id の重なりが無い。
import NOT_NULL from "./payload-not-null.json";

export type PayloadIssue = { table: string; kind: "keys" | "null" | "dup_id"; detail: string };
const keysOf = (r: Record<string, unknown>) => Object.keys(r).filter((k) => !k.startsWith("$")).sort().join(",");

export function payloadIssuesOf(payload: Record<string, Record<string, unknown>[]>, notNull: Record<string, readonly string[]> = (NOT_NULL as { tables: Record<string, string[]> }).tables): PayloadIssue[] {
  const out: PayloadIssue[] = [];
  for (const [table, rows] of Object.entries(payload)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const k0 = keysOf(rows[0]);
    const bad = rows.findIndex((r) => keysOf(r) !== k0);
    if (bad >= 0) {
      const a = new Set(k0.split(",")), b = new Set(keysOf(rows[bad]).split(","));
      out.push({ table, kind: "keys", detail: `行 ${bad + 1}: 足りない鍵 ${[...a].filter((k) => !b.has(k)).join("／") || "なし"}・多い鍵 ${[...b].filter((k) => !a.has(k)).join("／") || "なし"}` });
    }
    for (const col of notNull[table] ?? []) {
      const i = rows.findIndex((r) => col in r && r[col] === null);
      if (i >= 0) out.push({ table, kind: "null", detail: `行 ${i + 1}: NOT NULL の列 ${col} が null` });
    }
    if ("id" in rows[0]) {
      const seen = new Set<string>();
      for (const r of rows) { const id = JSON.stringify(r.id ?? null); if (r.id != null && seen.has(id)) { out.push({ table, kind: "dup_id", detail: `id ${String(r.id).slice(0, 8)}… が 2 回` }); break; } seen.add(id); }
    }
  }
  return out;
}
export const payloadIssuesLabelOf = (xs: readonly PayloadIssue[]): string => xs.slice(0, 5).map((x) => `${x.table}（${x.kind}）${x.detail}`).join(" ／ ") + (xs.length > 5 ? ` ほか ${xs.length - 5} 件` : "");

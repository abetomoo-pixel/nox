// ★裁定302（2026-09-25・302-1／302-3）＋304: 前借り／送り実費の一括発行＝純関数（DB を知らない）。
//   マスタ「控除・送り」の発行フォームだけがチェックボックス一覧型（casts 詳細・給与右パネルは 1 人型のまま＝advance-okuri.ts）。
//   候補＝当日（営業日）の出勤者（attendance の出勤打刻あり＝shukkin／late／dohan）を上・他は下。行ごと金額・共通メモ 1 欄・
//   「一括発行」1 回 → route（/api/advance/issue-bulk／/api/transport/issue-bulk）→ RPC adv_issue_bulk／transport_issue_bulk（1 tx・部分成功なし・件ごと idem）。
//   'duplicate cast'（304-1）は和文「同じキャストが重複しています」。二層目の検証は route／RPC。
import { ISSUE_LABEL, issueErrJa, type IssueKind } from "./advance-okuri";

export const BULK_ENDPOINT: Record<IssueKind, string> = { advance: "/api/advance/issue-bulk", transport: "/api/transport/issue-bulk" };
/** attendance.status のうち「出勤打刻あり」＝collect.ts の attendanceDays と同じ 3 値 */
export const ATTENDED_STATUSES: readonly string[] = ["shukkin", "late", "dohan"];

export type BulkRow = { castId: string; name: string; attended: boolean; checked: boolean; amount: string };
export type BulkItem = { castId: string; amount: number };
export type BulkBody = { storeId: string; date: string; note: string | null; idemKey: string; items: BulkItem[] };

/** 候補行＝出勤者を上（名前の ja 昇順）・他を下（同）。金額は prefill（送り実費のベース額・0 は空） */
export function candidatesOf(casts: readonly { id: string; name: string }[], attendedIds: Iterable<string>, prefill = 0): BulkRow[] {
  const att = new Set(attendedIds);
  const amount = prefill > 0 ? String(prefill) : "";
  const sorted = [...casts].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const top = sorted.filter((c) => att.has(c.id)).map((c) => ({ castId: c.id, name: c.name, attended: true, checked: false, amount }));
  const rest = sorted.filter((c) => !att.has(c.id)).map((c) => ({ castId: c.id, name: c.name, attended: false, checked: false, amount }));
  return [...top, ...rest];
}

/** 出勤者を全員チェック（他は触らない） */
export function checkAttended(rows: readonly BulkRow[]): BulkRow[] {
  return rows.map((r) => (r.attended ? { ...r, checked: true } : r));
}
/** 全解除 */
export function uncheckAll(rows: readonly BulkRow[]): BulkRow[] {
  return rows.map((r) => (r.checked ? { ...r, checked: false } : r));
}

/** 金額欄 → 正の整数 or null（カンマ・円記号・空白は除く） */
export function amountOf(s: string | number): number | null {
  const n = typeof s === "number" ? s : Number(String(s).replace(/[,，¥￥\s]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 「n 人・合計 ¥m」＝チェック済み行の人数と金額合計（不正な金額は 0 として数える） */
export function bulkSummaryOf(rows: readonly BulkRow[]): { n: number; total: number; label: string } {
  const on = rows.filter((r) => r.checked);
  const total = on.reduce((a, r) => a + (amountOf(r.amount) ?? 0), 0);
  return { n: on.length, total, label: `${on.length} 人・合計 ¥${total.toLocaleString("en-US")}` }; // label＝件数表示（メッセージではない）
}

/** route へ送る body＝チェック済み行だけ・金額は正の整数・同じキャストは拒否（RPC の 'duplicate cast' と同じ判定）・日付 YYYY-MM-DD・idemKey 必須 */
export function bulkBodyOf(input: { kind: IssueKind; storeId: string; date: string; note: string; rows: readonly BulkRow[]; idemKey: string }):
  { ok: true; endpoint: string; body: BulkBody } | { ok: false; err: string } {
  if (!input.storeId) return { ok: false, err: "店舗が未選択です" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, err: "日付が正しくありません（YYYY-MM-DD）" };
  if (!/^[0-9a-f-]{36}$/i.test(input.idemKey)) return { ok: false, err: "再送キーが不正です（画面を読み込み直してください）" };
  const on = input.rows.filter((r) => r.checked);
  if (on.length === 0) return { ok: false, err: "発行するキャストにチェックを入れてください" };
  const items: BulkItem[] = [];
  const seen = new Set<string>();
  for (const r of on) {
    const amt = amountOf(r.amount);
    if (amt == null) return { ok: false, err: `${r.name} の金額は正の整数で入力してください` };
    if (seen.has(r.castId)) return { ok: false, err: "同じキャストが重複しています" };
    seen.add(r.castId);
    items.push({ castId: r.castId, amount: amt });
  }
  const note = input.note.trim() === "" ? null : input.note.trim();
  return { ok: true, endpoint: BULK_ENDPOINT[input.kind], body: { storeId: input.storeId, date: input.date, note, idemKey: input.idemKey, items } };
}

/** route（status＋error）の和文化（一括固有の語＋単発と同じ写像） */
export function bulkErrJa(status: number, msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("duplicate cast")) return "同じキャストが重複しています";
  if (m.includes("bad items")) return "発行する行がありません（チェックを入れてください）";
  if (m.includes("bad idem")) return "再送キーが不正です（画面を読み込み直してください）";
  if (m.includes("bad date")) return "日付が正しくありません（YYYY-MM-DD）";
  return issueErrJa(status, m);
}

export function bulkSuccessTextOf(kind: IssueKind, n: number, total: number, date: string): string {
  return `${ISSUE_LABEL[kind]}を ${n} 人・合計 ¥${total.toLocaleString("en-US")} 発行しました（${date}）`;
}

/** 当日の発行済み一覧の 1 行（advances／transport を同じ形に） */
export type IssuedRow = { kind: IssueKind; id: string; castId: string; amount: number; note: string | null; status: string };
export function issuedRowsOf(adv: readonly { id: string; cast_id: string; amount: number; note: string | null; status: string }[],
  trn: readonly { id: string; cast_id: string; amount: number; note: string | null; status: string }[]): IssuedRow[] {
  const a = adv.map((r) => ({ kind: "advance" as const, id: r.id, castId: r.cast_id, amount: r.amount, note: r.note, status: r.status }));
  const t = trn.map((r) => ({ kind: "transport" as const, id: r.id, castId: r.cast_id, amount: r.amount, note: r.note, status: r.status }));
  return [...a, ...t];
}

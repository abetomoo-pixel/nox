// ★裁定300（2026-09-25）: 前借り／送り実費の発行の純関数（DB を知らない）。
//   3 入口（マスタ「控除・送り」／casts 詳細／給与 run 明細の右パネル）が同じ部品（components/nox/advance-okuri-form.tsx）から
//   同じ route（/api/advance/issue → adv_issue／/api/transport/issue → transport_issue）を呼ぶ＝新 RPC 0（300-2）。
//   残高管理（貸付・年越し過払債権）は 0156（300-4）＝ここは入口と表示だけ。
export type IssueKind = "advance" | "transport";

// ★裁定312（0158・便 AB-8）: 支払済みの期の日付で発行した前借り・日払いは、控除先が翌月へ繰り下がる（advances.deduct_period／daily_pay_issue の戻り carried_to）。
//   発行後の文言に添える注記（繰り下げが無ければ空文字）。carried＝繰り下げ先の 'YYYY-MM'（null＝繰り下げなし）
export function carriedNoteOf(carried: string | null | undefined): string {
  return typeof carried === "string" && /^\d{4}-\d{2}$/.test(carried) ? `翌月（${carried}）の給与から控除` : "";
}
/** ★起票93（裁定312・便 X-12-2）: 日払いフォームの期の注記。paid＝発行できるが控除先は翌月／finalized＝発行できるが凍結明細には載らない／draft・run なし＝注記なし */
export function dailyPayPeriodNoteOf(status: string | null | undefined, period: string): { kind: "info" | "warn"; text: string } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  if (status === "paid") { const [y, m] = period.split("-").map(Number); const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; return { kind: "info", text: `この営業日の期（${period}）は支払済みです。発行した日払いは${carriedNoteOf(next)}します` }; }
  if (status === "finalized") return { kind: "warn", text: `この営業日の期（${period}）は確定済みです。発行はできますが、確定解除して再計算するまで給与明細には載りません` };
  return null;
}
/** ★便 L-3-2（仮決め）: 日払いの過徴収 warn。当期の日払い累計＋今回額 > 当期プレビューの差引支給見込み（日払い前＝preview の net＋dailyPaidGross）のとき文言を返す。発行は止めない。
 *  expectedNet が null（プレビュー未取得・行なし）や gross 0 以下は null */
export function dailyPayOverNoteOf(issuedSum: number, gross: number, expectedNet: number | null | undefined): string | null {
  if (typeof expectedNet !== "number" || !Number.isFinite(expectedNet) || gross <= 0) return null;
  return issuedSum + gross > expectedNet ? `当期の見込み手取り ¥${Math.max(0, expectedNet).toLocaleString()} を超えます（翌期で控除）` : null;
}
/** 一括発行: 発行した行の deduct_period から「うち n 件は翌月（YYYY-MM）の給与から控除」。発行日の月と同じ・null は数えない */
export function carriedBulkNoteOf(date: string, deductPeriods: readonly (string | null | undefined)[]): string {
  const carried = deductPeriods.filter((p): p is string => typeof p === "string" && /^\d{4}-\d{2}$/.test(p) && p !== date.slice(0, 7));
  if (carried.length === 0) return "";
  const periods = [...new Set(carried)].sort();
  const head = carried.length === deductPeriods.length ? "" : `うち ${carried.length} 件は`;
  return `${head}翌月（${periods.join("・")}）の給与から控除`;
}
export const ISSUE_ENDPOINT: Record<IssueKind, string> = { advance: "/api/advance/issue", transport: "/api/transport/issue" };
export const ISSUE_LABEL: Record<IssueKind, string> = { advance: "前借り", transport: "送り実費" };
export const ISSUE_DATE_LABEL: Record<IssueKind, string> = { advance: "前借り日", transport: "乗車日（営業日）" };

export type IssueBody = { storeId: string; castId: string; amount: number; note: string | null } & ({ advancedOn: string } | { bizDate: string });

/** route へ送る body＝キャスト必須・金額は正の整数・日付 YYYY-MM-DD・メモは trim（空は null）。二層目は route／RPC の検証 */
export function issueBodyOf(input: { kind: IssueKind; storeId: string; castId: string | null | undefined; amount: string | number; date: string; note: string }):
  { ok: true; endpoint: string; body: IssueBody } | { ok: false; err: string } {
  if (!input.storeId) return { ok: false, err: "店舗が未選択です" };
  if (!input.castId) return { ok: false, err: "キャストを選択してください" };
  const amt = typeof input.amount === "number" ? input.amount : Number(String(input.amount).replace(/[,，¥￥\s]/g, ""));
  if (!Number.isInteger(amt) || amt <= 0) return { ok: false, err: "金額は正の整数で入力してください" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, err: "日付が正しくありません（YYYY-MM-DD）" };
  const note = input.note.trim() === "" ? null : input.note.trim();
  const base = { storeId: input.storeId, castId: input.castId, amount: amt, note };
  const body: IssueBody = input.kind === "advance" ? { ...base, advancedOn: input.date } : { ...base, bizDate: input.date };
  return { ok: true, endpoint: ISSUE_ENDPOINT[input.kind], body };
}

/** 日付の既定＝今日。期（給与 run）が指定されていればその範囲に丸める（期固定＝300-2 の右パネル） */
export function issueDateDefaultOf(today: string, periodStart?: string | null, periodEnd?: string | null): string {
  if (periodStart && today < periodStart) return periodStart;
  if (periodEnd && today > periodEnd) return periodEnd;
  return today;
}

/** 送り実費の発行可否＝店の送り方式が 'actual' のとき。未指定（読んでいない入口）は RPC の 'okuri not actual' に任せる＝有効 */
export function okuriEnabledOf(okuriMode?: string | null): boolean {
  return okuriMode == null || okuriMode === "actual";
}

/** route（status＋error）の和文化（握り潰さない・生の語を裸で出さない） */
export function issueErrJa(status: number, msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("paid period")) return "支払済みの期間には発行できません";
  if (m.includes("okuri not actual")) return "送り方式が「実費」の店のみ発行できます（控除・送りで切替）";
  if (m.includes("forbidden") || status === 403) return "権限がありません（owner／manager 自店のみ）";
  if (m.includes("bad cast") || m.includes("inactive cast")) return "そのキャストには発行できません（在籍・自店を確認してください）";
  if (m.includes("bad amount") || m.includes("positive integer")) return "金額は正の整数で入力してください";
  if (status === 401 || m.includes("unauthenticated")) return "ログインし直してください";
  return `処理できませんでした（コード: ${m || status}）`;
}

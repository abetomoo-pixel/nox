// ★裁定300（2026-09-25）: 前借り／送り実費の発行の純関数（DB を知らない）。
//   3 入口（マスタ「控除・送り」／casts 詳細／給与 run 明細の右パネル）が同じ部品（components/nox/advance-okuri-form.tsx）から
//   同じ route（/api/advance/issue → adv_issue／/api/transport/issue → transport_issue）を呼ぶ＝新 RPC 0（300-2）。
//   残高管理（貸付・年越し過払債権）は 0156（300-4）＝ここは入口と表示だけ。
export type IssueKind = "advance" | "transport";
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

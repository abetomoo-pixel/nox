// ★裁定526・527（Agoora の決め 1・2・相談役 2026-11-28 11:50・食い違い 39・63・裁定514-2 の続き）: 会計済みの伝票の取消（レジの「会計済みの伝票」の一覧）の、順番と文。
//   DB を知らない（読む・取り消すは引数の関数で受ける）＝順番と飛ばしの判断はここだけ。関数（check_void／receipt_issue_void）は変えない。
//   裁定527（決め 2・形 2）: その伝票の発行済みの領収書を先に 1 枚ずつ取り消し（理由＝「伝票の取消のため」）、全部済んでから伝票を取り消す。
//     ・押すたびに領収書の今の状態を読み直す＝取消済みの行は飛ばす（途中で止まった後のやり直しは続きから）。
//     ・領収書の取消が 1 枚でも失敗したら、そこで止めて伝票は取り消さない（どこまで済んだかを文で出す）。
//     ・伝票の取消の直前にもう一度読み直す＝その間に別の端末が領収書を出していたら止める（「全部済んでから」を守る）。
//   裁定526（決め 1）: 締めた日でも画面では止めない。文で知らせる。関数が 'day closed' を返したときの文は VOID_DAY_CLOSED_TEXT。
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";

/** 領収書の取消の理由（receipt_issue_void の p_note）＝裁定527 の文のまま */
export const RECEIPT_VOID_NOTE = "伝票の取消のため";
/** 関数（check_void）が 'day closed' を返したとき＝裁定526 の文のまま */
export const VOID_DAY_CLOSED_TEXT = "日報の締めを解除してから取り消してください。";

export type ReceiptState = { id: string; serial: number; voided: boolean };
export const receiptSerialNo = (n: number) => `R-${String(n).padStart(6, "0")}`;
const serials = (rs: readonly ReceiptState[]) => rs.map((r) => receiptSerialNo(r.serial)).join("・");

/** 取り消す順（番号の小さい順）と、飛ばす行（取消済み）。同じ id が 2 度来ても 1 度だけ */
export function receiptVoidPlanOf(rows: readonly ReceiptState[]): { toVoid: ReceiptState[]; skipped: ReceiptState[] } {
  const seen = new Set<string>();
  const uniq = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice().sort((a, b) => a.serial - b.serial);
  return { toVoid: uniq.filter((r) => !r.voided), skipped: uniq.filter((r) => r.voided) };
}

export type ClosedVoidDeps = {
  /** その伝票の領収書を全部（取消済みも）読む。読めないときは error */
  readReceipts: () => Promise<{ rows: ReceiptState[] } | { error: string }>;
  /** 1 枚を取り消す（receipt_issue_void・理由は RECEIPT_VOID_NOTE）。通れば null・断られたら生の語 */
  voidReceipt: (id: string) => Promise<string | null>;
  /** 伝票を取り消す（check_void）。通れば null・断られたら生の語 */
  voidCheck: () => Promise<string | null>;
  /** ★選べる形（先読み）: 取り消す領収書があるときだけ、1 枚目の前に呼ぶ。関数（check_void）が必ず断ると分かれば、その語を返す（領収書に手を付けない）。分からなければ null */
  preflight?: () => Promise<string | null>;
};
export type ClosedVoidOutcome =
  | { kind: "done"; voidedNow: ReceiptState[]; skipped: ReceiptState[] }
  | { kind: "read_failed"; error: string; voidedNow: ReceiptState[] }
  | { kind: "preflight"; error: string }
  | { kind: "receipt_failed"; error: string; voidedNow: ReceiptState[]; failed: ReceiptState; rest: ReceiptState[]; skipped: ReceiptState[] }
  | { kind: "new_receipt"; alive: ReceiptState[]; voidedNow: ReceiptState[] }
  | { kind: "check_failed"; error: string; voidedNow: ReceiptState[]; receiptsTotal: number };

/** 形 2 の順：読む → 取消済みを飛ばして 1 枚ずつ取消 → 読み直して残りが無いのを確かめる → 伝票の取消。途中で断られたらそこで止める */
export async function runClosedVoid(deps: ClosedVoidDeps): Promise<ClosedVoidOutcome> {
  const first = await deps.readReceipts();
  if ("error" in first) return { kind: "read_failed", error: first.error, voidedNow: [] };
  const plan = receiptVoidPlanOf(first.rows);
  const voidedNow: ReceiptState[] = [];
  if (plan.toVoid.length > 0 && deps.preflight) { const pre = await deps.preflight(); if (pre) return { kind: "preflight", error: pre }; }
  for (let i = 0; i < plan.toVoid.length; i++) {
    const r = plan.toVoid[i];
    const err = await deps.voidReceipt(r.id);
    if (err) return { kind: "receipt_failed", error: err, voidedNow, failed: r, rest: plan.toVoid.slice(i + 1), skipped: plan.skipped };
    voidedNow.push(r);
  }
  const again = await deps.readReceipts();
  if ("error" in again) return { kind: "read_failed", error: again.error, voidedNow };
  const left = receiptVoidPlanOf(again.rows);
  if (left.toVoid.length > 0) return { kind: "new_receipt", alive: left.toVoid, voidedNow };
  const cerr = await deps.voidCheck();
  if (cerr) return { kind: "check_failed", error: cerr, voidedNow, receiptsTotal: left.skipped.length };
  return { kind: "done", voidedNow, skipped: plan.skipped };
}

/** ★選べる形（先読み）: check_void が必ず断ると、画面の読みだけで分かるか。順は関数と同じ（締めの関所 → 売掛）。分からないときは null＝関数に任せる。
 *   締め＝assert_day_open（0138:139-151）と同じ読み：流れを使う店・その営業日の日報の行がある・解除中（reopened_at あり・reclosed_at なし）でない。
 *   売掛＝check_void（0190:3275-3277）と同じ読み：回収済み・天引き済み・一部でも回収か天引きのある行が 1 つでもある。 */
export function closedVoidPreflightOf(a: {
  flowOn: boolean; report: { reopened_at: string | null; reclosed_at: string | null } | null;
  receivables: readonly { status: string; deducted_amount: number; collected_amount: number }[];
}): "day closed" | "receivable settled" | null {
  if (a.flowOn && a.report && !(a.report.reopened_at && !a.report.reclosed_at)) return "day closed";
  if (a.receivables.some((r) => r.status === "collected" || r.status === "deducted" || r.deducted_amount > 0 || r.collected_amount > 0)) return "receivable settled";
  return null;
}

/** 伝票の取消（check_void）と領収書の取消（receipt_issue_void）が返す語 → 画面の文 */
export function closedVoidErrJa(msg: string | undefined | null): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("day closed")) return VOID_DAY_CLOSED_TEXT;
  if (msg.includes("receivable settled")) return "売掛を回収・天引きした伝票は取り消せません";
  if (msg.includes("bad reason")) return "取消の理由を入力してください";
  if (msg.includes("not voidable")) return "この伝票は取り消せません（すでに取消済みです）";
  if (msg.includes("forbidden")) return "取消は店長以上だけです";
  return rpcErrJa(msg);
}

/** 取消の窓に出す文（領収書が 1 枚も無ければ空）＝裁定527 の文のまま */
export function receiptVoidNoticeOf(aliveCount: number): string {
  return aliveCount > 0 ? `領収書 ${aliveCount} 枚も取消になります（公開ページも無効）` : "";
}

/** 'YYYY-MM-DD' → 「11月28日」 */
export function mdJa(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : ymd;
}
/** 一覧の注記（その営業日の日報の行があるとき）＝裁定526 の文のまま。後ろの文は取消のできる人（店長以上）にだけ */
export function closedDayNoticeOf(bizDate: string, isManagerUp: boolean): string {
  return `${mdJa(bizDate)}の日報は締め済みです。${isManagerUp ? "伝票を取り消したら、日報の締め直しが要ります。" : ""}`;
}

/** 結果 → 画面の文。ok＝伝票まで取り消せた（窓を閉じてフロアに出す）・それ以外は窓に残して出す */
export function closedVoidTextOf(o: ClosedVoidOutcome): { ok: boolean; text: string } {
  switch (o.kind) {
    case "done":
      return { ok: true, text: `会計済みの伝票を取消しました${o.voidedNow.length > 0 ? `（領収書 ${o.voidedNow.length} 枚も取消しました・公開ページも無効です）` : ""}` };
    case "read_failed":
      return { ok: false, text: `領収書の状態を読めませんでした（${rpcErrJa(o.error)}）。伝票は取り消していません。${o.voidedNow.length > 0 ? `領収書 ${serials(o.voidedNow)} は取消済みです。` : ""}もう一度「取り消す」を押してください。` };
    case "preflight":
      return { ok: false, text: `${closedVoidErrJa(o.error)}（領収書も伝票も、まだ取り消していません）` };
    case "receipt_failed":
      return { ok: false, text: `領収書の取消が途中で止まりました（${receiptSerialNo(o.failed.serial)}：${closedVoidErrJa(o.error)}）。`
        + `取消済み＝${o.voidedNow.length > 0 ? serials(o.voidedNow) : "なし"}・まだ＝${serials([o.failed, ...o.rest])}。`
        + "伝票は取り消していません。もう一度「取り消す」を押すと、取消済みの領収書は飛ばして続きから進みます。" };
    case "new_receipt":
      return { ok: false, text: `取消の途中で、この伝票に新しい領収書（${serials(o.alive)}）が発行されました。伝票は取り消していません。もう一度「取り消す」を押してください。` };
    case "check_failed":
      return { ok: false, text: closedVoidErrJa(o.error) + (o.receiptsTotal > 0 ? `（この伝票の領収書 ${o.receiptsTotal} 枚は取消済みです。伝票は会計済みのままです）` : "") };
  }
}

// 裁定264-7／264-8: 調整控除 route（add／delete）の入力整形＝純関数（DB を知らない・verify が直接叩ける）。
//  - 入力は %（小数 2 桁まで・12.5% 可）。保存は Math.round(pct×100) の bp 整数。0..10000 を client でも server でも assert。
//  - 理由必須（258-4・trim 1..200）。boolean は UI から常に明示値（原則7）＝欠落は 400。
//  - route は本関数の結果をそのまま RPC へ渡す（判定の本体は payroll_adjustment_add／_delete の二重防御）。

export type AdjustmentKind = "fixed" | "rate";

export type AdjustAddInput = {
  storeId: string;
  period: string;
  castId: string;
  kind: AdjustmentKind;
  amount: number | null; // fixed: 円（整数 0 以上）
  rateBp: number | null; // rate: bp（整数 0..10000）
  beforeWithholding: boolean;
  showDetail: boolean;
  reason: string; // trim 済み 1..200
};

export type AdjustDeleteInput = { storeId: string; period: string; id: string; reason: string };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; status: 400; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** %（小数可）→ bp 整数。12.5 → 1250。範囲判定は呼び元（parse）で行う。 */
export function pctToBp(pct: number): number {
  return Math.round(pct * 100);
}

/** bp 整数 → %（表示用・常に % で見せる）。1250 → 12.5。 */
export function bpToPct(bp: number): number {
  return bp / 100;
}

function bad<T>(error: string): ParseResult<T> {
  return { ok: false, status: 400, error };
}

function reasonOf(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length >= 1 && s.length <= 200 ? s : null;
}

export function parseAdjustAddBody(body: unknown): ParseResult<AdjustAddInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.storeId !== "string" || !b.storeId) return bad("storeId required");
  if (typeof b.period !== "string" || !PERIOD_RE.test(b.period)) return bad("period must be YYYY-MM");
  if (typeof b.castId !== "string" || !UUID_RE.test(b.castId)) return bad("castId required (uuid)");
  if (b.kind !== "fixed" && b.kind !== "rate") return bad("kind must be fixed|rate");
  if (typeof b.beforeWithholding !== "boolean") return bad("beforeWithholding required (boolean)");
  if (typeof b.showDetail !== "boolean") return bad("showDetail required (boolean)");
  const reason = reasonOf(b.reason);
  if (reason === null) return bad("reason required (1-200)");

  let amount: number | null = null;
  let rateBp: number | null = null;
  if (b.kind === "fixed") {
    if (typeof b.amount !== "number" || !Number.isInteger(b.amount) || b.amount < 0) return bad("amount must be an integer >= 0");
    amount = b.amount;
  } else {
    if (typeof b.ratePct !== "number" || !Number.isFinite(b.ratePct)) return bad("ratePct required (number)");
    const bp = pctToBp(b.ratePct);
    if (bp < 0 || bp > 10000) return bad("ratePct out of range (0-100)");
    rateBp = bp;
  }
  return {
    ok: true,
    value: { storeId: b.storeId, period: b.period, castId: b.castId, kind: b.kind, amount, rateBp, beforeWithholding: b.beforeWithholding, showDetail: b.showDetail, reason },
  };
}

export function parseAdjustDeleteBody(body: unknown): ParseResult<AdjustDeleteInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.storeId !== "string" || !b.storeId) return bad("storeId required");
  if (typeof b.period !== "string" || !PERIOD_RE.test(b.period)) return bad("period must be YYYY-MM");
  if (typeof b.id !== "string" || !UUID_RE.test(b.id)) return bad("id required (uuid)");
  const reason = reasonOf(b.reason);
  if (reason === null) return bad("reason required (1-200)");
  return { ok: true, value: { storeId: b.storeId, period: b.period, id: b.id, reason } };
}

/** RPC エラー文 → HTTP status（payment/record と同じ薄い写像・未知は 400）。 */
export function adjustRpcStatus(message: string): number {
  return message.includes("forbidden") ? 403
    : message.includes("run not draft") ? 409
    : message.includes("run not found") || message.includes("cast not found") || message.includes("not found") ? 404
    : 400;
}

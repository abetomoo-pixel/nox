// ★0154 D4（2026-09-24・裁定293 追補1・294-6／294-7）: 精算調整（委託の遅刻／当欠／早退の減額＝契約根拠つき）の純関数（DB を知らない）。
//   ひな形＝stores.settings_json.settlement_presets（配列 ≤10・{code,name,amount,basis,target}・set_store_profile の白名単）。
//   登録＝payroll_adjustment_add(source='settlement'・basis＝ひな形の文・target_shift_id＝当日の shift・当期 draft run)。
export type SettlementTarget = "late" | "absent" | "early" | "other";
export type SettlementPreset = { code: string; name: string; amount: number; basis: string; target: SettlementTarget };

/** 既定 3 件（額 0・文は店が編集＝裁定293 追補1-1） */
export const DEFAULT_SETTLEMENT_PRESETS: SettlementPreset[] = [
  { code: "late", name: "遅刻", amount: 0, basis: "契約書の遅刻精算条項に基づく減額", target: "late" },
  { code: "absent", name: "当欠", amount: 0, basis: "契約書の当日欠勤精算条項に基づく減額", target: "absent" },
  { code: "early", name: "早退", amount: 0, basis: "契約書の早退精算条項に基づく減額", target: "early" },
];
export const TARGET_LABEL: Record<SettlementTarget, string> = { late: "遅刻", absent: "当欠", early: "早退", other: "その他" };
export const isSettlementTarget = (v: unknown): v is SettlementTarget => v === "late" || v === "absent" || v === "early" || v === "other";

/** settings_json から読む（形が違う要素は落とす・0 件なら既定 3 件） */
export function presetsOf(settings: Record<string, unknown> | null | undefined): SettlementPreset[] {
  const raw = settings?.settlement_presets;
  if (!Array.isArray(raw)) return DEFAULT_SETTLEMENT_PRESETS;
  const out: SettlementPreset[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.code !== "string" || typeof o.name !== "string" || typeof o.amount !== "number" || typeof o.basis !== "string" || !isSettlementTarget(o.target)) continue;
    out.push({ code: o.code, name: o.name, amount: Math.max(0, Math.trunc(o.amount)), basis: o.basis, target: o.target });
  }
  return out.length > 0 ? out : DEFAULT_SETTLEMENT_PRESETS;
}

/** set_store_profile へ渡す形の検査（RPC の 'bad type' と同じ射程＝配列 ≤10・要素 5 キー・amount 整数 ≥0・target 4 値） */
export function validatePresets(list: readonly SettlementPreset[]): string | null {
  if (list.length > 10) return "ひな形は 10 件までです";
  for (const p of list) {
    if (p.code.trim().length === 0) return "コードを入力してください";
    if (!Number.isInteger(p.amount) || p.amount < 0) return `${p.name || p.code}: 額は 0 円以上の整数で入力してください`;
    if (!isSettlementTarget(p.target)) return `${p.name || p.code}: 対象が正しくありません`;
  }
  const codes = new Set(list.map((p) => p.code.trim()));
  if (codes.size !== list.length) return "コードが重複しています";
  return null;
}

/** 検知: 当欠（attendance absent）／遅刻（attendance late または打刻の遅刻分 > 0）／早退（退勤打刻が確定シフトの終了より早い） */
export function detectTargetOf(input: { attStatus?: string | null; lateMin?: number | null; outHm?: string | null; endHm?: string | null }): SettlementTarget | null {
  if (input.attStatus === "absent") return "absent";
  if (input.attStatus === "late" || (input.lateMin ?? 0) > 0) return "late";
  if (input.outHm && input.endHm && toMin(input.outHm) < toMin(input.endHm)) return "early";
  return null;
}
const toMin = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** 明細の理由（凍結形 {reason, amount} に載る）＝「精算調整（遅刻 9/22）」→ 明細は「精算調整（遅刻 9/22） −¥n」 */
export function settlementReasonOf(preset: Pick<SettlementPreset, "name">, biz?: string | null): string {
  const md = biz && /^\d{4}-\d{2}-\d{2}$/.test(biz) ? ` ${Number(biz.slice(5, 7))}/${Number(biz.slice(8, 10))}` : "";
  return `精算調整（${preset.name}${md}）`;
}

/** payroll_adjustment_add の引数（fixed・源泉前＝報酬の減額・明細に出す・source 'settlement'） */
export function settlementArgsOf(input: { runId: string; castId: string; preset: SettlementPreset; amount: number; biz?: string | null; shiftId?: string | null }): { ok: true; args: Record<string, unknown> } | { ok: false; err: string } {
  if (!Number.isInteger(input.amount) || input.amount < 0) return { ok: false, err: "額は 0 円以上の整数で入力してください" };
  if (input.preset.basis.trim().length === 0) return { ok: false, err: "契約根拠の文が空です（報酬制度の精算調整で設定してください）" };
  return { ok: true, args: {
    p_run_id: input.runId, p_cast_id: input.castId, p_mode: "fixed", p_amount: input.amount, p_rate_bp: null,
    p_before_withholding: true, p_show_detail: true, p_reason: settlementReasonOf(input.preset, input.biz),
    p_source: "settlement", p_basis: input.preset.basis.trim().slice(0, 200), p_target_shift_id: input.shiftId ?? null,
  } };
}

/** 月次一覧「精算調整の未登録候補: n 件」＝期間内の遅刻／当欠（attendance）の件数 − 登録済み settlement 行（0 未満は 0） */
export function settlementCandidatesOf(input: { attendance: readonly { status: string }[]; settlements: number }): number {
  const detected = input.attendance.filter((a) => a.status === "late" || a.status === "absent").length;
  return Math.max(0, detected - input.settlements);
}
/** 期 'YYYY-MM' の暦日範囲 */
export function periodRangeOf(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

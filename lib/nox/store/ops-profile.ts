// ★0164（裁定331 C 5 項目＋裁定334・便 W5-2a・2026-10-13）: 「会計と運用」＝stores の列 7 つ（settings_json ではない）の純関数（DB を知らない・server／client 両方から import 可）。
//   invoice_registered_on（'YYYY-MM-DD'／null）・pay_day（1〜31・表示と案内用・締め日は月末固定＝334）・tax_inclusive_display（表示だけ・計算不変）・
//   use_vip／use_counter（フロアの種別表示＝lib/nox/floor-kinds）・payment_methods {cash,card,emoney,qr}（cash は常に true）・punch_methods {self,proxy,kiosk}（1 つ以上 true）。
//   保存は set_store_profile(p_store_id, p_patch) の patch（owner 限定・型検査 'bad pay_day'／'bad payment_methods'／'bad punch_methods' は RPC が本体）。
export type PaymentMethods = { cash: boolean; card: boolean; emoney: boolean; qr: boolean };
export type PunchMethods = { self: boolean; proxy: boolean; kiosk: boolean };
export type OpsProfile = {
  invoice_registered_on: string; // '' ＝ null（未登録／不明）
  pay_day: string;               // 入力中は文字列（保存時に Number）
  tax_inclusive_display: boolean;
  use_vip: boolean;
  use_counter: boolean;
  payment_methods: PaymentMethods;
  punch_methods: PunchMethods;
};
export const OPS_DEFAULT: OpsProfile = {
  invoice_registered_on: "", pay_day: "25", tax_inclusive_display: false, use_vip: true, use_counter: true,
  payment_methods: { cash: true, card: true, emoney: false, qr: false }, punch_methods: { self: true, proxy: true, kiosk: true },
};
export const PAYMENT_METHOD_LABEL: ReadonlyArray<readonly [keyof PaymentMethods, string]> = [["cash", "現金"], ["card", "カード"], ["emoney", "電子マネー"], ["qr", "QR 決済"]];
export const PUNCH_METHOD_LABEL: ReadonlyArray<readonly [keyof PunchMethods, string]> = [["self", "本人のスマホ"], ["proxy", "店の代行"], ["kiosk", "打刻端末"]];
/** ★便 X13-G W-23: キャストの打刻を使わない店＝本人のスマホも打刻端末も OFF（店が今日タブで勤怠を記録＝代行は ON） */
export const castPunchOffOf = (pm: PunchMethods): boolean => !pm.self && !pm.kiosk;
/** 「キャストの打刻」の 2 択 → punch_methods（使わない＝self／kiosk OFF・proxy ON／使う＝self／kiosk ON・proxy は今のまま） */
export const castPunchMethodsOf = (useCastPunch: boolean, cur: PunchMethods): PunchMethods => (useCastPunch ? { self: true, kiosk: true, proxy: cur.proxy } : { self: false, kiosk: false, proxy: true });
export const CAST_PUNCH_OFF_NOTE = "使わない店は、出勤・退勤を店が今日タブで記録します（キャストのマイページと打刻端末に打刻ボタンを出しません）。勤務時間の計算基準が「実打刻」の店では、店が記録した時刻を実打刻として扱い、遅刻・当欠の判定も店の記録時刻で行います。";

/** stores 行（列 7 つ）→ OpsProfile（欠損は 0164 の既定） */
export function opsProfileOf(row: Record<string, unknown> | null | undefined): OpsProfile {
  const pm = (row?.payment_methods ?? {}) as Partial<PaymentMethods>;
  const pu = (row?.punch_methods ?? {}) as Partial<PunchMethods>;
  return {
    invoice_registered_on: typeof row?.invoice_registered_on === "string" ? row.invoice_registered_on.slice(0, 10) : "",
    pay_day: typeof row?.pay_day === "number" ? String(row.pay_day) : "25",
    tax_inclusive_display: row?.tax_inclusive_display === true,
    use_vip: row?.use_vip !== false,
    use_counter: row?.use_counter !== false,
    payment_methods: { cash: true, card: pm.card !== false, emoney: pm.emoney === true, qr: pm.qr === true },
    punch_methods: { self: pu.self !== false, proxy: pu.proxy !== false, kiosk: pu.kiosk !== false },
  };
}

/** 変更分だけを set_store_profile の patch に（invoice は ''→null・pay_day は数値・jsonb は丸ごと・cash は常に true） */
export function opsPatchOf(form: OpsProfile, cur: OpsProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (form.invoice_registered_on !== cur.invoice_registered_on) out.invoice_registered_on = form.invoice_registered_on === "" ? null : form.invoice_registered_on;
  if (form.pay_day.trim() !== cur.pay_day) out.pay_day = Number(form.pay_day);
  if (form.tax_inclusive_display !== cur.tax_inclusive_display) out.tax_inclusive_display = form.tax_inclusive_display;
  if (form.use_vip !== cur.use_vip) out.use_vip = form.use_vip;
  if (form.use_counter !== cur.use_counter) out.use_counter = form.use_counter;
  if (JSON.stringify(form.payment_methods) !== JSON.stringify(cur.payment_methods)) out.payment_methods = { ...form.payment_methods, cash: true };
  if (JSON.stringify(form.punch_methods) !== JSON.stringify(cur.punch_methods)) out.punch_methods = form.punch_methods;
  return out;
}

/** 保存前の先回り検査（RPC と同じ条件・二重防御の外側）。null＝OK・文字列＝日本語のエラー */
export function opsPatchErrorOf(patch: Record<string, unknown>): string | null {
  if ("pay_day" in patch && (!Number.isInteger(patch.pay_day) || (patch.pay_day as number) < 1 || (patch.pay_day as number) > 31)) return "支払日は 1〜31 の整数で入力してください";
  if ("invoice_registered_on" in patch && patch.invoice_registered_on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(patch.invoice_registered_on))) return "インボイス登録日は YYYY-MM-DD で入力してください";
  if ("punch_methods" in patch && !Object.values(patch.punch_methods as PunchMethods).some(Boolean)) return "打刻方法は 1 つ以上 ON にしてください";
  return null;
}

/** STEP 6 の確認表・店舗設定の要約 1 行 */
export function opsSummaryOf(o: OpsProfile): string {
  const pm = PAYMENT_METHOD_LABEL.filter(([k]) => o.payment_methods[k]).map(([, l]) => l).join("・");
  const pu = PUNCH_METHOD_LABEL.filter(([k]) => o.punch_methods[k]).map(([, l]) => l).join("・");
  return `支払日 翌月 ${o.pay_day} 日・インボイス ${o.invoice_registered_on || "未登録"}・消費税 ${o.tax_inclusive_display ? "内税表示" : "外税表示"}・VIP ${o.use_vip ? "あり" : "なし"}・カウンター ${o.use_counter ? "あり" : "なし"}・支払い ${pm}・打刻 ${pu}`;
}

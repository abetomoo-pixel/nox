// ★便 P173（2026-10-16・0173 の client＝裁定385／386／389／391／392／393）: レジ側の純関数（DB を知らない）。
//   (391) 明細の並び順＝セット→延長→指名群（本指名・場内・同伴・延長指名）→支払手数料→商品（注文順）→割引。小計 2 行＝「セット・延長・指名」「商品」
//        ＝daily_report_aggregate の 'set_ext_nom'（kind set／time／charge）／'products'（drink／champ／bottle／custom／food／other／keep_out）と同じ分類。
//   (393) 支払方法別の手数料＝店設定 pay_fee_rates {card, emoney, other}（整数 0〜100・欠損＝0）。レジの method（cash／card／emoney／qr／ar／other）→キー。
//        手数料＝round(入金額×率/100)＝check_pay の v_fee と同式（1 円未満四捨五入）。伝票行の印字名＝check_pay と同じ。
//   (386) 店設定 join_mode（join_set 既定／extend_only）・checks.set_frozen の注記。
//   (389) 店設定 cast_register_device（store_device 既定／own_phone）とキャスト本人セッションの /register 入口の可否。

export type OrderLine = { kind: string; fee_kind?: string | null; sort_order?: number /* 無ければ入力順（レジは sort_order 順で取得済み） */ };
export const NOM_FEE_KINDS: readonly string[] = ["hon_shimei", "jonai_shimei", "dohan", "ext_shimei"];

/** 並び順の段（0 セット・VIP 加算／1 延長／2 指名群／3 支払手数料／4 商品／5 割引） */
export function lineRankOf(l: { kind: string; fee_kind?: string | null }): number {
  if (l.kind === "discount") return 5;
  const fk = l.fee_kind ?? null;
  if (fk === "extension") return 1;
  if (fk === "set" || fk === "vip_charge" || l.kind === "set") return 0;
  if (fk !== null && NOM_FEE_KINDS.includes(fk)) return 2;
  if (fk === "pay_fee") return 3;
  if (l.kind === "time" || l.kind === "charge") return 2;
  return 4;
}

/** 裁定391: 段→sort_order（注文順）の安定ソート。入力は変更しない */
export function orderLines<T extends OrderLine>(lines: readonly T[]): T[] {
  return lines.map((l, i) => ({ l, i })).sort((a, b) => lineRankOf(a.l) - lineRankOf(b.l) || (a.l.sort_order ?? a.i) - (b.l.sort_order ?? b.i) || a.i - b.i).map((x) => x.l);
}

/** 裁定391: 上段（セット・延長・指名＝kind set／time／charge）か商品か。discount はどちらでもない */
export function upperKindOf(kind: string): boolean { return kind === "set" || kind === "time" || kind === "charge"; }

/** 裁定391: 小計 2 行（daily_report_aggregate の set_ext_nom／products と同じ分類・discount は除外） */
export function twoClassSumsOf(lines: readonly { kind: string; line_total: number }[]): { upper: number; products: number } {
  let upper = 0, products = 0;
  for (const l of lines) { if (l.kind === "discount") continue; if (upperKindOf(l.kind)) upper += l.line_total; else products += l.line_total; }
  return { upper, products };
}

// ── 393 支払手数料 ─────────────────────────────────────────────────────────
export type PayFeeKey = "card" | "emoney" | "other";
export const PAY_FEE_KEYS: readonly PayFeeKey[] = ["card", "emoney", "other"];
export const PAY_FEE_KEY_LABEL: Record<PayFeeKey, string> = { card: "カード", emoney: "電子マネー", other: "その他" };
/** UI の新規店の初期値（DB は欠損キー＝0＝手数料なし・裁定393 追補1＝「既定 10%」の置き場） */
export const PAY_FEE_NEW_STORE_DEFAULT: Record<PayFeeKey, number> = { card: 10, emoney: 0, other: 0 };

/** レジの支払方法（cash／card／emoney／qr／ar／other）→手数料キー。現金・売掛は対象外＝null。QR は 'other' */
export function payFeeKeyOf(method: string): PayFeeKey | null {
  if (method === "card") return "card";
  if (method === "emoney") return "emoney";
  if (method === "qr" || method === "other") return "other";
  return null;
}

/** 店設定 pay_fee_rates → 3 キー（整数 0〜100・欠損／不正＝0） */
export function payFeeRatesOf(settings: unknown): Record<PayFeeKey, number> {
  const sj = (settings ?? {}) as Record<string, unknown>;
  const o = (sj.pay_fee_rates ?? {}) as Record<string, unknown>;
  const pick = (k: PayFeeKey) => { const v = o[k]; return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : 0; };
  return { card: pick("card"), emoney: pick("emoney"), other: pick("other") };
}

/** 手数料＝round(入金額×率/100)（check_pay の v_fee と同式・率 0 は 0） */
export function payFeeOf(amount: number, rate: number): number {
  if (!(amount > 0) || !(rate > 0)) return 0;
  return Math.round((amount * rate) / 100);
}

/** ★便 X13-G W-25 ①: カードの手数料込み入金額（受取額）→ 残額への充当と手数料。
 *  充当＝受取額÷(1＋率)（check_pay の手数料と同じ四捨五入で「充当＋round(充当×率)＝受取額」になる額を優先）・残額まで・手数料＝受取額−充当。 */
export function cardGrossSplitOf(gross: number, balance: number, rate: number): { applied: number; fee: number } {
  const g = Math.max(0, Math.trunc(gross));
  if (!(rate > 0) || g <= 0) return { applied: Math.min(g, Math.max(0, balance)), fee: 0 };
  const c0 = Math.round((g * 100) / (100 + rate));
  const hit = [c0, c0 - 1, c0 + 1].find((c) => c > 0 && c + payFeeOf(c, rate) === g);
  const applied = Math.max(0, Math.min(hit ?? c0, Math.max(0, balance)));
  return { applied, fee: Math.max(0, g - applied) };
}
/** カードの手数料込み入金額の既定＝残額＋手数料 */
export const cardGrossDefaultOf = (balance: number, rate: number): number => (balance > 0 ? balance + payFeeOf(balance, rate) : 0);

/** 伝票行の印字名（check_pay と同じ） */
export function payFeeLineNameOf(key: PayFeeKey, rate: number): string {
  return `${key === "card" ? "カード手数料 " : key === "emoney" ? "電子マネー手数料 " : "決済手数料 "}${rate}%`;
}

/** 入金モーダルの 1 行（率 0 は null＝非表示）。お客様からもらう額＝入金額＋手数料（均等割りも手数料込み） */
export function payFeeNoteOf(method: string, amount: number, rates: Record<PayFeeKey, number>): { key: PayFeeKey; rate: number; fee: number; receive: number } | null {
  const key = payFeeKeyOf(method);
  if (!key) return null;
  const rate = rates[key];
  if (!(rate > 0)) return null;
  const fee = payFeeOf(amount, rate);
  return { key, rate, fee, receive: amount + fee };
}

// ── 386 途中合流 ───────────────────────────────────────────────────────────
export type JoinMode = "join_set" | "extend_only";
export const JOIN_MODE_LABEL: Record<JoinMode, string> = { join_set: "合流セット（既定）", extend_only: "延長のみ" };
export function joinModeOf(settings: unknown): JoinMode {
  const v = ((settings ?? {}) as Record<string, unknown>).join_mode;
  return v === "extend_only" ? "extend_only" : "join_set";
}
/** セット行の注記（checks.set_frozen＝セット終了後に人数が変わった伝票） */
export function setFrozenNoteOf(frozen: boolean | null | undefined): string | null {
  return frozen ? "確定（セット終了後の人数変更＝セット料金は引き直しません）" : null;
}

// ── 389 キャストのレジ端末 ─────────────────────────────────────────────────
export type CastRegisterDevice = "store_device" | "own_phone";
export const CAST_REGISTER_DEVICE_LABEL: Record<CastRegisterDevice, string> = { store_device: "店端末のみ", own_phone: "自分のスマホからも" };
export function castRegisterDeviceOf(settings: unknown): CastRegisterDevice {
  const v = ((settings ?? {}) as Record<string, unknown>).cast_register_device;
  return v === "own_phone" ? "own_phone" : "store_device";
}
/** キャスト本人のセッション（スマホ）から /register を通すか＝店 ON ∧ 本人 can_register ∧（自分のスマホからも ∨ 店端末（purpose 'register'）が未登録＝「自分のスマホ扱い」） */
export function castOwnSessionRegisterOf(i: { enabled: boolean; canRegister: boolean; device: CastRegisterDevice; registerDevices: number }): boolean {
  if (!i.enabled || !i.canRegister) return false;
  return i.device === "own_phone" || i.registerDevices === 0;
}
// ★便 M5 M-40 (c)（2026-10-30）: 通さない理由＝castOwnSessionRegisterOf と同じ判定を理由語で返す（null＝通す）。layout が /mine?denied=register&why=… に載せ、/mine が和文で出す（従来の黙ったリダイレクトをやめる）。
//   store_off＝店がキャストのレジ操作を使わない／not_allowed＝本人の can_register が false／store_device_only＝店端末のみ（登録済みのレジ端末あり）。
//   ※ 0190 の打刻ゲート（'off duty'＝「出勤してからレジを開けます」）は register-board 内の RPC エラー＝別経路（ここでは扱わない）。
export type CastRegisterDenyReason = "store_off" | "not_allowed" | "store_device_only";
export function castRegisterDenyReasonOf(i: { enabled: boolean; canRegister: boolean; device: CastRegisterDevice; registerDevices: number }): CastRegisterDenyReason | null {
  if (!i.enabled) return "store_off";
  if (!i.canRegister) return "not_allowed";
  if (i.device === "store_device" && i.registerDevices > 0) return "store_device_only";
  return null;
}
export const CAST_REGISTER_DENY_TEXT: Record<CastRegisterDenyReason, string> = {
  store_off: "この店ではキャストのレジ操作は使いません",
  not_allowed: "レジの操作が許可されていません（店に確認してください）",
  store_device_only: "レジは店の端末からだけ使えます",
};
/** URL の why（任意の文字列）→ 和文。知らない語／空は null（何も出さない） */
// ★便 M5 M-44（2026-10-30）: /mine のナビに「レジ」を出す条件＝店「キャストのレジ使用 ON」∧「自分のスマホからも」（∨ レジ端末が未登録）∧ 本人の許可 ∧（店の打刻ゲート ON なら）出勤中。
//   揃わないときは /mine の上部に理由を 1 行（店が許可していない／本人の許可がない／店の端末からだけ／出勤してから）。本人の許可の置き場＝マスタ › キャスト待遇 › レジ会計（set_cast_register・既存＝新設しない）。
//   出勤中＝当日営業日の自分の打刻（punchStateOf＝'open'）＝0190 の打刻ゲート（assert_on_duty）と同じ材料。duty_gate OFF の店は出勤を見ない（従来どおり）。
export type CastMineRegisterReason = CastRegisterDenyReason | "off_duty";
export const CAST_MINE_REGISTER_NOTE: Record<CastMineRegisterReason, string> = {
  store_off: "レジ：店が許可していない（この店ではキャストのレジ操作は使いません）",
  not_allowed: "レジ：本人の許可がない（店が マスタ › キャスト待遇 › レジ会計 で許可すると使えます）",
  store_device_only: "レジ：店の端末からだけ使えます（自分のスマホからは開けません）",
  off_duty: "レジ：出勤してから（出勤の打刻の後にナビに出ます）",
};
export type CastMineRegisterNav = { show: boolean; reason: CastMineRegisterReason | null; note: string | null };
export function castMineRegisterNavOf(i: { reason: CastRegisterDenyReason | null; dutyGate: boolean; onDuty: boolean }): CastMineRegisterNav {
  if (i.reason) return { show: false, reason: i.reason, note: CAST_MINE_REGISTER_NOTE[i.reason] };
  if (i.dutyGate && !i.onDuty) return { show: false, reason: "off_duty", note: CAST_MINE_REGISTER_NOTE.off_duty };
  return { show: true, reason: null, note: null };
}
export const castRegisterDenyTextOf = (why: string | null | undefined): string | null => (why && Object.prototype.hasOwnProperty.call(CAST_REGISTER_DENY_TEXT, why) ? CAST_REGISTER_DENY_TEXT[why as CastRegisterDenyReason] : null);

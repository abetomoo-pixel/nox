// ★0201b の前提・Agoora の確定（2026-11-11）: 店舗設定「売掛を使う」の書き手を set_store_receivable_policy の 1 本に。
//   OFF→disabled・ON→customer_only（お客様の売掛だけ＝キャストに負担させない）・すでに cast_liability_allowed の店は ON のまま列を変えない。
//   キャストに負担させる設定は、オーナーが別の欄で明示したときだけ（その欄の案はレーン 3 の読取＝docs/tmp/lane3_1112.md）。
//   0201b の前（MIG_0201B_APPLIED=false）は RPC が settings_json.ar_enabled（売掛の正本＝ar_policy_ok が読む）を書かない＝ar_enabled も set_store_profile で書く（2 つ）。
export type ReceivablePolicy = "disabled" | "customer_only" | "cast_liability_allowed";

/** スイッチの ON／OFF → 列の値（今の値が cast_liability_allowed で ON のままなら変えない） */
export function receivablePolicyOfSwitch(on: boolean, current: string | null | undefined): ReceivablePolicy {
  if (!on) return "disabled";
  return current === "cast_liability_allowed" ? "cast_liability_allowed" : "customer_only";
}

/** 書く手順（0201b の前後）＝RPC の呼び出しの並び */
export type ReceivableSwitchCall = { fn: string; args: Record<string, unknown>; okIfBadKey?: boolean };
/** 0201b の手貼りからフラグ便までの間＝2 つ目（set_store_profile の ar_enabled）は 'bad key' になる＝0201b が適用済み（1 つ目の RPC が ar_enabled も書いた）ので成功として扱う（okIfBadKey） */
export const receivableBadKeyIsOk = (call: ReceivableSwitchCall, message: string | null | undefined): boolean => !!call.okIfBadKey && /bad key/.test(message ?? "");
export function receivableSwitchCallsOf(on: boolean, current: string | null | undefined, after0201b: boolean): ReceivableSwitchCall[] {
  const policy = receivablePolicyOfSwitch(on, current);
  const calls: ReceivableSwitchCall[] = [{ fn: "set_store_receivable_policy", args: { p_policy: policy } }];
  if (!after0201b) calls.push({ fn: "set_store_profile", args: { p_patch: { ar_enabled: on } }, okIfBadKey: true });
  return calls;
}

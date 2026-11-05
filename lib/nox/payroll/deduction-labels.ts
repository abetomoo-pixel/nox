// ★0195（M-73・裁定447 差し替え版・2026-11-05）: 控除ルールの単位・種別・日ごとの既定の日本語（純関数・DB を知らない）。
//   単位 4＝日ごと／月ごと／報酬の%（pay_rate＝その月の支払額（源泉の前）に対する率）／売上の%（rate＝本人の売上に対する率）。
//   種別＝キャストの画面では 実費（agreed_cost）／その他（other）の 2 択だけ。「法定控除」「不就労分」などは内部の値を残し表示は「その他」（制裁＝sanction は二層ガードの印として残す）。
export const DED_PER_JA: Record<string, string> = { day: "日ごと", month: "月ごと", pay_rate: "報酬の%", rate: "売上の%" };
export const DED_PER_NOTE: Record<string, string> = {
  day: "出勤した日ごとに引きます（毎出勤に引く／その日に選ぶ）",
  month: "月に 1 回引きます",
  pay_rate: "その月の支払額（源泉の前の総額）に対する率で引きます",
  rate: "本人の売上に対する率で引きます（カード手数料の負担など）",
};
export const DED_PER_OPTS_0195 = [["day", DED_PER_JA.day], ["month", DED_PER_JA.month], ["pay_rate", DED_PER_JA.pay_rate], ["rate", DED_PER_JA.rate]] as const;
export const DED_KIND_CAST_JA: Record<string, string> = { agreed_cost: "実費", other: "その他" };
export const DED_KIND_CAST_OPTS = [["agreed_cost", "実費（ヘアメ・衣装・ロッカー・送りなど）"], ["other", "その他（店の任意の項目）"]] as const;
/** キャストの控除マスタでの種別の表示＝agreed_cost→実費・other→その他・sanction は従来の語（二層ガード）・それ以外（statutory／unworked／store_receivable／advance_settlement）→その他 */
export const dedKindCastLabelOf = (kind: string | null | undefined, legacyLabel?: string): string =>
  kind === "sanction" ? (legacyLabel ?? "制裁（懲戒減給）") : kind === "agreed_cost" ? DED_KIND_CAST_JA.agreed_cost : DED_KIND_CAST_JA.other;
export const DAY_RULE_JA: Record<string, string> = { always: "毎出勤に引く", pick: "その日に選ぶ" };
export const DAY_RULE_OPTS = [["always", DAY_RULE_JA.always], ["pick", DAY_RULE_JA.pick]] as const;
export const DAY_RULE_NOTE = "毎出勤に引く＝出勤した日は自動で引きます（その日だけ外せます）／その日に選ぶ＝付けた日だけ引きます";
/** 単位の表示（日ごとは既定も添える） */
export const dedUnitLabelOf = (per: string, dayRule?: string | null): string => (per === "day" ? `${DED_PER_JA.day}・${DAY_RULE_JA[dayRule ?? "always"] ?? DAY_RULE_JA.always}` : (DED_PER_JA[per] ?? per));
/** 額の表示（率は %） */
export const dedAmountLabelOf = (per: string, amount: number): string => (per === "rate" || per === "pay_rate" ? `${amount}%` : `¥${Number(amount).toLocaleString("en-US")}`);
/** 一覧の「対象」＝キャスト別の適用（行が無い＝全員・使わないにした人がいれば ◯名） */
export const dedTargetLabelOf = (rows: readonly { rule_id: string; enabled: boolean; amount_override: number | null }[], ruleId: string, castCount: number): string => {
  const mine = rows.filter((r) => r.rule_id === ruleId);
  const excluded = mine.filter((r) => !r.enabled).length;
  const overrides = mine.filter((r) => r.enabled && r.amount_override != null).length;
  const head = excluded === 0 ? "全員" : `${Math.max(0, castCount - excluded)}名`;
  return overrides > 0 ? `${head}（額の上書き ${overrides}）` : head;
};

// ★便 B M-70（2026-11-04・Agoora）: 延長シミュレーション＝延長 1〜3 回後の合計の純関数。DB を知らない。
//   合計＝会計と同じ関数（groupDueFull）に延長行（kind time・fee_kind extension・line_total＝単価×人数・taxable_10）を n 本足した値
//   ＝check_extension_add が実際に足す行と同じ形（verify:nox-m70 で 1〜3 回足した伝票の合計と 1 円もズレないことを確かめる）。
//   単価・延長単位は伝票の凍結値（checks.ext_fee／ext_min）・人数制（time_per 'person'）は人数倍。自動店は実時計の回数から・手動店は追加済みの回数からの続き。
import { groupDueFull, type CheckDueSettings, type DueLine } from "@/lib/nox/check-calc";

export const EXT_ESTIMATE_MAX = 3;

export type ExtEstimateRow = {
  n: number;          // 延長回数（累計＝今の回数＋1〜3）
  endAtMs: number;    // その延長の終了時刻
  add: number;        // 加算（前の行との差＝税・サービス料・丸め込み）
  total: number;      // 合計（税サ込）＝groupDueFull
  perPerson: number | null; // 1 人あたり（人数割りの店＝time_per 'person' で人数 2 以上・切り上げ）・それ以外 null
};

export type ExtEstimateInput = {
  lines: readonly DueLine[];      // 伝票の行（グループ A）
  settings: CheckDueSettings;     // 伝票の凍結値（dueSettingsOf 済み）
  referralCustomer: number;       // 客負担の紹介料（A のみ）
  extAmount: number;              // 延長単価（checks.ext_fee）
  extMin: number;                 // 延長単位（checks.ext_min）
  units: number;                  // 人数制なら人数・卓なら 1
  people: number | null;          // 伝票の人数
  perPerson: boolean;             // 人数割りの店（time_per 'person'）
  baseBlocks: number;             // 今の延長回数（自動＝実時計の blocks・手動＝追加済みの行数）
  startedAtMs: number;            // 着席
  setMin: number;                 // セット時間（checks.set_min）
  max?: number;
};

/** 延長 1 回ぶんの行＝check_extension_add と同じ形 */
export const extEstimateLineOf = (extAmount: number, units: number): DueLine => ({ kind: "time", fee_kind: "extension", line_total: extAmount * Math.max(1, units), tax_category: "taxable_10" });

export function extEstimateRowsOf(p: ExtEstimateInput): ExtEstimateRow[] {
  const max = Math.max(1, Math.min(EXT_ESTIMATE_MAX, p.max ?? EXT_ESTIMATE_MAX));
  const rows: ExtEstimateRow[] = [];
  let prev = groupDueFull([...p.lines], p.settings, p.referralCustomer);
  for (let i = 1; i <= max; i++) {
    const extra = Array.from({ length: i }, () => extEstimateLineOf(p.extAmount, p.units));
    const total = groupDueFull([...p.lines, ...extra], p.settings, p.referralCustomer);
    const n = p.baseBlocks + i;
    rows.push({
      n,
      endAtMs: p.startedAtMs + (p.setMin + n * p.extMin) * 60_000,
      add: total - prev,
      total,
      perPerson: p.perPerson && p.people != null && p.people >= 2 ? Math.ceil(total / p.people) : null,
    });
    prev = total;
  }
  return rows;
}

/** 手動店の「追加済みの回数」＝延長の行数（人数制でも 1 回＝1 行） */
export const extAddedBlocksOf = (lines: readonly { fee_kind?: string | null }[]): number => lines.filter((l) => l.fee_kind === "extension").length;

/** 終了時刻の表示（翌日は「翌」） */
export function extEstimateEndLabelOf(endAtMs: number, startedAtMs: number): string {
  const d = new Date(endAtMs + 9 * 3600_000), s = new Date(startedAtMs + 9 * 3600_000);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return d.getUTCDate() !== s.getUTCDate() ? `翌${hm}` : hm;
}

/** ★Agoora 指摘（2026-11-04 20:59）: 伝票の凍結メニュー（ext_menu_snap＝平日通常／週末通常／VIP 延長…）の全行についてそれぞれ見積を出す。snap が無い（旧伝票）は伝票の既定（ext_fee／ext_min）1 つ。current＝今の既定パターン（ext_rule_id・無ければ額と分の一致） */
export type ExtSnapLike = { rule_id: string; duration_min: number; amount: number; label: string; is_default?: boolean };
export type ExtEstimatePattern = { key: string; label: string; extMin: number; extAmount: number; isDefault: boolean; current: boolean; rows: ExtEstimateRow[] };
export function extEstimatePatternsOf(snap: readonly ExtSnapLike[] | null | undefined, cur: { extMin: number; extAmount: number; ruleId?: string | null }, base: Omit<ExtEstimateInput, "extAmount" | "extMin">): ExtEstimatePattern[] {
  const items = (snap ?? []).filter((m) => m.duration_min > 0 && m.amount >= 0);
  if (items.length === 0) {
    if (cur.extMin <= 0 || cur.extAmount <= 0) return [];
    return [{ key: "default", label: `延長 ${cur.extMin}分`, extMin: cur.extMin, extAmount: cur.extAmount, isDefault: true, current: true, rows: extEstimateRowsOf({ ...base, extAmount: cur.extAmount, extMin: cur.extMin }) }];
  }
  const curKey = cur.ruleId && items.some((m) => m.rule_id === cur.ruleId) ? cur.ruleId : (items.find((m) => m.amount === cur.extAmount && m.duration_min === cur.extMin)?.rule_id ?? null);
  return items.map((m) => ({ key: m.rule_id, label: m.label, extMin: m.duration_min, extAmount: m.amount, isDefault: m.is_default === true, current: m.rule_id === curKey, rows: extEstimateRowsOf({ ...base, extAmount: m.amount, extMin: m.duration_min }) }));
}

/** ★M-83（裁定454 の 4・2026-11-05）: パターン見出しの「30 分あたり ¥X／人」＝extAmount×30÷extMin（円未満は四捨五入・1 人あたり＝単価は人数制の 1 人ぶん） */
export const extPer30Of = (extAmount: number, extMin: number): number => (extMin > 0 ? Math.round((extAmount * 30) / extMin) : 0);
export const extPer30TextOf = (extAmount: number, extMin: number, perPerson: boolean): string => `30 分あたり ¥${extPer30Of(extAmount, extMin).toLocaleString("en-US")}${perPerson ? "／人" : ""}`;
export const EXT_ESTIMATE_TITLE = "延長の見積";
export const EXT_ESTIMATE_NOTE = "伝票の料金表（開いた時点の凍結値）と今の明細から、延長を足したときの合計（税・サービス料・丸め込み）です。";

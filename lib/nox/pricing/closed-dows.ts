// ★M-144（2026-11-10 Agoora 要望）: 定休日と料金ルールの曜日（DB を知らない純関数）。
//   ③ 定休日を後から変えたら料金ルールからその曜日を外す＝外したルール名を 1 行で知らせる。
//   曜日が空になるルールは DB の check（dow_mask between 1 and 127）に入らない＝マスタでは外さずに名前を返す
//   （料金設定で直す）・初期設定（v5）では曜日を空にして確認画面の要確認「曜日が無いルール」に出す。
//   ★dow_mask＝bit0 月 … bit6 日（pricing_biz の biz_dow＝isodow−1・設計書 v1_2）・null＝毎日。
//   ★営業時間（store_business_hours.dow）と必要人数・シフトの曜日は 0 日 … 6 土＝**並びが違う**。比べる前に maskBitOfBizDow で変換する
//   （2026-11-11: 変換せずに比べて、日曜定休の店で「月」を定休として外していた＝M-144 の直し）。
/** 営業時間の曜日（0 日 … 6 土）→ dow_mask の bit（0 月 … 6 日） */
export const maskBitOfBizDow = (dow: number): number => (dow + 6) % 7;
/** 曜日の名前（日〜土・月〜日のどちらでも）→ dow_mask の bit */
export const MASK_DOW_JA = ["月", "火", "水", "木", "金", "土", "日"] as const;
export const maskBitOfJa = (d: string): number => MASK_DOW_JA.indexOf(d as typeof MASK_DOW_JA[number]);

export const ALL_DOWS_MASK = 127;

/** 定休日の曜日を外した dow_mask（0＝曜日が残らない）。null（毎日）は営業日だけの mask にする。 */
export function maskWithoutClosed(mask: number | null, closed: readonly number[]): number {
  let m = mask ?? ALL_DOWS_MASK;
  for (const d of closed) m &= ~(1 << d);
  return m;
}

/** 新しい帯の既定の曜日（定休日以外）。 */
export function openDaysOf(closed: readonly number[]): boolean[] {
  return Array.from({ length: 7 }, (_, i) => !closed.includes(i));
}

/** 選んだ曜日から dow_mask。営業日（定休日以外）を全部選んだら null＝毎日（定休日に臨時営業したときも当たる・今の挙動のまま）。 */
export function maskOfDays(days: readonly boolean[], closed: readonly number[]): number | null {
  const m = days.reduce((acc, on, i) => (on && !closed.includes(i) ? acc | (1 << i) : acc), 0);
  return m === maskWithoutClosed(null, closed) ? null : m;
}

export type StripRule = { id: string; name: string | null; dow_mask: number | null; is_active?: boolean };
export type StripPlan = {
  /** dow_mask を書き換えるルール（id と新しい mask） */
  change: Array<{ id: string; name: string; from: number | null; to: number }>;
  /** 曜日が定休日だけ＝外すと空になるので外さないルール */
  empty: string[];
};

/** マスタ（営業時間の保存）用：定休日になった曜日を含むルールの書き換え案。
 *  null（毎日）のルールは触らない＝店の既定の行（pricing-board の「曜日・席・時間なし」）を壊さない・臨時営業の日にも当たる。 */
export function stripClosedDowsPlan(rules: readonly StripRule[], closed: readonly number[], nameOf: (r: StripRule) => string = (r) => r.name ?? "（名前なし）"): StripPlan {
  const change: StripPlan["change"] = []; const empty: string[] = [];
  if (!closed.length) return { change, empty };
  for (const r of rules) {
    if (r.dow_mask === null) continue;
    const next = maskWithoutClosed(r.dow_mask, closed);
    const cur = r.dow_mask;
    if (next === cur) continue;
    if (next === 0) { empty.push(nameOf(r)); continue; }
    change.push({ id: r.id, name: nameOf(r), from: r.dow_mask, to: next });
  }
  return { change, empty };
}

/** 初期設定（v5）用：ルールの曜日（"日"〜"土"）から定休日を外す。外したルール名と曜日が空になったルール名を返す。 */
export function stripHolidaysFromV5Rules<T extends { name: string; days: string[] }>(rules: T[], holidays: readonly string[]): { rules: T[]; touched: string[]; emptied: string[] } {
  const touched: string[] = []; const emptied: string[] = [];
  const out = rules.map((r) => {
    const days = r.days.filter((d) => !holidays.includes(d));
    if (days.length === r.days.length) return r;
    touched.push(r.name);
    if (!days.length) emptied.push(r.name);
    return { ...r, days };
  });
  return { rules: out, touched, emptied };
}

/** 1 行の知らせ（外したルール名）。 */
export function stripNoticeOf(touched: readonly string[], emptied: readonly string[] = [], keptEmpty: readonly string[] = []): string | null {
  const parts: string[] = [];
  if (touched.length) parts.push(`定休日の曜日を料金ルールから外しました：${touched.join("、")}`);
  if (emptied.length) parts.push(`曜日が無いルール：${emptied.join("、")}（料金で曜日を選んでください）`);
  if (keptEmpty.length) parts.push(`定休日の曜日だけのルールは外していません：${keptEmpty.join("、")}（料金設定で曜日を直してください）`);
  return parts.length ? parts.join("／") : null;
}

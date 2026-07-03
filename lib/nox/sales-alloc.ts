/* cast 日次売上の按分（台帳 #21・精密仕様 §7-1）の TS 鏡像。
 *
 * ★verify 専用の建付け（check-calc.ts と同型）。UI も payroll もこの関数では計算しない。
 *   按分の正は DB の cast_sales_aggregate（F2a plan 裁定 D7a）。verify:nox-rls が同一ゴールデン
 *   伝票で DB 返却値との完全一致を assert する（TS/DB 同値保証の3例目＝check-calc/biz-date に続く）。
 *
 * 金額の丸めは一切しない＝整数分配のみ（最大剰余法は div/mod の整数演算・浮動小数を経由しない）。
 * したがって money.ts（roundYen/floor 差替）の対象外。group due そのものは呼び出し側が
 * check-calc.ts の groupDue（＝DB check_group_due 鏡像）で用意して渡す前提。
 *
 * 規則（§7-1・DB 実装と一字対応）:
 *  - SL1a 帰属: 在席 nomination 全員に weight 按分・円は最大剰余法（剰余降順→position 昇順タイブレーク）。
 *  - SL4a フリー卓: noms 空の伝票は非帰属（allocDue を呼ばない）。
 *  - SL8a カウント: hon/jonai/dohan は伝票単位（同一伝票内の同 cast 同 nom_type は1）。
 */

export type AllocNom = { castId: string; weight: number; position: number };

export type AllocCheck = {
  checkId: string;
  bizDate: string; // 呼び出し側で bizDateOf 済み（biz-date.ts が正本）
  nomType: "hon" | "jonai" | "dohan" | "free";
  groupDues: { payGroup: string; due: number }[]; // check-calc.ts の groupDue と同値
  noms: AllocNom[]; // 空＝フリー卓（非帰属）
};

export type CastDaySales = {
  castId: string;
  bizDate: string;
  sales: number;
  hon: number;
  jonai: number;
  dohan: number;
};

/**
 * 最大剰余法の単体：due を weight で按分し Σ(part) === due を恒等保証。
 * base=floor(due×w / W)・rem=(due×w) mod W。剰余降順→position 昇順で R=due−Σbase 件に +1。
 * DB cast_sales_aggregate の alloc/ranked CTE と同一（整数演算のみ）。
 */
export function allocDue(due: number, noms: AllocNom[]): { castId: string; part: number }[] {
  const W = noms.reduce((s, n) => s + n.weight, 0);
  if (due <= 0 || W <= 0) return noms.map((n) => ({ castId: n.castId, part: 0 }));
  const rows = noms.map((n) => {
    const num = due * n.weight;
    return { castId: n.castId, position: n.position, base: Math.floor(num / W), rem: num % W };
  });
  const R = due - rows.reduce((s, r) => s + r.base, 0);
  // 剰余降順→position 昇順で上位 R 件に +1
  const order = [...rows].sort((a, b) => (b.rem - a.rem) || (a.position - b.position));
  const bump = new Set(order.slice(0, R).map((r) => r.castId));
  return rows.map((r) => ({ castId: r.castId, part: r.base + (bump.has(r.castId) ? 1 : 0) }));
}

/** 期間集計：closed 非 void の伝票列 → (cast, bizDate) 行。SL8a カウント同居（D9a）。 */
export function allocCastSales(checks: AllocCheck[]): CastDaySales[] {
  // キー = castId|bizDate
  const acc = new Map<string, CastDaySales>();
  const touch = (castId: string, bizDate: string): CastDaySales => {
    const key = `${castId}|${bizDate}`;
    let row = acc.get(key);
    if (!row) {
      row = { castId, bizDate, sales: 0, hon: 0, jonai: 0, dohan: 0 };
      acc.set(key, row);
    }
    return row;
  };

  for (const chk of checks) {
    if (chk.noms.length === 0) continue; // SL4a フリー卓＝非帰属
    // 売上按分（group ごとに最大剰余法・cast へ加算）
    for (const g of chk.groupDues) {
      if (g.due <= 0) continue;
      for (const { castId, part } of allocDue(g.due, chk.noms)) {
        if (part !== 0) touch(castId, chk.bizDate).sales += part;
      }
    }
    // SL8a カウント（伝票単位・在席 cast 全員に nomType のカウントを1）
    for (const nm of chk.noms) {
      const row = touch(nm.castId, chk.bizDate);
      if (chk.nomType === "hon") row.hon += 1;
      else if (chk.nomType === "jonai") row.jonai += 1;
      else if (chk.nomType === "dohan") row.dohan += 1;
    }
  }

  // DB は order by biz_date, cast_id。鏡像も揃える。
  return [...acc.values()].sort(
    (a, b) => (a.bizDate < b.bizDate ? -1 : a.bizDate > b.bizDate ? 1 : a.castId < b.castId ? -1 : a.castId > b.castId ? 1 : 0),
  );
}

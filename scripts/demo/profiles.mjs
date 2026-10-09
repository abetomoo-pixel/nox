// ★便 X-13c（2026-10-09・X-13-15／16）: デモ 6 店の差別化＝1 店 1 プロファイル（仮決め＝docs/demo/store_profiles_20261009.md の表と対・Agoora の赤入れで X-13d）。
//   gen-demo.mjs（payload 生成）と verify-nox-demo-profiles.ts（6 店の設定が表どおりの pin）が同じ定数を読む。
//   軸: template（331 の 5 種・キャバクラは LUNA／ACE の 2 店で規模違い）／sys（報酬制度の ON/OFF）／back（率％型 3 店・4 段階型 3 店）／price（価格帯の札）／
//       basis（勤務時間の計算基準）／okuri（送りの基本額 0＝なし）／receivable（売掛）／reopen（締め解除フロー）／confirm（キャスト確認）／shift（必要人数と充足・不足の型）。
export const PROFILES = {
  muse: { template: "snack", scale: "小（キャスト 5・月 281 伝票・客単価 1.1 万）", sys: { hourly: true, backs: true, norms: false, bonus: false, points: false, sales_slide: false },
    back: "rate", rate: { cast: 30, champ: 20, bottle: 15, glass: 15, soft: 10, food: 10 }, price: "低（セット 5,500・指名なし・シャンパン 8,800〜16,500）",
    basis: "punch", okuri: 0, receivable: "disabled", reopen: false, confirm: false,
    shift: { base: 3, fri_sat: 4, fill: "full", pattern: [3, 3, 4, 3, 4, 4, 3] } },
  luna: { template: "cabaret", scale: "中（キャスト 7・月 462 伝票・客単価 1.7 万）", sys: { hourly: true, backs: true, norms: true, bonus: true, points: false, sales_slide: false },
    back: "unit4", u4: { hon: 0.10, jonai: 0.08, dohan: 0.08, free: 0.05 }, u4cast: { hon: 500, jonai: 400, dohan: 400, free: 300 }, food: false, price: "中（セット 4,500〜6,500・指名 3,000・シャンパン 11,000〜66,000）",
    basis: "punch", okuri: 1000, receivable: "customer_only", reopen: true, confirm: false,
    shift: { base: 4, fri_sat: 5, fill: "full", pattern: [4, 4, 5, 4, 5, 5, 4] } },
  noir: { template: "lounge", scale: "大（キャスト 8・月 506 伝票・客単価 2.7 万＝最高価格帯）", sys: { hourly: true, backs: true, norms: true, bonus: false, points: true, sales_slide: false },
    back: "unit4", u4: { hon: 0.12, jonai: 0.10, dohan: 0.10, free: 0.06 }, u4cast: { hon: 600, jonai: 500, dohan: 500, free: 300 }, food: false, price: "高（セット 8,000〜14,000・指名 3,000〜5,000・シャンパン 16,500〜165,000）",
    basis: "shift", okuri: 1500, receivable: "customer_only", reopen: true, confirm: true,
    shift: { base: 5, fri_sat: 6, fill: "short", pattern: [4, 5, 3, 5, 4, 6, 5] } },
  ace: { template: "cabaret", scale: "大（キャスト 7・月 485 伝票・客単価 1.9 万＝キャバクラの 2 店目・規模違い）", sys: { hourly: true, backs: true, norms: false, bonus: true, points: false, sales_slide: true },
    back: "unit4", u4: { hon: 0.10, jonai: 0.08, dohan: 0.08, free: 0.05 }, u4cast: { hon: 500, jonai: 400, dohan: 400, free: 300 }, food: false, price: "中〜高（セット 7,000〜8,000・指名 3,000・シャンパン 11,000〜110,000）",
    basis: "punch", okuri: 1000, receivable: "customer_only", reopen: true, confirm: true,
    shift: { base: 4, fri_sat: 5, fill: "short", pattern: [3, 4, 4, 2, 5, 3, 4] } },
  lily: { template: "girlsbar", scale: "中（キャスト 6・月 594 伝票・客単価 1.0 万）", sys: { hourly: true, backs: true, norms: true, bonus: false, points: false, sales_slide: false },
    back: "rate", rate: { cast: 25, champ: 20, bottle: 15, glass: 15, soft: 10, food: 0 }, price: "低（チャージ 3,300〜3,850・指名なし・シャンパン 8,800〜22,000）",
    basis: "shift", okuri: 0, receivable: "disabled", reopen: false, confirm: false,
    shift: { base: 3, fri_sat: 4, fill: "full", pattern: [3, 3, 3, 4, 4, 4, 3] } },
  nest: { template: "bar", scale: "小（キャスト 5・月 507 伝票・客単価 0.8 万）", sys: { hourly: true, backs: true, norms: false, bonus: false, points: false, sales_slide: false },
    back: "rate", rate: { cast: 20, champ: 15, bottle: 10, glass: 10, soft: 5, food: 0 }, price: "低（テーブルチャージ 1,100・指名なし・シャンパン 8,800〜16,500）",
    basis: "punch", okuri: 0, receivable: "disabled", reopen: false, confirm: false,
    shift: { base: 3, fri_sat: 4, fill: "short", pattern: [2, 3, 2, 3, 3, 4, 2] } },
};
export const PROFILE_CODES = Object.keys(PROFILES);
/** ★X-13-21（便 X-13d-1・仮決め）: 待遇プランが 1 本だけの店に 2〜3 本目を足す（源泉 nox_demo_all.json の compensation_plans は不変＝gen-demo が末尾に足し、キャストは順番に割り振る）。
 *  NOIR は源泉で 3 本・LILY は源泉 1 本（live の 3 本中 2 本はデモ内で手入力されたもの＝reset で消える）・ACE は源泉 1 本（売上スライド）のまま＝相談役ブロック「ACE はプラン 0 のまま（仕様）」に合わせ据え置き（実体は 1 本）。 */
/** ★X-13-26（便 X-13d-2a・仮決め）: 代表キャストの前借り（先月の中旬＝{$m:-1,d:15}・open）＝先月分の確定（finalize hook）で天引き済み・当月に繰越なし。0＝入れない */
export const ADVANCES = { muse: 50000, luna: 30000, noir: 30000, ace: 30000, lily: 30000, nest: 30000 };
export const EXTRA_PLANS = {
  muse: [{ key: "senior", name: "MUSE Senior", base: 2000, hon: 500, jonai: 300, dohan: 300 }],
  luna: [{ key: "premium", name: "LUNA Premium", base: 3500, hon: 1000, jonai: 500, dohan: 500 }, { key: "rookie", name: "LUNA 新人", base: 2500, hon: 500, jonai: 300, dohan: 300 }],
  noir: [], ace: [],
  lily: [{ key: "senior", name: "LILY Senior", base: 2200, hon: 300, jonai: 200, dohan: 200 }],
  nest: [{ key: "senior", name: "NEST Senior", base: 1800, hon: 300, jonai: 200, dohan: 200 }],
};
/** sys_* 9 キー（stores.settings_json）＝PROFILES.sys から。sales_rate／point_slide／penalties は全店 false */
export function sysSettingsOf(code) {
  const s = PROFILES[code].sys;
  return { sys_hourly: !!s.hourly, sys_backs: !!s.backs, sys_sales_rate: false, sys_points: !!s.points, sys_sales_slide: !!s.sales_slide, sys_point_slide: false, sys_norms: !!s.norms, sys_penalties: false, sys_bonus: !!s.bonus };
}
/** 商品の分類（gen-demo の行＝type／category）→ バック表の鍵 */
export function backKeyOf(row) {
  if (row.type === "champ") return "champ";
  if (row.type === "bottle") return "bottle";
  if (row.type === "food") return "food";
  if (row.type === "other") return "food";
  if (/キャスト|スタッフ/.test(row.category ?? "")) return "cast";
  if (/ソフト/.test(row.category ?? "")) return "soft";
  return "glass";
}
const r100 = (n) => Math.max(100, Math.round(n / 100) * 100);
/** 率％型: 銘柄別に ±2pt の差（10〜30 に収める）・0 は「—」。4 段階型: 価格×率を 100 円単位・キャストドリンクは定額・フードは 0（—） */
export function backOf(code, row, i) {
  const p = PROFILES[code];
  const key = backKeyOf(row);
  if (p.back === "rate") {
    const base = p.rate[key] ?? 0;
    if (base === 0) return { back_mode: "rate", back_value: 0, unit4_json: null };
    const v = Math.min(30, Math.max(10, base + ((i % 3) - 1) * 2));
    return { back_mode: "rate", back_value: v, unit4_json: null };
  }
  if (key === "food" || (key !== "cast" && !(row.price > 0))) return { back_mode: "unit4", back_value: null, unit4_json: { hon: 0, jonai: 0, dohan: 0, free: 0 } };
  if (key === "cast") { const c = p.u4cast; const m = 1 + ((i % 3) - 1) * 0.2; return { back_mode: "unit4", back_value: null, unit4_json: { hon: r100(c.hon * m), jonai: r100(c.jonai * m), dohan: r100(c.dohan * m), free: r100(c.free * m) } }; }
  const m = 1 + ((i % 3) - 1) * 0.1;
  return { back_mode: "unit4", back_value: null, unit4_json: { hon: r100(row.price * p.u4.hon * m), jonai: r100(row.price * p.u4.jonai * m), dohan: r100(row.price * p.u4.dohan * m), free: r100(row.price * p.u4.free * m) } };
}

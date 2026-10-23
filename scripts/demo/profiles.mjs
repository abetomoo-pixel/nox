// ★便 X-13c（2026-10-09・X-13-15／16）: デモ 6 店の差別化＝1 店 1 プロファイル（仮決め＝docs/demo/store_profiles_20261009.md の表と対・Agoora の赤入れで X-13d）。
//   gen-demo.mjs（payload 生成）と verify-nox-demo-profiles.ts（6 店の設定が表どおりの pin）が同じ定数を読む。
//   軸: template（331 の 5 種・キャバクラは LUNA／ACE の 2 店で規模違い）／sys（報酬制度の ON/OFF）／back（率％型 3 店・4 段階型 3 店）／price（価格帯の札）／
//       basis（勤務時間の計算基準）／okuri（送りの基本額 0＝なし）／receivable（売掛）／reopen（締め解除フロー）／confirm（キャスト確認）／shift（必要人数と充足・不足の型）。
export const PROFILES = {
  muse: { template: "cabaret", attributeServing: true, nominations: true, scale: "小（キャスト 5・月 281 伝票・客単価 1.1 万）", sys: { hourly: true, backs: true, norms: true, bonus: false, points: false, sales_slide: true, point_slide: false, /* ★便 X13-H H-7（裁定412・348 追補）: MUSE は売上軸（pt のデモは NOIR） */ sales_rate: true }, // ★348 追補2（便 N1014 B-1／B-4）: 業態キャバクラ・指名 ON（源泉が指名なしのため gen-demo が本指名／場内／同伴を注入＝併用と売上歩合が 9 月で発火） // ★裁定348: 併用（売上段＋pt 段）＋売上歩合（商品バック plan_rate 10%）＋ノルマ 4 軸＋送り実費
    back: "rate", rate: { cast: 30, champ: 20, bottle: 15, glass: 15, soft: 10, food: 10 }, price: "低（セット 5,500・指名なし・シャンパン 8,800〜16,500）",
    basis: "punch", okuri: 1000, okuriMode: "actual", receivable: "disabled", reopen: false, confirm: false, normAxes: ["days", "dohan", "sales", "shimei"], employment: "委託", dailyPay: false, wishMode: "shift",
    showcase: "併用＝売上段と pt 段の高い方（pay.ts max）・売上歩合＝商品バック 10%・ノルマ 4 軸・送り実費",
    shift: { base: 3, fri_sat: 4, fill: "full", pattern: [3, 3, 4, 3, 4, 4, 3] } },
  luna: { template: "cabaret", scale: "中（キャスト 7・月 462 伝票・客単価 1.7 万）", sys: { hourly: true, backs: true, norms: true, bonus: false, points: false, sales_slide: true, point_slide: false }, // ★裁定348: 売上半月＋ドリンク区分別＋日数・同伴ノルマ＋送り定額（達成ボーナスは LILY へ）
    back: "unit4", u4: { hon: 0.10, jonai: 0.08, dohan: 0.08, free: 0.05 }, u4cast: { hon: 500, jonai: 400, dohan: 400, free: 300 }, food: false, price: "中（セット 4,500〜6,500・指名 3,000・シャンパン 11,000〜66,000）",
    basis: "punch", okuri: 1000, okuriMode: "flat", receivable: "customer_only", reopen: true, confirm: false, normAxes: ["days", "dohan"], employment: "委託", dailyPay: false, wishMode: "shift",
    showcase: "半月スライド（前半／後半の 2 行）・ドリンク区分別（本／場内／同伴／フリーの円）・日数・同伴ノルマ・送り定額 1,000",
    shift: { base: 4, fri_sat: 5, fill: "full", pattern: [4, 4, 5, 4, 5, 5, 4] } },
  noir: { template: "lounge", scale: "大（キャスト 8・月 506 伝票・客単価 2.7 万＝最高価格帯）", sys: { hourly: true, backs: true, norms: true, bonus: false, points: true, sales_slide: false, point_slide: true }, // ★裁定348: pt 月次・本指名件数・S／A＋商品 pt・指名バック＋指名ノルマ＋送りなし
    back: "unit4", u4: { hon: 0.12, jonai: 0.10, dohan: 0.10, free: 0.06 }, u4cast: { hon: 600, jonai: 500, dohan: 500, free: 300 }, food: false, price: "高（セット 8,000〜14,000・指名 3,000〜5,000・シャンパン 16,500〜165,000）",
    basis: "shift", okuri: 0, okuriMode: null, receivable: "customer_only", reopen: true, confirm: true, normAxes: ["shimei"], employment: "委託", dailyPay: false, wishMode: "shift",
    showcase: "ポイントスライド月次＋本指名の件数基準・対象 S／A（標準は対象外）・商品 pt・指名ノルマ・送りなし",
    shift: { base: 5, fri_sat: 6, fill: "short", pattern: [4, 5, 3, 5, 4, 6, 5] } },
  ace: { template: "cabaret", scale: "大（キャスト 7・月 485 伝票・客単価 1.9 万＝キャバクラの 2 店目・規模違い）", sys: { hourly: true, backs: true, norms: true, bonus: false, points: false, sales_slide: true }, // ★裁定348: 売上月次＋指名・商品バック＋売上・指名ノルマ＋送り実費（達成ボーナスは LILY へ）
    back: "unit4", u4: { hon: 0.10, jonai: 0.08, dohan: 0.08, free: 0.05 }, u4cast: { hon: 500, jonai: 400, dohan: 400, free: 300 }, food: false, price: "中〜高（セット 7,000〜8,000・指名 3,000・シャンパン 11,000〜110,000）",
    basis: "punch", okuri: 1000, okuriMode: "actual", receivable: "customer_only", reopen: true, confirm: true, normAxes: ["sales", "shimei"], employment: "委託", dailyPay: false, wishMode: "shift",
    slideApply: "next", /* ★便 P173（裁定395 追補1）: ACE のプランは前期の実績で当期の時給（ひなの 10 月＝¥3,500）。他 5 店は null＝店設定（current） */
    showcase: "月次売上スライド（前期の実績で判定・ひなの 10 月＝時給 ¥3,500）・指名・商品バック・売上・指名ノルマ・送り実費",
    shift: { base: 4, fri_sat: 5, fill: "short", pattern: [3, 4, 4, 2, 5, 3, 4] } },
  lily: { template: "girlsbar", attributeServing: true, scale: "中（キャスト 6・月 594 伝票・客単価 1.0 万）", sys: { hourly: true, backs: true, norms: true, bonus: true, points: false, sales_slide: false, wage_cut_rule: true /* ★便 SH-UI-a A-1: 雇用の店＝就業規則に減給の定めあり（I-5 ④の提案が出る） */ }, // ★裁定348: 雇用・確定シフト基準＋達成ボーナス＋日払い＋日数ノルマ＋送り店負担
    back: "rate", rate: { cast: 25, champ: 20, bottle: 15, glass: 15, soft: 10, food: 0 }, price: "低（チャージ 3,300〜3,850・指名なし・シャンパン 8,800〜22,000）",
    basis: "shift", okuri: 0, okuriMode: null, receivable: "disabled", reopen: false, confirm: false, normAxes: ["days", "sales"], /* ★348 追補2（B-2）: 達成ボーナスの目標＝売上（cast_norms.sales_target）のため sales も採用 */ employment: "雇用", dailyPay: true, wishMode: "shift",
    showcase: "雇用（源泉 0・確定シフト基準）・達成ボーナス 10,000・日払い 2 件（先月）＝明細で天引き・日数ノルマ・送り店負担（控除なし）",
    shift: { base: 3, fri_sat: 4, fill: "full", pattern: [3, 3, 3, 4, 4, 4, 3] } },
  nest: { template: "snack", scale: "小（キャスト 5・月 507 伝票・客単価 0.8 万）", /* ★348 追補2（B-4）: 業態スナック（旧 bar） */ sys: { hourly: true, backs: true, norms: false, bonus: false, points: false, sales_slide: false }, // ★裁定348: スライドなし・固定＋期限付き保証（期限切れ済み）＋ノルマなし・休み希望のみ＋送り定額
    back: "rate", rate: { cast: 20, champ: 15, bottle: 10, glass: 10, soft: 5, food: 0 }, price: "低（テーブルチャージ 1,100・指名なし・シャンパン 8,800〜16,500）",
    basis: "punch", okuri: 1000, okuriMode: "flat", receivable: "disabled", reopen: false, confirm: false, normAxes: [], employment: "委託", dailyPay: false, wishMode: "off_only",
    showcase: "スライドなし・固定時給・体験入店の保証時給は期限切れ済み（基本時給に戻る）・ノルマなし・店の既定＝休み希望のみ・送り定額 1,000",
    shift: { base: 3, fri_sat: 4, fill: "short", pattern: [2, 3, 2, 3, 3, 4, 2] } },
};
export const PROFILE_CODES = Object.keys(PROFILES);
/** ★X-13-21（便 X-13d-1・仮決め）: 待遇プランが 1 本だけの店に 2〜3 本目を足す（源泉 nox_demo_all.json の compensation_plans は不変＝gen-demo が末尾に足し、キャストは順番に割り振る）。
 *  NOIR は源泉で 3 本・LILY は源泉 1 本（live の 3 本中 2 本はデモ内で手入力されたもの＝reset で消える）・ACE は源泉 1 本（売上スライド）のまま＝相談役ブロック「ACE はプラン 0 のまま（仕様）」に合わせ据え置き（実体は 1 本）。 */
/** ★X-13-26（便 X-13d-2a・仮決め）: 代表キャストの前借り（先月の中旬＝{$m:-1,d:15}・open）＝先月分の確定（finalize hook）で天引き済み・当月に繰越なし。0＝入れない */
/** ★裁定338（0168・便 P168・仮決め）: スライドの判定期間と段＝ACE 月次（売上・源泉の日次閾値 30k／70k／120k を月規模へ）・NOIR 月次（ポイント）・LUNA 半月（売上）・他は daily（スライドなし）。
 *  9 月分は reset の finalize hook で凍結明細に反映される（再確定不要）。 */
export const SLIDES = {
  ace: { period: "monthly", sales: [{ at: 800000, wage: 3000 }, { at: 1200000, wage: 3500 }, { at: 1600000, wage: 4500 }] },
  noir: { period: "monthly", points: [{ at: 60, wage: 4000 }, { at: 120, wage: 4500 }, { at: 200, wage: 5000 }], basis: "hon_count", sales: [{ at: 3, wage: 4000 }, { at: 6, wage: 4500 }, { at: 10, wage: 5000 }], ranks: ["S", "A"] }, // ★裁定343（0170・便 W5-2b）: 判定基準＝本指名の件数（月次 3／6／10 件）・対象ランク S／A（default の 3 名は対象外＝base）
  luna: { period: "half", sales: [{ at: 400000, wage: 3300 }, { at: 700000, wage: 3600 }, { at: 1000000, wage: 4000 }] },
  muse: { period: "monthly", sales: [{ at: 300000, wage: 2200 }, { at: 500000, wage: 2500 }, { at: 800000, wage: 3000 }], points: [{ at: 10, wage: 2300 }, { at: 20, wage: 2600 }, { at: 40, wage: 3000 }] }, // ★348 追補2（B-1）: pt 段は注入した指名（本 3／場内 1／同伴 2 pt）で届く値へ // ★裁定348: 併用＝同一プランに売上段と pt 段（pay.ts は max＝高い方）
};
/** ★裁定348 追補1（便 DM-1 D-2b）: 体験入店プラン（スライド・バックなし・基本時給は店ごと）＋各店 1 名を割当＋期限付き保証時給（set_cast_guarantee の 3 行形＝直前行 valid_to／保証行 {base, guarantee:true}／戻し行）。
 *  from／to は R からの相対日（3 営業日＝R〜R+2）。NEST だけ期限切れ済み（R-5〜R-3）＝基本時給に戻った状態。cast は代表キャスト以外から名前で固定（台本で使う りな／れいな は避ける） */
export const TRIAL = {
  muse: { base: 1500, gua: 2300, from: 0, to: 2, cast: "まり" },
  luna: { base: 2000, gua: 3000, from: 0, to: 2, cast: "まい" },
  noir: { base: 2500, gua: 3500, from: 0, to: 2, cast: "こころ" },
  ace: { base: 2200, gua: 3200, from: 0, to: 2, cast: "るな", guaFromMonthStart: true, guaToRel: -2 }, // ★便 PR-1 R-3（裁定416）: 保証＝当月 1 日〜R−2（開始日を明示）・R−1 以降は基本 2,200＝10 月の支給が 2 行（保証／基本）
  lily: { base: 1300, gua: 1800, from: 0, to: 2, cast: "ゆな" },
  nest: { base: 1200, gua: 1800, from: -5, to: -3, cast: "レン" },
};
/** ★便 P173（ex_plan M173-2）: スタッフの器（0172）を live で見せる店＝staff 2 名（雇用＝staff の membership・委託＝manager の membership。users は 4 固定＝memberships の 1 ユーザー 1 アクティブ）＋7 日の打刻。他 4 店は無し */
export const STAFF_DEMO = { muse: { employee: 1300, contractor: 2000 }, luna: { employee: 1400, contractor: 2200 },
  /* ★便 X13-H H-12 ④: 他 4 店＝店長は月給（雇用・時給 0＋月額）・スタッフは時給（アルバイト） */ noir: { parttime: 1500, monthly: 320000 }, ace: { parttime: 1400, monthly: 300000 }, lily: { parttime: 1200, monthly: 260000 }, nest: { parttime: 1200, monthly: 250000 } };
export const ADVANCES = { muse: 50000, luna: 30000, noir: 30000, ace: 30000, lily: 30000, nest: 30000 };
export const EXTRA_PLANS = {
  muse: [{ key: "senior", name: "MUSE Senior", base: 2000, hon: 500, jonai: 300, dohan: 300 }],
  luna: [{ key: "premium", name: "LUNA Premium", base: 3500, hon: 1000, jonai: 500, dohan: 500 }, { key: "rookie", name: "LUNA 新人", base: 2500, hon: 500, jonai: 300, dohan: 300 }],
  noir: [], ace: [],
  lily: [{ key: "senior", name: "LILY Senior", base: 2200, hon: 300, jonai: 200, dohan: 200 }],
  nest: [{ key: "senior", name: "NEST Senior", base: 1800, hon: 300, jonai: 200, dohan: 200 }],
};
/** sys_* 9 キー（stores.settings_json）＝PROFILES.sys から。penalties は全店 false（裁定348: sales_rate は MUSE・point_slide は NOIR／MUSE） */
export function sysSettingsOf(code) {
  const s = PROFILES[code].sys;
  return { sys_wage_cut_rule: !!s.wage_cut_rule, /* ★便 SH-UI-a A-1: 就業規則に減給の定めがある（LILY だけ ON・保存先の白名単は 0175） */ sys_hourly: !!s.hourly, sys_backs: !!s.backs, sys_sales_rate: !!s.sales_rate, sys_points: !!s.points, sys_sales_slide: !!s.sales_slide, sys_point_slide: !!s.point_slide, sys_norms: !!s.norms, sys_penalties: s.penalties !== false /* ★便 X13-G W-18 ⑦: 6 店とも送り・前借りを使う＝精算調整・控除は ON（旧 false 固定＝控除・送りタブが空） */, sys_bonus: !!s.bonus }; // ★裁定348: sales_rate もプロファイル（MUSE）
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
/** ★便 P173 T-2（起票110・0174 ★2）: 達成ボーナスの段＝params.thresholds の {pct, amount}（旧形 {pct} は廃止）。sys.bonus の店（MUSE／LILY 等）の全プランに同じ段。
 *  1 段目の amount＝コンポーネントの amount（一覧の互換）。値は従来どおり 100%＝¥10,000（デモの金額は不変）。 */
export const BONUS_TIERS = [{ pct: 100, amount: 10000 }];
/** ★便 P174 T-7b（裁定385 のデモ）: 延長パターン（1 料金ルールに複数・既定に印）。group＝料金ルールの display_group。
 *  ACE＝平日の通常（メイン）に 3 本（30 分 ¥7,000〈既定〉／60 分 ¥13,000／VIP 延長 30 分 ¥9,000＝席種は限定しない＝レジの延長ボタンで 3 択）。他店は従来どおり 1 本。 */
export const EXT_PATTERNS = {
  ace: { group: "平日通常", rows: [
    { key: "ext", name: "平日通常 延長", minutes: 30, amount: 7000, isDefault: true },
    { key: "ext60", name: "平日通常 延長 60 分", minutes: 60, amount: 13000, isDefault: false },
    { key: "extvip", name: "VIP 延長", minutes: 30, amount: 9000, isDefault: false },
  ] },
};

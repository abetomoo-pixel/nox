/*
 * verify:nox-demo1118 — 夜便 11/17〜18 のデモのデータの直し（相談役 Y2a／Y2b）。DB 不触・env 不要。npm run verify:nox-demo1118。
 *  d(1) Y2a NOIR：待遇プラン 3 本の判定基準＝売上（件数の段 basis hon_count を外した）・店の軸はポイントのまま＝売上の段は空・pt の段と対象ランク S／A は不変。
 *  d(2) Y2b LUNA：キャスト 15（源泉 7＋写し 8・名前は店の中で重ならない・写し元に体入と代表を使わない）・PIN は全員分・写真の写し元は profiles と seed で同じ。
 *  d(3) Y2b LUNA：体験入店以外のプランは報酬の軸＝報酬率・段は器の検査（comp_plan_pay_rate_check と同じ条件）を通る・連続 2 期・相談役の表の行の対応。
 *  d(4) Y2b：CANON の帯と規定（reset の後の hook）は MUSE の会社だけ。
 *  d(6) Y2c：7 店目＝ホスト（CLUB VESPER）の payload（12 名・サ 30%・1,000 円切り上げ・料金・報酬・お客様の売掛）。
 *  d(5) Y2d：会計の丸め＝業態で（クラブ系＝キャバクラ・ラウンジ 1,000 円／スナック・ガールズバー 100 円・切り上げ）・伝票はみな店の丸め・締めた伝票は入金の和＝請求（売掛を含む）。
 */
import fs from "node:fs";
import { PROFILES, SLIDES, EXTRA_CASTS, PAY_RATE_DEMO, TRIAL, BIZ_TYPE_OF, billRoundOf, ROUND_UNIT_OF, MONTH_GROSS_TARGET, HOST_PLAN, HOST_TIERS, HOST_ALLOWANCE, HOST_COMMISSION_BASIS, hostCommissionDefsOf, hostStoreSettingsOf } from "./demo/profiles.mjs";
import { payRateTierOf, directionOf } from "../lib/nox/rules-0175/canon";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const J = JSON.stringify;
type Row = Record<string, unknown>;
const pay = (c: string) => JSON.parse(fs.readFileSync(`docs/demo/payload/${c}.json`, "utf8")).tables as Record<string, Row[]>;

// d(1) NOIR
const noir = pay("noir");
const np = noir.comp_plans.filter((p) => p.name !== "体験入店");
check("d(1-1) NOIR の待遇プラン 3 本＝判定基準 sales（件数で決める段は無い）", np.length === 3 && np.every((p) => p.slide_basis === "sales"), np.map((p) => [p.name, p.slide_basis]));
check("d(1-2) 店の軸はポイントのまま＝売上の段は空・pt の段 60／120／200・対象ランク 2（S・A）", np.every((p) => J(p.sales_slide) === "[]" && J(p.point_slide) === J(SLIDES.noir.points) && (p.slide_rank_ids as unknown[]).length === 2) && PROFILES.noir.sys.sales_slide === false && PROFILES.noir.sys.point_slide === true && !("basis" in SLIDES.noir));

// d(2) LUNA の人数
const luna = pay("luna");
const names = luna.casts.map((c) => c.name as string);
check("d(2-1) LUNA のキャスト 15（源泉 7＋写し 8）・名前は重ならない", luna.casts.length === 15 && new Set(names).size === 15 && EXTRA_CASTS.luna.length === 8, names);
const srcNames = new Map([["LUNA-CAST-001", "みさき"], ["LUNA-CAST-005", TRIAL.luna.cast]]);
check("d(2-2) 写し元に代表（みさき）と体入（まい）を使わない", EXTRA_CASTS.luna.every((x: { from: string }) => !srcNames.has(x.from)));
check("d(2-3) 足した 8 人に cast_pin（PIN の hash）がある", EXTRA_CASTS.luna.every((x: { name: string }) => { const c = luna.casts.find((r) => r.name === x.name); return !!c && luna.cast_pin.some((p) => p.cast_id === c.id); }));
const seed = fs.readFileSync("lib/nox/demo/seed.ts", "utf8");
const m = /export const DEMO_PHOTO_CLONES[^=]*= (\[\[.*\]\]);/.exec(seed);
const clones = m ? (JSON.parse(m[1]) as [string, string][]) : [];
const fromName: Record<string, string> = { "LUNA-CAST-002": "れいな", "LUNA-CAST-003": "なな", "LUNA-CAST-004": "かれん", "LUNA-CAST-006": "りお", "LUNA-CAST-007": "あかり" };
check("d(2-4) 写真の写し元（seed.ts DEMO_PHOTO_CLONES）＝profiles の EXTRA_CASTS と同じ", clones.length === 8 && EXTRA_CASTS.luna.every((x: { name: string; from: string }) => clones.some(([to, from]) => to === x.name && from === fromName[x.from])), clones);
check("d(2-5) 写真の複写は写真が無いときだけ（写し元に写真があり・写し先に無い）＝reset のたびに上書きしない", seed.includes("if (!toId || !fromId || castIds.includes(toId) || !castIds.includes(fromId)) continue;"));

// d(3) LUNA の段（器＝comp_plan_pay_rate_check と同じ条件をここで確かめる）
const PCT_KEYS = ["back_mult", "pay_pct", "wage_cut_pct", "hon_back_rate", "back_gate_pct", "bonus_pct"];
const tiersOk = (ts: Record<string, number>[]) => ts.length <= 10 && ts.every((t, i) => typeof t.at_pct === "number" && t.at_pct >= 0 && t.at_pct <= 300 && (i === 0 || t.at_pct > ts[i - 1].at_pct)
  && Object.entries(t).every(([k, v]) => ["at_pct", "up_amount", "back_mult", "pay_pct", "wage_cut_pct", "hon_back_rate", "days_min", "back_gate_pct", "bonus_pct", "down_amount"].includes(k) && typeof v === "number" && v >= 0 && (!PCT_KEYS.includes(k) || v <= 100)));
const lp = luna.comp_plans.filter((p) => p.name !== "体験入店");
const trial = luna.comp_plans.find((p) => p.name === "体験入店");
const tiers = PAY_RATE_DEMO.luna.tiers;
check("d(3-1) 体験入店以外のプラン＝報酬率（reward_axis pay_rate）・同じ段・連続 2 期／体験入店は軸なし", lp.length >= 1 && lp.every((p) => p.reward_axis === "pay_rate" && J(p.pay_rate_tiers) === J(tiers) && p.slide_streak_n === 2) && !!trial && trial.reward_axis !== "pay_rate", lp.map((p) => [p.name, p.reward_axis, p.slide_streak_n]));
check("d(3-2) 段は器の検査を通る（10 段以内・境 0〜300 の昇順・率 100 まで）", tiersOk(tiers) && tiers.length === 8);
const at = (pct: number) => { const h = payRateTierOf(tiers, pct); return h ? { i: h.idx, d: directionOf(h.tier), t: h.tier } : null; };
check("d(3-3) 表の行：40%→+1,000・40.1〜50→+500・50.1〜60→+300（UP）", at(40)?.t.up_amount === 1000 && at(45)?.t.up_amount === 500 && at(50)?.t.up_amount === 500 && at(55)?.t.up_amount === 300 && at(40)?.d === "up" && at(55)?.d === "up");
check("d(3-4) 61〜100%＝据え置き（バック 100%）・表せない 70〜89%（バック 70%）と 90〜100%（バック 50%）は据え置きに入る", at(65)?.d === "hold" && at(80)?.d === "hold" && at(95)?.d === "hold" && at(100)?.d === "hold");
check("d(3-5) 101〜130%→90%・131〜200%→85%・201〜250%→80%・251% 以上→75%（バックなし＝査定）", at(101)?.t.pay_pct === 90 && at(130)?.t.pay_pct === 90 && at(131)?.t.pay_pct === 85 && at(200)?.t.pay_pct === 85 && at(201)?.t.pay_pct === 80 && at(251)?.t.pay_pct === 75 && at(400)?.t.pay_pct === 75 && [101, 131, 201, 251].every((p) => at(p)?.d === "assess" && at(p)?.t.back_mult === 0));

// d(3-6) ★Y2b 直し（2026-11-17 21:10 LUNA の reset が pay_rate_tiers の null で失敗）: comp_plans は店の中で全行の鍵がそろう（load は鍵の無い行に null を入れる＝NOT NULL の列で落ちる）
for (const c of ["muse", "luna", "noir", "ace", "lily", "nest"]) {
  const rows = pay(c).comp_plans; const keys = (r: Row) => Object.keys(r).filter((k) => !k.startsWith("$")).sort().join(",");
  check(`d(3-6) ${c}: comp_plans ${rows.length} 行の鍵がそろう（体験入店も pay_rate_tiers などを持つ）`, rows.length > 0 && rows.every((r) => keys(r) === keys(rows[0])), rows.map((r) => [r.name, Object.keys(r).length]));
}

// d(4) CANON の帯は MUSE だけ
check("d(4-1) demoCanonBandsFor は NOX-DEMO-MUSE 以外は何もしない", seed.includes('if ((org as { name?: string } | null)?.name !== "NOX-DEMO-MUSE") return out;'));

// d(5) 丸め
const want: Record<string, number> = { muse: 100, luna: 1000, noir: 1000, ace: 1000, lily: 100, nest: 100 }; // ★2026-11-18（相談役 B）: MUSE は 100 円（丸めの単位は店ごとの種・ROUND_UNIT_OF）
for (const c of Object.keys(want)) {
  const T = pay(c); const st = T.stores[0];
  const sj = st.settings_json as Record<string, unknown>;
  check(`d(5-1) ${c}: 業態 ${String(sj.biz_type)}＝丸め ${want[c]} 円・切り上げ（店と BIZ_TYPE_OF が一致）`, st.round_unit === want[c] && st.round_mode === "up" && BIZ_TYPE_OF[c] === sj.biz_type && ROUND_UNIT_OF[c] === want[c] && J(billRoundOf(c)) === J({ round_unit: want[c], round_mode: "up" }));
  const bad = T.checks.filter((k) => k.round_unit !== want[c] || k.round_mode !== "up").length;
  const payBy = new Map<string, number>(); for (const p of T.payments ?? []) payBy.set(String(p.check_id), (payBy.get(String(p.check_id)) ?? 0) + Number(p.amount));
  const closed = T.checks.filter((k) => k.status === "closed" && !k.merged_into && payBy.has(String(k.id)));
  const gap = closed.filter((k) => payBy.get(String(k.id)) !== Number(k.total)).length;
  check(`d(5-2) ${c}: 伝票はみな店の丸め（違い ${bad}）・入金のある締めた伝票 ${closed.length} 件は入金の和＝請求（違い ${gap}）`, bad === 0 && closed.length > 0 && gap === 0);
}

// d(7) ★2026-11-18（相談役 B）: LUNA は報酬率スライドだけ（売上の段は空・店の売上スライド OFF）・業態は店名に（MUSE snack・NEST bar）・目標は丸めた後の実績
{
  const L = pay("luna"); const sjL = L.stores[0].settings_json as Record<string, unknown>;
  check("d(7-1) LUNA：売上スライド OFF・プランの売上の段は空・報酬率のプランは 3 本のまま", sjL.sys_sales_slide === false && L.comp_plans.every((p) => J(p.sales_slide) === "[]") && L.comp_plans.filter((p) => p.reward_axis === "pay_rate").length === 3);
  check("d(7-2) 業態＝MUSE snack・NEST bar（ほかは不変）", (pay("muse").stores[0].settings_json as Record<string, unknown>).biz_type === "snack" && (pay("nest").stores[0].settings_json as Record<string, unknown>).biz_type === "bar" && (pay("noir").stores[0].settings_json as Record<string, unknown>).biz_type === "lounge");
  const bad = ["muse", "luna", "noir", "ace", "lily", "nest"].filter((c) => !(pay(c).store_sales_targets ?? []).every((r) => r.sales_target === (MONTH_GROSS_TARGET as Record<string, number>)[c]));
  check("d(7-3) 店の売上の目標（store_sales_targets）＝丸めた後の実績（MONTH_GROSS_TARGET）", bad.length === 0, bad);
}

// d(6) ホスト
{
  const T = pay("host"); const st = T.stores[0]; const sj = st.settings_json as Record<string, unknown>;
  check("d(6-1) ホスト：店名 CLUB VESPER・業態ホスト（★2026-11-18 夜＝0201o で 'host'）・サ 30%・1,000 円切り上げ", st.name === "CLUB VESPER" && sj.biz_type === "host" && st.service_rate === 30 && st.round_unit === 1000 && st.round_mode === "up", [st.name, sj.biz_type, st.service_rate, st.round_unit]);
  check("d(6-2) キャスト 12 名・名前は重ならない", T.casts.length === 12 && new Set(T.casts.map((c) => c.name)).size === 12, T.casts.map((c) => c.name));
  const sets = T.pricing_rules.filter((r) => r.fee_kind === "set" && r.is_active), exts = T.pricing_rules.filter((r) => r.fee_kind === "extension" && r.is_active);
  const hon = T.pricing_rules.find((r) => r.fee_kind === "hon_shimei"), jon = T.pricing_rules.find((r) => r.fee_kind === "jonai_shimei");
  check("d(6-3) 料金：セット 7,000・延長 3,000・本指名 3,000・場内 2,000", sets.length > 0 && sets.every((r) => r.amount === 7000) && exts.every((r) => r.amount === 3000) && hon?.amount === 3000 && jon?.amount === 2000);
  const pl = T.comp_plans.find((p) => p.name === "VESPER Standard");
  check("d(6-4) 報酬：VESPER Standard＝時給 0・本指名 1,000・場内 500・同伴 2,000", !!pl && pl.base === 0 && pl.hon_back === 1000 && pl.jonai_back === 500 && pl.dohan_back === 2000, pl && [pl.base, pl.hon_back, pl.jonai_back, pl.dohan_back]);
  // ★2026-11-18（相談役 F）: 新人 3 人＝プラン「VESPER 新人」・最低保証 160,000 円（8,000 円 × 20 日）
  const rk = T.comp_plans.find((p) => p.name === "VESPER 新人"); const names = Object.fromEntries(T.casts.map((c) => [c.id, c.name]));
  const rkCasts = rk ? T.cast_plan.filter((x) => x.plan_id === rk.id).map((x) => names[String(x.cast_id)]).sort() : [];
  const gm = rk ? (T.comp_plan_components ?? []).filter((c) => c.plan_id === rk.id && c.kind === "guarantee_min") : [];
  check("d(6-6) 新人 3 人（★2026-11-18 夜＝カイト・ハヤト・リョウ・シンはヘルプ中心）＝VESPER 新人・最低保証 160,000 円の部品 1 つ", !!rk && J(rkCasts) === J(["カイト", "ハヤト", "リョウ"]) && gm.length === 1 && gm[0].amount === 160000 && gm[0].mode === "amount", { rkCasts, gm: gm.map((c) => c.amount) });
  check("d(6-5) 代表伝票は無い（LUNA の代表伝票を写していない）・6 店の payload は host を含まない", !JSON.stringify(T.checks).includes("LIVE-LUNA") && ["muse", "luna", "noir", "ace", "lily", "nest"].every((c) => pay(c).stores[0].name !== "CLUB VESPER"));
}

// d(7) ★2026-11-18 夜（相談役 ④）: ホストの中身（人ごとの段・売上歩合の段・幹部手当・シン・写真の対応・小計への切り替え）
{
  const T = pay("host"); const ids = JSON.parse(fs.readFileSync("docs/demo/ids.json", "utf8")) as { people: Record<string, string> };
  const nameById = Object.fromEntries(T.casts.map((c) => [String(c.id), String(c.name)]));
  const ORDER = ["ユウキ", "カイト", "ハヤト", "リョウ", "シン", "レオ", "アキラ", "ミナト", "ソウマ", "ハル", "ルイ", "ジン"];
  // payload の casts.id は ids.json の uuid（org ごとの付け替えは reset の時）
  const byPerson = ORDER.map((n, i) => { const pid = `HOST-CAST-${String(i + 1).padStart(3, "0")}`; return nameById[ids.people[pid]] ?? null; });
  check("d(7-1) 写真の番号＝HOST-CAST-001〜005 がユウキ・カイト・ハヤト・リョウ・シン・006〜012 がレオ〜ジン（NEST-CAST-NNN の写し）", J(byPerson) === J(ORDER), byPerson);
  const defs = (T.custom_back_defs ?? []).map((d) => ({ name: d.name, basis: d.basis, value: d.value, cond: d.cond_json }));
  const want = hostCommissionDefsOf().map((d) => ({ name: d.name, basis: d.basis, value: d.value, cond: d.cond }));
  // ★2026-11-19 朝（相談役 ③）: 小計の基準へ切り替えた＝率 40／5×5・境 30〜300 万・名前に「相当」なし・店の鍵 sales_basis＝'subtotal'・sales_back_default_off＝true
  const stS = T.stores[0].settings_json as Record<string, unknown>;
  check("d(7-2) 売上歩合の段＝自由設計のバック 6 行（基本 40＋5×5＝小計の素の率 40〜65%・境 30〜300 万・名前に「相当」なし）・店の鍵 sales_basis＝'subtotal'・sales_back_default_off＝true", HOST_COMMISSION_BASIS === "subtotal" && J(defs) === J(want) && J(want.map((d) => d.value)) === J([40, 5, 5, 5, 5, 5]) && J(want.slice(1).map((d) => d.cond?.min)) === J([300000, 500000, 1000000, 2000000, 3000000]) && defs.every((d) => !String(d.name).includes("相当")) && String(defs[0]?.name) === "売上歩合（小計の 40%）" && String(defs[1]?.name) === "売上歩合の加算（小計 30 万円〜・小計の 5%）" && stS.sales_basis === "subtotal" && stS.sales_back_default_off === true, defs.map((d) => [d.name, d.value]));
  const dueV = hostCommissionDefsOf("due");
  check("d(7-3) 請求額の基準へ戻す道（1 か所）＝率 28＋3／4／3／4／3・境 × 1.43・店の鍵なし", J(dueV.map((d) => d.value)) === J([28, 3, 4, 3, 4, 3]) && J(dueV.slice(1).map((d) => d.cond?.min)) === J([429000, 715000, 1430000, 2860000, 4290000]) && J(hostStoreSettingsOf("due")) === J({}) && J(hostStoreSettingsOf("subtotal")) === J({ sales_basis: "subtotal", sales_back_default_off: true }));
  const inc = T.attendance_incentives ?? [];
  const leo = T.casts.find((c) => c.name === "レオ");
  check("d(7-4) レオの幹部手当＝出勤ボーナスの表に先月 1 件（宛先レオだけ・50,000 円・理由「幹部手当」）", inc.length === 1 && J(inc[0].target_cast_ids) === J([leo?.id]) && inc[0].amount === HOST_ALLOWANCE.amount && inc[0].reason === HOST_ALLOWANCE.reason && inc[0].kind === "bonus" && inc[0].amount_mode === "per_head" && (inc[0].biz_date as { $m?: number }).$m === -1, inc.map((x) => [x.amount, x.reason]));
  // 先月の締めた伝票の小計（★2026-11-19 朝: 請求額 ÷ 1.43 の目安から、行の合計−割引＝check_group_subtotal と同じ数え方へ）を指名（フリー以外）で等分＝人ごとの売上（小計）→ 段の真ん中（境から 5% 以上離れる）
  const prev = T.checks.filter((c) => (c.started_at as { $m?: number }).$m === -1 && c.status === "closed");
  const prevIds = new Set(prev.map((c) => c.id));
  const nomsBy = new Map<string, Row[]>(); for (const n of T.check_nominations) if (prevIds.has(n.check_id) && n.nom_kind !== "free") (nomsBy.get(String(n.check_id)) ?? nomsBy.set(String(n.check_id), []).get(String(n.check_id))!).push(n);
  const subBy = new Map<string, number>(); for (const l of T.check_lines) if (prevIds.has(l.check_id)) subBy.set(String(l.check_id), (subBy.get(String(l.check_id)) ?? 0) + (l.kind === "discount" ? -1 : 1) * Number(l.line_total));
  const due = new Map<string, number>(); for (const c of prev) { const ns = nomsBy.get(String(c.id)) ?? []; for (const n of ns) due.set(nameById[String(n.cast_id)], (due.get(nameById[String(n.cast_id)]) ?? 0) + Math.max(0, subBy.get(String(c.id)) ?? 0) / ns.length); }
  const bandOf = (y: number) => [...HOST_TIERS].reverse().find((t) => y >= t.at)!;
  const bad: string[] = [];
  for (const [n, v] of Object.entries(HOST_PLAN.casts)) {
    const est = due.get(n) ?? 0; const b = bandOf(est); const wantB = bandOf(v.sub);
    const next = HOST_TIERS.find((t) => t.at > est); const margin = Math.min(b.at ? (est - b.at) / b.at : 1, next ? (next.at - est) / next.at : 1);
    if (b.pct !== wantB.pct || margin < 0.05) bad.push(`${n} 小計の目安 ${Math.round(est)}（${b.pct}%・境まで ${(margin * 100).toFixed(1)}%）`);
  }
  check("d(7-5) 人ごとの先月の売上（小計＝行の合計−割引）が狙いの段に入り、境から 5% 以上離れる（12 名）", bad.length === 0 && due.size >= 12, bad);
  check("d(7-8) シンの先月の小計＝ちょうど 20 万（× 40%＝80,000）", Math.round(due.get("シン") ?? 0) === 200000, Math.round(due.get("シン") ?? 0));
  const shin = T.casts.find((c) => c.name === "シン"); const shinNoms = T.check_nominations.filter((n) => prevIds.has(n.check_id) && n.cast_id === shin?.id);
  const shinDrinks = T.check_lines.filter((l) => prevIds.has(l.check_id) && l.cast_id === shin?.id && l.kind === "drink" && Number(l.back_snapshot) === 200).reduce((a, l) => a + Number(l.qty), 0);
  check("d(7-6) シン＝場内だけ（本指名なし）・先月のキャストドリンク 50 杯（バック 200 円）", shinNoms.length > 0 && shinNoms.every((n) => n.nom_kind === "jonai") && shinDrinks === 50, { noms: shinNoms.map((n) => n.nom_kind), shinDrinks });
  const dir = "docs/tmp/demo_photos/casts";
  const photosOk = !fs.existsSync(dir) || Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(3, "0")).every((n) => fs.existsSync(`${dir}/HOST-CAST-${n}.jpg`) && fs.readFileSync(`${dir}/HOST-CAST-${n}.jpg`).equals(fs.readFileSync(`${dir}/NEST-CAST-${n}.jpg`)));
  check("d(7-7) 写真 HOST-CAST-001〜012＝NEST-CAST-001〜012 の写し（元はそのまま）", photosOk);
}

// d(8) ★2026-11-19 朝（相談役 ③の調べ）: env DEMO_USERS にその店の鍵が 1 つも無ければ、消す前に失敗で返す（11/19 06:35 の再試行がホストを消して load が 'org mismatch'）
{
  const seed = fs.readFileSync("lib/nox/demo/seed.ts", "utf8");
  const g = seed.indexOf("if (envMap && !Object.keys(envMap).some((k) => k.startsWith(`${store}:`))) return { ok: false, status: 503");
  check("d(8-1) buildPayload は DEMO_USERS に店の鍵が無いと消す前に止まる（役割の写像と payload の組み立ての前）", g > 0 && g < seed.indexOf("const built = buildPayloadFromRecording(orgId, bizDate, rec, userIdByRole);") && g > seed.indexOf("const envMap = parseDemoUsers(process.env.DEMO_USERS);"));
  const cron = fs.readFileSync("app/api/cron/demo-reset/route.ts", "utf8");
  check("d(8-2) cron の reset は組み立ての失敗で runDemoReset（wipe）を呼ばずに次の店へ", /if \(!built\.ok\) \{ await markFailed\(admin, orgId, built\.error\);.*continue; \}\r?\n\s*const r = await runDemoReset\(admin, orgId, built\.payload\);/.test(cron));
}

if (fails.length) { console.error(`✗ verify:nox-demo1118 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-demo1118 OK (${pass} checks)`);

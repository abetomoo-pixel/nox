/*
 * verify:nox-demo1118 — 夜便 11/17〜18 のデモのデータの直し（相談役 Y2a／Y2b）。DB 不触・env 不要。npm run verify:nox-demo1118。
 *  d(1) Y2a NOIR：待遇プラン 3 本の判定基準＝売上（件数の段 basis hon_count を外した）・店の軸はポイントのまま＝売上の段は空・pt の段と対象ランク S／A は不変。
 *  d(2) Y2b LUNA：キャスト 15（源泉 7＋写し 8・名前は店の中で重ならない・写し元に体入と代表を使わない）・PIN は全員分・写真の写し元は profiles と seed で同じ。
 *  d(3) Y2b LUNA：体験入店以外のプランは報酬の軸＝報酬率・段は器の検査（comp_plan_pay_rate_check と同じ条件）を通る・連続 2 期・相談役の表の行の対応。
 *  d(4) Y2b：CANON の帯と規定（reset の後の hook）は MUSE の会社だけ。
 */
import fs from "node:fs";
import { PROFILES, SLIDES, EXTRA_CASTS, PAY_RATE_DEMO, TRIAL } from "./demo/profiles.mjs";
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

// d(4) CANON の帯は MUSE だけ
check("d(4-1) demoCanonBandsFor は NOX-DEMO-MUSE 以外は何もしない", seed.includes('if ((org as { name?: string } | null)?.name !== "NOX-DEMO-MUSE") return out;'));

if (fails.length) { console.error(`✗ verify:nox-demo1118 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-demo1118 OK (${pass} checks)`);

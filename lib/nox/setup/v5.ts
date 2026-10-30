// ★便 OB-2（2026-10-29・裁定438 候補「初期設定 v5＝正本」）: 初期設定 9 STEP の純関数＝正本モック docs/handoff/mock/setup_v5.html の写経（文言・順・既定値・業態 5 種の初期値・要確認の条件・CSV の 9 列）。
//   DB を知らない。画面（app/(manage)/setup/setup-wizard.tsx）は state を描き、「この内容で始める」で buildV5Plan の計画（既存 RPC と route の呼び出し列）を順に実行する。
//   器が無い項目（V5_SAVE_MAP の has=false）は画面に出すが保存は「後で（マスタから）」＝0191 起草（MIG_0191_APPLIED=false の配下）。
import type { MineSettings } from "../store/mine-settings";
import { mineSettingsPatchOf } from "../store/mine-settings";
import { DEFAULT_SETTLEMENT_PRESETS } from "../payroll/settlement";
import { mig0190On, mig0191On } from "../rules-0175/flag"; // ★0190／0191 のフラグ true 便: 器なし項目を実保存に（false の間は従来＝「後で（マスタから）」）
/** ★0191 ★1: 締め日の表記→settlement_close_day（15／20／25／31＝末日） */
export const CLOSE_DAY_OF: Record<string, 15 | 20 | 25 | 31> = { "15": 15, "20": 20, "25": 25, "末日": 31 };
const pct100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n || 0)));

// ── 9 STEP・業態 5 種（モック STEPS／TYPES 逐語） ──
export const V5_STEPS: readonly string[] = ["お店", "席・卓", "料金", "メニュー", "キャスト待遇", "スタッフ", "シフト・勤怠", "会計・レジ", "確認"];
export type V5Type = "cabaret" | "girlsbar" | "snack" | "lounge" | "bar";
export const V5_TYPES: ReadonlyArray<{ id: V5Type; name: string; desc: string; price: string }> = [
  { id: "cabaret", name: "キャバクラ", desc: "セット・指名・同伴中心", price: "セット ¥7,000／60分" },
  { id: "girlsbar", name: "ガールズバー", desc: "チャージ＋ドリンク中心", price: "チャージ ¥3,000／60分" },
  { id: "snack", name: "スナック", desc: "セット＋ボトル中心", price: "セット ¥5,000／90分" },
  { id: "lounge", name: "ラウンジ", desc: "セット＋VIP・高単価", price: "セット ¥8,000／60分" },
  { id: "bar", name: "バー", desc: "チャージ＋商品会計", price: "チャージ ¥1,000〜" },
];
export const WD = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ── 型 ──
export type V5Ext = [min: number, yen: number, def: 0 | 1];
export type V5Rule = { name: string; when: string; set: number; min: number; ext: V5Ext[]; seat: string; from: string; to: string; days: string[] };
export type V5Item = { n: string; p: number; b: number; keep: boolean; on: boolean; byKind: boolean; bj: number | null; bf: number | null; bt?: "yen" | "pct" };
export type V5Cat = { cat: string; on: boolean; items: V5Item[] };
export type V5Staff = { n: string; role: string; perm: "manager" | "staff"; shiftOk: boolean; kind: string; basis: string; amt: number; pin: string };
export type V5Cast = { g: string; st: string; kind: string; pin: string; dist?: string; inv: boolean; n?: string; tel?: string; mail?: string; plan?: string; birthday?: string };
export type V5CsvRow = { c: string[]; err: string };
export type V5PenMode = "per" | "flat";
export type V5State = {
  step: number; done: Record<number, boolean>; type: V5Type | null;
  shop: { name: string; addr: string; open: string; close: string; cut: string; holidays: string[] };
  seats: { counter: number; table: number; vip: number; tp: string; cp: string; vp: string };
  rules: V5Rule[]; fees: { hon: number; jo: number; dohan: number }; svc: number; svcVip: number; tax: "in" | "ex"; join: "join" | "extend";
  vip: { on: boolean; mode: "table" | "person"; amt: number; per: "set" | "once"; ext: number };
  menu: V5Cat[];
  pay: { base: number; trial: number; trialDays: number; slide: "sales" | "point" | "rate" | "none"; norma: boolean; bonus: boolean };
  back: { hon: number; jo: number; dohan: number; drink: number; bottle: number };
  slideTiers: [number, number][]; slidePeriod: "month" | "half"; drinkBack: boolean; kindRate: { hon: number; jo: number; free: number };
  pt: { hon: number; jo: number; dohan: number; salesPer: number };
  normaAxes: { days: boolean; dohan: boolean; hon: boolean; sales: boolean }; normaGoal: { days: number; hon: number; dohan: number; sales: number };
  normaPen: Record<"days" | "hon" | "dohan" | "sales", { m: V5PenMode; a: number }>; bonusMode: "max" | "sum";
  payroll: { period: "month" | "half" | "daily"; close: string; payday: number; whtCast: "hostess" | "none"; whtStaff: "none" | "other_204"; advance: boolean; settle: boolean; okuriMode: "fixed" | "actual" | "store" | "none"; okuri: number; okuriTiers: [number, number, number]; mypage: "none" | "net" | "full" };
  staff: V5Staff[];
  shift: { mode: "want" | "off" | "store"; due: number; auto: number; need: number[] };
  punch: { judge: "soft" | "hard"; how: "device" | "any"; round: 1 | 5 | 15 | 30; gate: boolean };
  reg: { kiosk: boolean; castReg: "off" | "order" | "pay"; uri: boolean; staffDisc?: "approve" | "limit" | "no" };
  cardfee: number; cashOff: boolean; cashRate: number; cashBase: "total" | "subtotal";
  receipt: { name: string; tno: string; tadashi: string }; round: "round" | "floor" | "ceil";
  dirty: boolean; salesSplit: "prorate" | "equal"; castTab: "one" | "csv";
  mine: { rank: boolean; rankOthers: "self" | "top"; drink: boolean; fix: boolean; resv: boolean; late: boolean; norma: boolean; bonus: boolean };
  casts: V5Cast[]; castForm: { g: string; n: string; st: string; kind: string; plan: string; tel: string; mail: string; pin: string; dist: string; invite: boolean; birthday: string }; csvRows: V5CsvRow[];
  float: number; devReg: boolean; devName: string; firstShift: { from: string; to: string; due: string; start: boolean };
};

// ── モック R()／M()／TPL／MENU 逐語 ──
const R = (name: string, when: string, set: number, min: number, ext: V5Ext[], seat?: string): V5Rule => ({ name, when, set, min, ext, seat: seat ?? "全席", from: "", to: "", days: [] });
const pad = (t: string) => (t.length === 4 ? "0" + t : t);
export function normRule(x: V5Rule, shop: V5State["shop"]): V5Rule {
  const m = /(\d{1,2}:\d{2})〜(?:翌)?(\d{1,2}:\d{2}|LAST)/.exec(x.when || "");
  let from = shop.open, to = shop.close;
  if (m) { from = pad(m[1]); to = m[2] === "LAST" ? shop.close : pad(m[2]); if (from === "24:00") from = "00:00"; }
  const seat = ({ "全席": "all", "VIP": "vip", "カウンター": "counter", "テーブル": "table" } as Record<string, string>)[x.seat] || x.seat || "all";
  return { ...x, from, to, seat, days: x.days && x.days.length ? x.days : WD.filter((d) => shop.holidays.indexOf(d) < 0) };
}
type MI = [string, number, number?, (0 | 1)?];
const M = (cat: string, items: MI[]): V5Cat => ({ cat, on: true, items: items.map((x) => ({ n: x[0], p: x[1], b: x[2] || 0, keep: !!x[3], on: true, byKind: false, bj: null, bf: null })) });
export const V5_MENU: Record<V5Type, () => V5Cat[]> = {
  cabaret: () => [M("キャストドリンク", [["Cast Drink S", 1100, 550], ["Cast Drink M", 1650, 825], ["Cast Drink L", 2200, 1100]]), M("ビール", [["生ビール", 880]]), M("ウイスキー", [["ハイボール", 880], ["山崎（ボトル）", 22000, 2200, 1], ["響（ボトル）", 27500, 2750, 1]]), M("サワー", [["レモンサワー", 880]]), M("焼酎", [["黒霧島（ボトル）", 5500, 550, 1], ["吉四六（ボトル）", 8800, 880, 1]]), M("スパークリング", [["カフェ・ド・パリ", 11000, 1100]]), M("シャンパン", [["モエ", 22000, 2200], ["ヴーヴ・クリコ", 27500, 2750], ["ドン・ペリニヨン", 66000, 6600], ["アルマンド", 110000, 11000]]), M("ソフトドリンク", [["ウーロン茶", 660], ["コーラ", 660]]), M("軽食", [["ミックスナッツ", 880], ["フルーツ盛り", 3300]])],
  lounge: () => [M("キャストドリンク", [["Cast Drink S", 1500, 750], ["Cast Drink M", 2200, 1100], ["Cast Drink L", 3300, 1650]]), M("ビール", [["生ビール", 1100]]), M("ウイスキー", [["ハイボール", 1100], ["山崎（ボトル）", 33000, 3300, 1], ["響（ボトル）", 38500, 3850, 1]]), M("焼酎", [["森伊蔵（ボトル）", 33000, 3300, 1]]), M("シャンパン", [["モエ", 27500, 2750], ["ヴーヴ・クリコ", 33000, 3300], ["ドン・ペリニヨン", 77000, 7700], ["アルマンド", 132000, 13200]]), M("ソフトドリンク", [["ウーロン茶", 880], ["コーラ", 880]]), M("軽食", [["チョコレート", 1650], ["フルーツ盛り", 5500]])],
  girlsbar: () => [M("キャストドリンク", [["キャストドリンク", 1000, 500], ["キャストショット", 1000, 500]]), M("ショット", [["テキーラ", 1000, 300]]), M("ビール", [["ビール", 800]]), M("ウイスキー", [["ハイボール", 800]]), M("サワー", [["レモンサワー", 800], ["カシスオレンジ", 800]]), M("焼酎", [["鏡月（ボトル）", 4000, 400, 1]]), M("ソフトドリンク", [["ウーロン茶", 500], ["コーラ", 500]])],
  snack: () => [M("ボトル", [["鏡月（ボトル）", 4000, 0, 1], ["二階堂（ボトル）", 5000, 0, 1], ["角瓶（ボトル）", 6000, 0, 1]]), M("割物", [["割物セット", 1000], ["氷", 500]]), M("ママ・キャストドリンク", [["ママドリンク", 1000, 500], ["キャストドリンク", 1000, 500]]), M("ビール", [["ビール", 700]]), M("ソフトドリンク", [["ウーロン茶", 500]]), M("カラオケ", [["カラオケ 1 曲", 100]]), M("おつまみ", [["乾き物", 500]])],
  bar: () => [M("カクテル", [["ジントニック", 1200], ["モスコミュール", 1200]]), M("ウイスキー", [["ハイボール", 900], ["ウイスキー（ショット）", 1200]]), M("ビール", [["ビール", 900]]), M("ワイン", [["グラスワイン", 1000]]), M("ソフトドリンク", [["ジンジャーエール", 600]]), M("フード", [["ナッツ", 800], ["チーズ盛り合わせ", 1500]])],
};
type Tpl = { rules: V5Rule[]; fees: V5State["fees"]; svc: number; svcVip?: number; join: "join" | "extend"; seats: { counter: number; table: number; vip: number }; pay: { base: number; slide: V5State["pay"]["slide"]; norma: boolean; bonus: boolean }; back: V5State["back"]; reg: boolean; vip: [boolean, number, number] };
export const V5_TPL: Record<V5Type, () => Tpl> = {
  cabaret: () => ({ rules: [R("平日アーリー", "20:00〜21:00", 5000, 60, [[30, 2500, 1]]), R("通常", "21:00〜翌2:00", 7000, 60, [[30, 3500, 1], [60, 7000, 0]]), R("VIP", "20:00〜翌2:00", 10000, 60, [[30, 5000, 1]], "VIP")],
    fees: { hon: 3000, jo: 2000, dohan: 3000 }, svc: 20, svcVip: 25, join: "join", seats: { counter: 0, table: 10, vip: 2 }, pay: { base: 3000, slide: "sales", norma: true, bonus: true }, back: { hon: 1000, jo: 500, dohan: 1500, drink: 50, bottle: 10 }, reg: false, vip: [true, 5000, 2500] }),
  girlsbar: () => ({ rules: [R("通常チャージ", "全時間帯", 3000, 60, [[30, 1500, 1]], "カウンター"), R("深夜帯", "24:00〜LAST", 3500, 60, [[30, 1800, 1]], "カウンター")],
    fees: { hon: 1000, jo: 0, dohan: 2000 }, svc: 10, join: "extend", seats: { counter: 10, table: 2, vip: 0 }, pay: { base: 1500, slide: "none", norma: false, bonus: false }, back: { hon: 500, jo: 0, dohan: 1000, drink: 50, bottle: 10 }, reg: true, vip: [false, 3000, 1500] }),
  snack: () => ({ rules: [R("通常セット", "全時間帯", 5000, 90, [[30, 2000, 1]])],
    fees: { hon: 0, jo: 0, dohan: 0 }, svc: 10, join: "extend", seats: { counter: 8, table: 3, vip: 0 }, pay: { base: 2000, slide: "none", norma: false, bonus: false }, back: { hon: 0, jo: 0, dohan: 0, drink: 50, bottle: 0 }, reg: true, vip: [false, 3000, 1500] }),
  lounge: () => ({ rules: [R("通常", "20:00〜翌2:00", 8000, 60, [[30, 4000, 1]]), R("VIP", "20:00〜翌2:00", 12000, 60, [[30, 6000, 1]], "VIP")],
    fees: { hon: 3000, jo: 2000, dohan: 5000 }, svc: 20, svcVip: 30, join: "join", seats: { counter: 0, table: 8, vip: 3 }, pay: { base: 4000, slide: "sales", norma: true, bonus: true }, back: { hon: 1500, jo: 500, dohan: 2000, drink: 50, bottle: 10 }, reg: false, vip: [true, 8000, 4000] }),
  bar: () => ({ rules: [R("チャージ", "全時間帯", 1000, 0, [])],
    fees: { hon: 0, jo: 0, dohan: 0 }, svc: 0, join: "extend", seats: { counter: 10, table: 2, vip: 0 }, pay: { base: 1200, slide: "none", norma: false, bonus: false }, back: { hon: 0, jo: 0, dohan: 0, drink: 30, bottle: 0 }, reg: true, vip: [false, 0, 0] }),
};

/** 既定の状態（モック S 逐語・最初のシフト期間は呼び出し側が今日から組む） */
export function v5DefaultState(today: string): V5State {
  const d = new Date(today + "T00:00:00");
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const add = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return ymd(x); };
  // 次の月曜から 1 週間・締切はその 4 日前（モックの 10/26〜11/1・締切 10/22 と同じ関係）
  const dow = d.getDay(); const toMon = ((8 - dow) % 7) || 7;
  return {
    step: 0, done: {}, type: null,
    shop: { name: "", addr: "", open: "20:00", close: "02:00", cut: "06:00", holidays: ["日"] },
    seats: { counter: 0, table: 10, vip: 2, tp: "A", cp: "C", vp: "V" },
    rules: [], fees: { hon: 0, jo: 0, dohan: 0 }, svc: 0, svcVip: 0, tax: "in", join: "join", vip: { on: false, mode: "table", amt: 5000, per: "set", ext: 2500 },
    menu: [],
    pay: { base: 3000, trial: 3500, trialDays: 3, slide: "none", norma: false, bonus: false }, back: { hon: 0, jo: 0, dohan: 0, drink: 0, bottle: 0 },
    slideTiers: [[800000, 3000], [1200000, 3500], [1600000, 4500]], slidePeriod: "month", drinkBack: true, kindRate: { hon: 100, jo: 50, free: 30 }, pt: { hon: 1, jo: 0.5, dohan: 2, salesPer: 10000 },
    normaAxes: { days: true, dohan: true, hon: true, sales: true }, normaGoal: { days: 15, hon: 30, dohan: 4, sales: 800000 },
    normaPen: { days: { m: "per", a: 2000 }, hon: { m: "per", a: 1000 }, dohan: { m: "per", a: 1500 }, sales: { m: "per", a: 1000 } }, bonusMode: "max",
    payroll: { period: "month", close: "末日", payday: 10, whtCast: "hostess", whtStaff: "none", advance: true, settle: false, okuriMode: "fixed", okuri: 1000, okuriTiers: [500, 1000, 1500], mypage: "net" },
    staff: [{ n: "", role: "店長", perm: "manager", shiftOk: true, kind: "正社員", basis: "月給", amt: 300000, pin: "" }],
    shift: { mode: "want", due: 3, auto: 24, need: [0, 4, 4, 4, 4, 5, 5] }, punch: { judge: "soft", how: "device", round: 1, gate: true },
    reg: { kiosk: true, castReg: "off", uri: true, staffDisc: "approve" }, cardfee: 10, cashOff: false, cashRate: 10, cashBase: "total",
    receipt: { name: "", tno: "", tadashi: "御飲食代として" }, round: "round",
    dirty: false, salesSplit: "prorate", castTab: "one", mine: { rank: true, rankOthers: "self", drink: false, fix: false, resv: true, late: true, norma: true, bonus: true },
    casts: [], castForm: { g: "", n: "", st: "在籍", kind: "業務委託", plan: "基本プラン", tel: "", mail: "", pin: "", dist: "mid", invite: true, birthday: "" }, csvRows: [],
    float: 50000, devReg: false, devName: "レジ iPad", firstShift: { from: add(toMon), to: add(toMon + 6), due: add(toMon - 4), start: true },
  };
}
export const v5TypeName = (t: V5Type | null): string => V5_TYPES.find((x) => x.id === t)?.name ?? "—";
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** 業態を選ぶと初期値が入る（モック applyType 逐語） */
export function applyType(s: V5State, id: V5Type): V5State {
  const t = V5_TPL[id]();
  const n = clone(s);
  n.type = id;
  n.rules = t.rules.map((r) => normRule(r, n.shop)); n.fees = t.fees; n.svc = t.svc; n.svcVip = t.svcVip ?? t.svc; n.join = t.join;
  n.seats.counter = t.seats.counter; n.seats.table = t.seats.table; n.seats.vip = t.seats.vip;
  n.pay.base = t.pay.base; n.pay.trial = t.pay.base + 500; n.pay.slide = t.pay.slide; n.pay.norma = t.pay.norma; n.pay.bonus = t.pay.bonus;
  n.back = t.back; n.reg.castReg = t.reg ? "pay" : "off"; n.vip.on = t.vip[0]; n.vip.amt = t.vip[1]; n.vip.ext = t.vip[2];
  n.menu = V5_MENU[id]();
  n.menu.forEach((c) => { const champ = /シャンパン|スパークリング/.test(c.cat); c.items.forEach((it) => { if (champ) { it.bt = "pct"; it.b = n.back.bottle; } else it.bt = "yen"; }); });
  n.dirty = false;
  return n;
}
/** 「この率でメニューのバックを入れ直す」（モック rebuildBack 逐語） */
export function rebuildBack(s: V5State): V5State {
  const n = clone(s); const b = n.back;
  n.menu.forEach((c) => { const rate = /キャスト|ママ|ショット/.test(c.cat) ? b.drink : (/シャンパン|スパークリング|ボトル|ウイスキー|焼酎/.test(c.cat) ? b.bottle : 0);
    c.items.forEach((it) => { if (/キャスト|ママ|ショット/.test(c.cat) || it.keep || /シャンパン|スパークリング/.test(c.cat)) it.b = it.bt === "pct" ? rate : Math.round(it.p * rate / 100); }); });
  return n;
}
export const slideTiersFor = (slide: V5State["pay"]["slide"]): [number, number][] => (slide === "point" ? [[10, 3500], [20, 4000], [30, 4500], [50, 5000]] : slide === "rate" ? [[40, 3000], [30, 3500], [20, 4500]] : [[800000, 3000], [1200000, 3500], [1600000, 4500]]);
/** 指名区分ごとの値（モック kindVal）＝本指名の値×店の割合 */
export const kindVal = (it: V5Item, rate: number): number => (it.bt === "pct" ? Math.round(it.b * (rate / 100) * 10) / 10 : Math.round(it.b * (rate / 100)));
export function seatNames(s: V5State["seats"]): [string, "" | "vip"][] {
  const a: [string, "" | "vip"][] = [];
  for (let i = 1; i <= s.counter; i++) a.push([s.cp + i, ""]);
  for (let i = 1; i <= s.table; i++) a.push([s.tp + i, ""]);
  for (let i = 1; i <= s.vip; i++) a.push([s.vp + i, "vip"]);
  return a;
}
export const menuCount = (s: V5State): number => s.menu.reduce((a, c) => a + (c.on ? c.items.filter((i) => i.on).length : 0), 0);

// ── 要確認（モック checks 逐語＝同じ条件・同じ文言） ──
const mins = (t: string): number => { const a = String(t).split(":"); return (+a[0]) * 60 + (+a[1] || 0); };
const span = (f: string, t: string): [number, number] => { const a = mins(f); let b = mins(t); if (b <= a) b += 1440; return [a, b]; };
export function v5Checks(S: V5State): [number, string][] {
  const W: [number, string][] = []; const biz = span(S.shop.open, S.shop.close);
  S.rules.forEach((r, i) => {
    const sp = span(r.from, r.to); let a = sp[0], b = sp[1]; if (a < biz[0] - 60 && a + 1440 <= biz[1]) { a += 1440; b += 1440; }
    if (a < biz[0] || b > biz[1]) W.push([2, `料金ルール「${r.name}」の時間（${r.from}〜${r.to}）が営業時間（${S.shop.open}〜${S.shop.close}）からはみ出しています`]);
    if (!r.days.length) W.push([2, `料金ルール「${r.name}」の曜日が選ばれていません`]);
    if (r.seat === "vip" && S.seats.vip < 1) W.push([2, `料金ルール「${r.name}」は VIP 席向けですが、VIP 席がありません`]);
    for (let j = i + 1; j < S.rules.length; j++) { const q = S.rules[j];
      if (q.seat === r.seat && q.days.some((d) => r.days.indexOf(d) >= 0)) { const s2 = span(q.from, q.to); if (s2[0] < sp[1] && sp[0] < s2[1]) W.push([2, `「${r.name}」と「${q.name}」の時間が重なっています（上のルールが優先されます）`]); } }
  });
  if (S.vip.on && S.seats.vip < 1) W.push([1, "VIP 料金を使う設定ですが、VIP 席が 0 卓です"]);
  S.menu.forEach((c) => { if (!c.on) return; c.items.forEach((it) => { if (!it.on) return;
    if (!String(it.n).trim()) W.push([3, `${c.cat}に名前が空の商品があります`]);
    else if (!(+it.p > 0)) W.push([3, `「${it.n}」の値段が 0 円です`]);
    if (it.bt === "pct" && +it.b > 100) W.push([3, `「${it.n}」のバックが 100% を超えています`]); }); });
  if (S.pay.slide !== "none") { for (let k = 1; k < S.slideTiers.length; k++) { const asc = S.pay.slide !== "rate"; if (asc ? (+S.slideTiers[k][0] <= +S.slideTiers[k - 1][0]) : (+S.slideTiers[k][0] >= +S.slideTiers[k - 1][0])) W.push([4, `時給スライドの ${k + 1} 段目の順番が前の段と逆です（${asc ? "昇順" : "報酬率は降順"}にしてください）`]); } }
  if (+S.pay.trial < +S.pay.base) W.push([4, "体験入店の時給が基本時給より低くなっています"]);
  if (+S.kindRate.jo > +S.kindRate.hon || +S.kindRate.free > +S.kindRate.jo) W.push([4, "商品バックの割合が 本指名 ≥ 場内 ≥ フリー の順になっていません"]);
  if (S.punch.how === "device" && !S.devReg) W.push([7, "打刻を「店の端末だけ」にしていますが、店の端末が登録されていません"]);
  if (S.punch.gate && !S.devReg) W.push([6, "「出勤していない人はレジを使えない」が ON ですが、打刻する店の端末が登録されていません（端末を置かないお店は OFF に）"]);
  if (S.firstShift.from > S.firstShift.to) W.push([6, "最初のシフト期間の終了日が開始日より前です"]);
  return W;
}

// ── CSV（モック parseCsv 逐語＝9 列・見出し・不正行） ──
export const CSV_HEADER = "源氏名,本名,在籍区分,契約区分,待遇プラン,電話,メール,PIN,送り距離";
export const PIN_RE = /^\d{4,6}$/;
export const genPin = (): string => String(Math.floor(1000 + Math.random() * 9000));
export function parseCsv(text: string): V5CsvRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim()); if (!lines.length) return [];
  if (/源氏名/.test(lines[0])) lines.shift();
  return lines.map((l) => { let c: string[] = [], cur = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { q = !q; continue; } if (ch === "," && !q) { c.push(cur); cur = ""; continue; } cur += ch; } c.push(cur);
    while (c.length < 9) c.push(""); c = c.slice(0, 9).map((v) => v.trim());
    if (!c[2]) c[2] = "在籍"; if (!c[3]) c[3] = "業務委託"; if (!c[4]) c[4] = c[2] === "体入" ? "体験入店" : "基本プラン";
    let err = !c[0] ? "源氏名が空" : (["在籍", "体入"].indexOf(c[2]) < 0 ? "在籍区分が不正" : (["業務委託", "雇用"].indexOf(c[3]) < 0 ? "契約区分が不正" : ""));
    if (!err && c[7] && !PIN_RE.test(c[7])) err = "PIN は 4〜6 桁の数字"; if (!err && c[8] && ["近", "中", "遠"].indexOf(c[8]) < 0) err = "送り距離は 近／中／遠";
    return { c, err }; });
}
export const DIST_CODE: Record<string, string> = { "近": "near", "中": "mid", "遠": "far", near: "near", mid: "mid", far: "far" };

// ── 書込計画（既存 RPC・route）＝V5_SAVE_MAP の「あり」だけ ──
export type V5Step = { key: string; group: string; label: string; rpc?: string; args?: Record<string, unknown>; api?: { url: string; body: Record<string, unknown>; resultKey?: string }; useResult?: { from: string; as: string }; guard?: "seats_empty" | "products_empty" | "plans_empty" | "rules_empty"; argsOf?: "product_overrides" };
export type V5Ctx = {
  storeId: string; cutoff?: string;
  current: { round_unit: number; round_mode: string; time_mode: string; time_per: string; receipt: { address: string; tel: string; reg_no: string; footer: string }; mine: MineSettings;
    tax: { business_tax_status: string; price_display: string; invoice_status: string; invoice_reg_no: string | null; tax_rounding: string; card_surcharge_rate: number | null } };
  /** 端末登録（STEP 8）の idemKey＝下書きに持つ（再送で同じ） */ deviceIdemKey: string;
  /** スタッフ行の idemKey（行ごと） */ staffIdemKeys: string[];
};
const seatKind = (seat: string): string | null => (seat === "vip" ? "VIP" : seat === "counter" ? "カウンター" : seat === "table" ? "卓" : null);
const dowMask = (days: readonly string[]): number | null => { if (days.length >= 7) return null; let m = 0; days.forEach((d) => { const i = WD.indexOf(d as typeof WD[number]); if (i >= 0) m |= 1 << i; }); return m || null; };
const minOf = (hm: string): number => mins(hm) % 1440;
/** 商品の type＝分類名から（product_bulk_insert の 5 値） */
export function productTypeOf(cat: string, it: V5Item): "drink" | "champ" | "bottle" | "food" | "other" {
  if (/シャンパン|スパークリング/.test(cat)) return "champ";
  if (it.keep || /ボトル/.test(cat) || /（ボトル）/.test(it.n)) return "bottle";
  if (/軽食|フード|おつまみ/.test(cat)) return "food";
  if (/カラオケ/.test(cat)) return "other";
  return "drink";
}
export const PAYSLIP_OF: Record<V5State["payroll"]["mypage"], MineSettings["payslip_visibility"]> = { none: "off", net: "net_only", full: "detail" };
export const KIND_OF: Record<string, "employee" | "parttime" | "contractor"> = { "正社員": "employee", "契約社員": "employee", "アルバイト": "parttime", "業務委託": "contractor" };
export const PAY_KIND_OF: Record<string, "hourly" | "monthly" | "daily"> = { "時給": "hourly", "月給": "monthly", "日給": "daily" };
export const OKURI_MODE_OF: Record<V5State["payroll"]["okuriMode"], "flat" | "actual" | "store" | "none"> = { fixed: "flat", actual: "actual", store: "store", none: "none" };

export function buildV5Plan(S: V5State, ctx: V5Ctx): { steps: V5Step[]; deferred: { item: string; note: string }[] } {
  const s = ctx.storeId; const steps: V5Step[] = []; const deferred: { item: string; note: string }[] = [];
  const push = (st: V5Step) => steps.push(st);
  // 1) 店舗設定（settings_json の patch＝白名単のキーだけ）
  const patch: Record<string, unknown> = {
    name: S.shop.name.trim(), biz_type: S.type, billing_mode: "table", setup_done: false,
    sys_hourly: true, sys_backs: true, sys_sales_rate: false, sys_points: S.pay.slide === "point", sys_sales_slide: S.pay.slide === "sales", sys_point_slide: S.pay.slide === "point", sys_norms: S.pay.norma, sys_penalties: S.pay.norma, sys_bonus: S.pay.bonus,
    use_vip: S.seats.vip > 0, use_counter: S.seats.counter > 0,
    join_mode: S.join === "join" ? "join_set" : "extend_only",
    sys_drink_count_back: S.drinkBack, sales_split: S.salesSplit, bonus_tier_mode: S.bonusMode,
    settlement_cycle: S.payroll.period === "month" ? "monthly" : S.payroll.period === "half" ? "half" : "daily", pay_day: Math.max(1, Math.min(31, Math.round(S.payroll.payday || 1))), mid_pay: S.payroll.advance ? "advance" : "none",
    okuri_base_amount: Math.max(0, Math.min(99999, Math.round(S.payroll.okuri || 0))),
    trial_guarantee_days: Math.max(1, Math.min(90, Math.round(S.pay.trialDays || 1))),
    shift_auto_confirm_hours: Math.max(0, Math.min(168, Math.round(S.shift.auto || 0))),
    punch_methods: { self: S.punch.how === "any", proxy: true, kiosk: true },
    punch_round_unit: S.punch.round, punch_round_mode: "nearest",
    kiosk_features: { punch: S.reg.kiosk, register: S.reg.kiosk, shift: S.reg.kiosk },
    sys_cast_register: S.reg.castReg === "pay" ? 2 : S.reg.castReg === "order" ? 1 : 0,
    sys_staff_discount: S.reg.staffDisc === "limit" ? 1 : S.reg.staffDisc === "no" ? 2 : 0,
    pay_fee_rates: { card: Math.max(0, Math.min(100, Math.round(S.cardfee || 0))), emoney: 0, other: 0 },
    pay_discount_rates: { cash: S.cashOff ? Math.round(Math.max(0, Math.min(100, S.cashRate)) * 10) / 10 : 0, card: 0, other: 0 }, pay_discount_base: S.cashBase,
  };
  if (mig0190On()) patch.duty_gate = S.punch.gate === true;   // ★0190（裁定436）: 打刻ゲート＝boolean 明示（原則7）
  if (mig0191On()) {   // ★0191 ★1: 店設定 +5 キー（白名単＝set_store_profile）
    patch.kind_back_rate = { hon: pct100(S.kindRate.hon), jonai: pct100(S.kindRate.jo), free: pct100(S.kindRate.free) };
    patch.withholding_default_cast = S.payroll.whtCast; patch.withholding_default_staff = S.payroll.whtStaff;
    patch.cash_float_default = Math.max(0, Math.min(9_999_999, Math.round(S.float || 0)));
    patch.settlement_close_day = CLOSE_DAY_OF[S.payroll.close] ?? 31;
  }
  if (S.punch.how === "any") patch.punch_require_shift = S.punch.judge === "hard" ? "block" : "warn";
  if (S.seats.vip > 0 && S.svcVip !== S.svc) patch.service_rate_by_seat = { VIP: Math.max(0, Math.min(100, Math.round(S.svcVip))) };
  if (S.payroll.okuriMode === "fixed") patch.okuri_flat_tiers = [{ code: "near", name: "近距離", amount: S.payroll.okuriTiers[0] }, { code: "mid", name: "中距離", amount: S.payroll.okuriTiers[1] }, { code: "far", name: "遠距離", amount: S.payroll.okuriTiers[2] }];
  push({ key: "settings", group: "settings", label: "店舗設定（業態・使う制度・会計・シフト・打刻・キオスク）", rpc: "set_store_profile", args: { p_store_id: s, p_patch: patch } });
  push({ key: "okuri_mode", group: "settings", label: `送りの方式（${({ fixed: "定額を給与から引く", actual: "立替を給与から引く", store: "店負担", none: "送りなし" } as const)[S.payroll.okuriMode]}）`, rpc: "set_store_okuri_mode", args: { p_store_id: s, p_mode: OKURI_MODE_OF[S.payroll.okuriMode] } });
  push({ key: "receivable", group: "settings", label: `売掛（${S.reg.uri ? "使う" : "使わない"}）`, rpc: "set_store_receivable_policy", args: { p_store_id: s, p_policy: S.reg.uri ? "customer_only" : "disabled" } });
  if (S.pay.norma) push({ key: "norm_axes", group: "settings", label: "ノルマの軸", rpc: "set_store_norm_axes", args: { p_store_id: s, p_axes: { days: S.normaAxes.days, dohan: S.normaAxes.dohan, sales: S.normaAxes.sales, shimei: S.normaAxes.hon } } });
  // 税設定（端数・表示・インボイス）＝7 引数全値明示
  const reg = /^T[0-9]{13}$/.test(S.receipt.tno.trim()) ? S.receipt.tno.trim() : null;
  push({ key: "tax_config", group: "settings", label: `税設定（端数 ${({ floor: "切り捨て", round: "四捨五入", ceil: "切り上げ" } as const)[S.round]}・${S.tax === "in" ? "税込表示" : "税別表示"}・インボイス ${reg ? "登録" : "未登録"}）`, rpc: "set_store_tax_config",
    args: { p_store_id: s, p_business_tax_status: ctx.current.tax.business_tax_status, p_price_display: S.tax === "in" ? "tax_included" : "tax_excluded", p_invoice_status: reg ? "registered" : "unregistered", p_invoice_reg_no: reg, p_tax_rounding: S.round, p_card_surcharge_rate: ctx.current.tax.card_surcharge_rate } });
  push({ key: "receipt", group: "settings", label: "領収書（発行者名・登録番号・但し書き・住所）", rpc: "set_store_invoice_profile", args: { p_store_id: s, p_legal_name: (S.receipt.name || S.shop.name).trim(), p_trade_name: S.shop.name.trim(), p_receipt_default_desc: S.receipt.tadashi.trim() } });
  push({ key: "receipt2", group: "settings", label: "店舗情報（住所・登録番号＝領収書の表記）", rpc: "set_store_receipt_profile", args: { p_store_id: s, p_address: S.shop.addr.trim(), p_tel: ctx.current.receipt.tel, p_reg_no: reg ?? ctx.current.receipt.reg_no, p_footer: ctx.current.receipt.footer } });
  // マイページ
  const mine: MineSettings = { ...ctx.current.mine, payslip_visibility: PAYSLIP_OF[S.payroll.mypage], ranking: S.mine.rank, ranking_show_others: S.mine.rank && S.mine.rankOthers === "top", drink_claim: S.mine.drink, punch_correction_request: S.mine.fix, reservation_request: S.mine.resv, shift_request_mode: S.shift.mode === "want" ? "shift" : S.shift.mode === "store" && mig0191On() ? "store" : "off_only" };   // ★0191 ★4: 「店が決める」＝'store'
  const mp = mineSettingsPatchOf(ctx.current.mine, mine);
  if (Object.keys(mp).length) push({ key: "mine", group: "settings", label: `キャストのマイページ（${Object.keys(mp).length} 項目）`, rpc: "set_store_mine_settings", args: { p_store_id: s, p_settings: mp } });
  // 2) 営業時間 7 曜日＋切替
  const close30 = (() => { const o = mins(S.shop.open), c = mins(S.shop.close); return c <= o ? `${String(Math.floor(c / 60) + 24).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}` : S.shop.close; })();
  for (let dow = 0; dow <= 6; dow++) { const closed = S.shop.holidays.includes(WD[dow]);
    push({ key: `hours_${dow}`, group: "hours", label: closed ? `営業時間（${WD[dow]}）定休日` : `営業時間（${WD[dow]}）${S.shop.open}〜${close30}`, rpc: "set_store_business_hours", args: { p_store_id: s, p_dow: dow, p_is_closed: closed, p_open_hm: closed ? null : S.shop.open, p_close_hm: closed ? null : close30 } }); }
  push({ key: "cutoff", group: "hours", label: `営業日の切替時刻 ${S.shop.cut}`, rpc: "set_store_biz_cutoff", args: { p_store_id: s, p_hm: S.shop.cut } });
  // 3) 席（既存 0 のときだけ）
  seatNames(S.seats).forEach(([name, v], i) => push({ key: `seat_${i}`, group: "seats", label: `席 ${name}`, rpc: "set_seat", guard: "seats_empty", args: { p_id: null, p_store_id: s, p_name: name, p_kind: v === "vip" ? "VIP" : i < S.seats.counter ? "カウンター" : "卓", p_sort_order: i + 1, p_is_active: true } }));
  // 4) 料金
  const r0 = S.rules[0];
  push({ key: "pricing", group: "pricing", label: "指名料・同伴料・サービス料・カード手数料", rpc: "set_store_pricing", args: { p_store_id: s, p_hon_fee: S.fees.hon, p_jonai_fee: S.fees.jo, p_dohan_fee: S.fees.dohan, p_service_rate: Math.round(S.svc), p_card_tax_rate: Math.round(S.cardfee || 0), p_round_unit: ctx.current.round_unit, p_round_mode: ctx.current.round_mode } });
  if (r0) { const e0 = r0.ext.find((e) => e[2]) ?? r0.ext[0];
    push({ key: "time_pricing", group: "pricing", label: `${r0.min ? `セット ${r0.min}分 ¥${r0.set}` : `チャージ ¥${r0.set}`}・延長 ${e0 ? `${e0[0]}分 ¥${e0[1]}` : "なし"}`, rpc: "set_store_time_pricing", args: { p_store_id: s, p_set_min: r0.min || 60, p_set_fee: r0.set, p_ext_min: e0 ? e0[0] : 30, p_ext_fee: e0 ? e0[1] : 0, p_time_mode: ctx.current.time_mode, p_time_per: ctx.current.time_per } }); }
  const ruleBase = (key: string, label: string, args: Record<string, unknown>) => push({ key, group: "pricing", label, rpc: "set_pricing_rule", guard: "rules_empty", args: { p_id: null, p_store_id: s, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: null, p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 0, p_duration_min: null, p_priority: 100, p_is_active: true, p_name: label, p_tax_category: "taxable_10", p_category_id: null, p_billing_unit: null, p_is_default_ext: false, ...args } });
  const commonOf = (r: V5Rule, i: number) => { const allHours = r.from === S.shop.open && r.to === S.shop.close; const tf = allHours ? null : minOf(r.from), tt = allHours ? null : minOf(r.to); return { p_seat_kind: seatKind(r.seat), p_dow_mask: dowMask(r.days), p_time_from_min: tf, p_time_to_min: tt, p_priority: (i + 1) * 10 }; };
  S.rules.forEach((r, i) => ruleBase(`rule_${i}`, r.name, { ...commonOf(r, i), p_fee_kind: "set", p_amount: r.set, p_duration_min: r.min || null }));
  // 延長パターン＝店で 3 本まで（裁定385＝set_pricing_rule 'too many extension'）: パターン数の多いルールから順に詰め、既定は最初の 1 本。入り切らない分は「後で（マスタ › 料金）」
  let extLeft = 3; let extDropped = 0; let defSet = false; const extSeen = new Set<string>();
  S.rules.map((r, i) => ({ r, i })).sort((a, b) => b.r.ext.length - a.r.ext.length || a.i - b.i).forEach(({ r, i }) => {
    r.ext.forEach((e, j) => { const key = `${seatKind(r.seat) ?? "all"}:${e[0]}`; if (extLeft <= 0 || extSeen.has(key)) { extDropped++; return; } extSeen.add(key); extLeft--; const isDef = !defSet && !!e[2]; if (isDef) defSet = true;
      ruleBase(`rule_${i}_ext_${j}`, `${r.name} 延長 ${e[0]}分`, { ...commonOf(r, i), p_fee_kind: "extension", p_amount: e[1], p_duration_min: e[0], p_is_default_ext: isDef }); });
  });
  if (extDropped > 0) deferred.push({ item: `延長パターン ${extDropped} 本`, note: "店で 3 本まで（裁定385）＝残りはマスタ › 料金で" });
  if (S.vip.on) { ruleBase("rule_vip", `VIP 料金（${S.vip.mode === "table" ? "卓ごと" : "人ごと"}）`, { p_fee_kind: "vip_charge", p_seat_kind: "VIP", p_amount: S.vip.amt, p_billing_unit: S.vip.mode === "person" ? "person" : "table" });
    push({ key: "rule_vip_timing", group: "pricing", label: `VIP 料金のタイミング（${S.vip.per === "set" ? "セットごと" : "入店時に 1 回"}）`, rpc: "set_pricing_rule_vip", useResult: { from: "rule_vip", as: "p_id" }, args: { p_vip_timing: S.vip.per === "set" ? "per_set" : "on_entry", p_vip_ext_amount: S.vip.per === "set" ? S.vip.ext : null } }); }
  // 5) 商品（既存 0 のときだけ）＋バックの上書き
  const items: { name: string; type: string; price: number; cost: null; category: string; back: { mode: "rate" | "unit4"; value: number | null; unit4: { hon: number; jonai: number; dohan: number; free: number } | null }; keep: boolean }[] = [];
  S.menu.forEach((c) => { if (!c.on) return; c.items.forEach((it) => { if (!it.on || !String(it.n).trim()) return;
    const b = +it.b || 0; const jo = it.byKind && it.bj !== null ? +it.bj : kindVal(it, S.kindRate.jo); const fr = it.byKind && it.bf !== null ? +it.bf : kindVal(it, S.kindRate.free);
    items.push({ name: it.n.trim(), type: productTypeOf(c.cat, it), price: Math.max(0, Math.round(it.p)), cost: null, category: c.cat,
      back: it.bt === "pct" ? { mode: "rate", value: Math.round(b), unit4: null } : { mode: "unit4", value: null, unit4: { hon: Math.round(b), jonai: Math.round(jo), dohan: Math.round(b), free: Math.round(fr) } }, keep: it.keep }); }); });
  if (items.length) { push({ key: "products_bulk", group: "products", label: `商品 ${items.length} 件`, rpc: "product_bulk_insert", guard: "products_empty", args: { p_store_id: s, p_items: items.map((x) => ({ name: x.name, type: x.type, price: x.price, cost: x.cost, category: x.category })) } });
    if (items.some((x) => x.back.mode === "rate" ? (x.back.value ?? 0) > 0 : (x.back.unit4?.hon ?? 0) > 0)) push({ key: "products_overrides", group: "overrides", label: `バックの上書き ${items.filter((x) => x.back.mode === "rate" ? (x.back.value ?? 0) > 0 : (x.back.unit4?.hon ?? 0) > 0).length} 件`, rpc: "set_product", argsOf: "product_overrides", guard: "products_empty" }); }
  // 6) 待遇プラン（基本・体験入店）
  const slideArr = (S.pay.slide === "sales" || S.pay.slide === "point") ? S.slideTiers.filter((t) => t[0] > 0).map((t) => ({ at: t[0], wage: t[1] })) : [];
  const planArgs = (name: string, base: number, withSlide: boolean) => ({ p_id: null, p_store_id: s, p_name: name, p_base: base, p_hon_back: S.back.hon, p_jonai_back: S.back.jo, p_dohan_back: S.back.dohan,
    p_sales_slide: withSlide && S.pay.slide === "sales" ? slideArr : [], p_point_slide: withSlide && S.pay.slide === "point" ? slideArr : [], p_is_active: true, p_hon_back_mode: "per_count", p_hon_back_rate: null, p_jonai_back_mode: "per_count", p_jonai_back_rate: null,
    p_dohan_back_mode: "per_count", p_dohan_back_rate: null, p_product_back_mode: "product_rule", p_product_back_rate: null, p_product_back_fixed: null, p_product_back_fixed_hon: null, p_product_back_fixed_jonai: null, p_product_back_fixed_free: null,
    p_slide_period: S.slidePeriod === "half" ? "half" : "monthly", p_slide_basis: S.pay.slide === "point" ? "pt" : "sales", p_slide_rank_ids: [],
    p_norm_days_target: S.pay.norma && S.normaAxes.days ? S.normaGoal.days : null, p_norm_dohan_target: S.pay.norma && S.normaAxes.dohan ? S.normaGoal.dohan : null, p_norm_sales_target: S.pay.norma && S.normaAxes.sales ? S.normaGoal.sales : null, p_norm_shimei_target: S.pay.norma && S.normaAxes.hon ? S.normaGoal.hon : null,
    p_slide_apply: "next", p_slide_method: null, p_pt_rules: S.pay.slide === "point" ? { hon: S.pt.hon, jonai: S.pt.jo, dohan: S.pt.dohan, sales_yen_per_pt: S.pt.salesPer } : null });
  push({ key: "comp_0", group: "comp", label: `待遇プラン「基本プラン」時給 ¥${S.pay.base}`, rpc: "set_comp_plan", guard: "plans_empty", args: planArgs("基本プラン", S.pay.base, true) });
  push({ key: "comp_1", group: "comp", label: `待遇プラン「体験入店」時給 ¥${S.pay.trial}（${S.pay.trialDays} 日）`, rpc: "set_comp_plan", guard: "plans_empty", args: planArgs("体験入店", S.pay.trial, false) });
  if (S.pay.slide === "rate") deferred.push({ item: "報酬率スライドの段", note: "器＝待遇プランの pay_rate_tiers（段の写像は待遇プランの画面で）" });
  // 7) ノルマの減額（提案型＝set_penalty_config）
  if (S.pay.norma) { const P = S.normaPen; const flat = (k: keyof typeof P) => (P[k].m === "flat" ? P[k].a : 0), per = (k: keyof typeof P) => (P[k].m === "per" ? P[k].a : 0);
    push({ key: "penalty", group: "comp", label: "ノルマ未達の減額（提案型）", rpc: "set_penalty_config", args: { p_store_id: s, p_fine_absent: 10000, p_fine_late: 3000, p_hours_per_shift: 5, p_norm_on: true, p_norm_days_flat: S.normaAxes.days ? flat("days") : 0, p_norm_days_per: S.normaAxes.days ? per("days") : 0, p_norm_dohan_flat: S.normaAxes.dohan ? flat("dohan") : 0, p_norm_dohan_per: S.normaAxes.dohan ? per("dohan") : 0,
      p_late_grace_min: 10, p_early_grace_min: 30, p_over_grace_min: 90, p_norm_shimei_flat: S.normaAxes.hon ? flat("hon") : 0, p_norm_shimei_per: S.normaAxes.hon ? per("hon") : 0, p_norm_sales_flat: S.normaAxes.sales ? flat("sales") : 0, p_norm_sales_per: S.normaAxes.sales ? per("sales") : 0, p_norm_sales_unit: 10000 } }); }
  // 8) スタッフ（route＝staff/create→契約→権限→PIN）
  S.staff.forEach((st, i) => { if (!st.n.trim()) return; const k = `staff_${i}`;
    push({ key: k, group: "staff", label: `スタッフ ${st.n.trim()}（${st.role}・${st.perm === "manager" ? "店長" : "スタッフ"}）`, api: { url: "/api/staff/create", body: { name: st.n.trim(), storeId: s, role: st.perm, idemKey: ctx.staffIdemKeys[i] ?? "" }, resultKey: "membership_id" } });
    const pk = PAY_KIND_OF[st.basis] ?? "hourly";
    push({ key: `${k}_contract`, group: "staff", label: `${st.n.trim()} の働き方（${st.kind}・${st.basis} ¥${st.amt}）`, rpc: "staff_contract_set", useResult: { from: k, as: "p_membership_id" }, args: { p_patch: { contract_kind: KIND_OF[st.kind] ?? "employee", pay_kind: pk, [pk]: Math.max(0, Math.round(st.amt || 0)) } } });
    if (st.perm === "staff") push({ key: `${k}_perms`, group: "staff", label: `${st.n.trim()} の権限（シフトを組める＝${st.shiftOk ? "ON" : "OFF"}）`, rpc: "set_staff_perms", useResult: { from: k, as: "p_membership_id" }, args: { p_can_register: false, p_can_crm: false, p_can_shift: st.shiftOk, p_can_view_backs: false, p_can_close: false, p_can_reopen: false } });
    push({ key: `${k}_pin`, group: "staff", label: `${st.n.trim()} の PIN`, rpc: "set_staff_pin", useResult: { from: k, as: "p_membership_id" }, args: { p_pin: (mig0191On() ? PIN_RE : /^\d{4}$/).test(st.pin) ? st.pin : genPin() } }); });   // ★0191 ★3: PIN 4〜6 桁
  // 9) シフト（最初の期間・曜日別必要人数）
  const due = (() => { const d = new Date(S.firstShift.from + "T00:00:00"); d.setDate(d.getDate() - Math.max(0, Math.round(S.shift.due || 0))); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  push({ key: "shift_period", group: "shift", label: `最初のシフト期間 ${S.firstShift.from}〜${S.firstShift.to}（${S.shift.mode === "store" ? "店が決める" : S.firstShift.start ? "募集を始める" : "下書き"}）`, rpc: "shift_period_set", args: { p_id: null, p_store_id: s, p_start_date: S.firstShift.from, p_end_date: S.firstShift.to, p_wish_deadline: S.shift.mode === "store" ? null : due, p_status: S.firstShift.start && S.shift.mode !== "store" ? "open" : "draft" } });
  S.shift.need.forEach((n, dow) => { if (S.shop.holidays.includes(WD[dow]) || !(n > 0)) return; push({ key: `need_${dow}`, group: "shift", label: `必要人数（${WD[dow]}）${n} 人`, rpc: "set_staffing_need", args: { p_store_id: s, p_dow: dow, p_required: Math.round(n), p_from_min: 0, p_to_min: 1440 } }); });
  // 10) 店の端末（route）
  if (S.reg.kiosk && S.devReg) push({ key: "device", group: "reg", label: `店の端末「${S.devName}」を登録（端末アカウントの発行）`, api: { url: "/api/kiosk/provision", body: { action: "provision", storeId: s, label: S.devName, idemKey: ctx.deviceIdemKey, purpose: "register" }, resultKey: "device_id" } });
  // 11) 完了（setup_done）
  push({ key: "done", group: "done", label: "初期設定の完了", rpc: "set_store_profile", args: { p_store_id: s, p_patch: { setup_done: true, slide_apply: "next", settlement_presets: DEFAULT_SETTLEMENT_PRESETS } } });
  // 器が無い項目（0191）
  if (!mig0191On() && (S.payroll.whtCast !== "hostess" || S.payroll.whtStaff !== "none")) deferred.push({ item: "源泉区分の既定（委託キャスト／委託スタッフ）", note: "店の既定＝0191（人ごとの区分は給与の画面で）" });
  if (!mig0191On() && (S.kindRate.hon !== 100 || S.kindRate.jo !== 50 || S.kindRate.free !== 30)) deferred.push({ item: "指名区分ごとの割合（店）", note: "店の割合＝0191（商品ごとの場内／フリーは円のとき保存済み）" });
  if (!mig0191On() && S.menu.some((c) => c.items.some((it) => it.bt === "pct" && it.byKind))) deferred.push({ item: "商品ごとの場内／フリーの率（%）", note: "0191（円の商品は保存済み）" });
  if (!mig0191On() && S.shift.mode === "store") deferred.push({ item: "シフトの集め方「店が決める」", note: "0191（いまは休み希望のみとして保存）" });
  if (!mig0190On() && S.punch.gate) deferred.push({ item: "出勤していない人はレジを使えない（打刻ゲート）", note: "0190 の後（MIG_0190_APPLIED）" });
  if (!mig0191On()) deferred.push({ item: "釣銭準備金（締めの基準額）", note: "0191（いまは日報の締めで毎回入力）" });
  if (!mig0191On() && S.payroll.close !== "末日") deferred.push({ item: `締め日（${S.payroll.close}）`, note: "月次の締めは末日固定＝0191" });
  if (!mig0191On() && S.staff.some((st) => st.n.trim() && st.pin && !/^\d{4}$/.test(st.pin))) deferred.push({ item: "PIN 5〜6 桁", note: "0191（いまは 4 桁＝5〜6 桁は自動で 4 桁を振る）" });
  if (!S.mine.late || !S.mine.norma || !S.mine.bonus) deferred.push({ item: "マイページ（遅刻連絡・ノルマ進捗・出勤ボーナスの表示）", note: "0191（いまは常に出る）" });
  return { steps, deferred };
}

/** 完了画面＝キャスト 1 人の登録計画（cast_create→区分→プラン→PIN→送り距離・招待は route） */
export function castPlanOf(c: V5Cast, storeId: string, planIds: { basic: string | null; trial: string | null }, okuriFixed: boolean): V5Step[] {
  const out: V5Step[] = []; const k = `cast_${c.g}`;
  out.push({ key: k, group: "cast", label: `キャスト ${c.g}`, rpc: "cast_create", args: { p_store_id: storeId, p_name: c.g, p_birthday: c.birthday || null, p_real_name: c.n?.trim() || null, p_kind: c.st === "体入" ? "体入" : null } });
  out.push({ key: `${k}_emp`, group: "cast", label: `${c.g} の契約区分（${c.kind}）`, rpc: "set_cast_employment", useResult: { from: k, as: "p_cast_id" }, args: { p_employment: c.kind === "雇用" ? "雇用" : "委託", p_valid_from: new Date().toISOString().slice(0, 10) } });
  const pid = c.st === "体入" || c.plan === "体験入店" ? planIds.trial : planIds.basic;
  if (pid) out.push({ key: `${k}_plan`, group: "cast", label: `${c.g} の待遇プラン（${c.st === "体入" || c.plan === "体験入店" ? "体験入店" : "基本プラン"}）`, rpc: "set_cast_plan", useResult: { from: k, as: "p_cast_id" }, args: { p_plan_id: pid, p_overrides: {} } });
  out.push({ key: `${k}_pin`, group: "cast", label: `${c.g} の PIN`, rpc: "set_cast_pin", useResult: { from: k, as: "p_cast_id" }, args: { p_pin: (mig0191On() ? PIN_RE : /^\d{4}$/).test(c.pin) ? c.pin : genPin() } });   // ★0191 ★3
  if (okuriFixed && c.dist) out.push({ key: `${k}_okuri`, group: "cast", label: `${c.g} の送りの距離区分`, rpc: "set_cast_okuri_tier", useResult: { from: k, as: "p_cast_id" }, args: { p_tier: DIST_CODE[c.dist] ?? "mid" } });
  return out;
}

// ── ④ 保存先の表（項目｜保存先｜あり／なし） ──
export type V5SaveMap = { step: number; item: string; dest: string; has: boolean };
export const V5_SAVE_MAP: readonly V5SaveMap[] = [
  { step: 1, item: "業態 5 種のテンプレ値", dest: "lib/nox/setup/v5.ts（V5_TPL／V5_MENU＝正本モックの写経・保存は各 STEP の RPC）", has: true },
  { step: 1, item: "店舗名・住所・営業時間・切替・定休日", dest: "set_store_profile{name}／set_store_receipt_profile{address}／set_store_business_hours×7（定休日＝is_closed）／set_store_biz_cutoff", has: true },
  { step: 2, item: "席・卓の一括作成と名前の頭", dest: "set_seat×N（kind 卓／カウンター／VIP・名前＝頭＋番号）・use_vip／use_counter", has: true },
  { step: 3, item: "料金ルール（時間帯・曜日・席種・延長パターン）", dest: "set_pricing_rule（set／extension・dow_mask・time_from/to・seat_kind・is_default_ext＝EXT）＋set_store_time_pricing（先頭行）", has: true },
  { step: 3, item: "サービス料 全席・VIP", dest: "set_store_pricing{service_rate}／settings service_rate_by_seat{VIP}（0181）", has: true },
  { step: 3, item: "VIP 料金（卓ごと／人ごと・セットごと／入店時）", dest: "set_pricing_rule vip_charge（billing_unit table／person）＋set_pricing_rule_vip（per_set／on_entry・延長 1 回あたり）", has: true },
  { step: 3, item: "指名・同伴料", dest: "set_store_pricing{hon_fee, jonai_fee, dohan_fee}", has: true },
  { step: 3, item: "金額の表示（税込／税別）・合流", dest: "set_store_tax_config{price_display}／settings join_mode", has: true },
  { step: 4, item: "メニュー一括（名前・値段・キープ可・バック 円／%）", dest: "product_bulk_insert＋set_product（unit4／rate）・キープ可＝type bottle", has: true },
  { step: 4, item: "指名区分ごとの商品バック（本指名の値＋店の割合）", dest: "商品ごと＝products.unit4_json{hon,jonai,free}（円のとき）／店の割合 3 列＝なし", has: mig0191On() },
  { step: 4, item: "商品ごとの個別 場内・フリー（%）", dest: "なし（products に率の区分別列が無い）", has: mig0191On() },
  { step: 5, item: "ドリンク本数バック ON／OFF", dest: "settings sys_drink_count_back（0175）", has: true },
  { step: 5, item: "時給・体入・体入日数", dest: "set_comp_plan「基本プラン」「体験入店」／settings trial_guarantee_days", has: true },
  { step: 5, item: "スライド 3 種（売上・ポイント・報酬率）", dest: "comp_plans.sales_slide／point_slide（＋pt_rules）／pay_rate_tiers（報酬率の段の写像は画面で）", has: true },
  { step: 5, item: "ノルマ 4 軸と減額（提案型）", dest: "set_store_norm_axes／set_comp_plan{norm_*_target}／set_penalty_config", has: true },
  { step: 5, item: "達成ボーナス（段の数え方）", dest: "settings sys_bonus／bonus_tier_mode", has: true },
  { step: 5, item: "売上の数え方", dest: "settings sales_split", has: true },
  { step: 5, item: "給与の期間・支払日", dest: "settings settlement_cycle／pay_day", has: true },
  { step: 5, item: "締め日（15／20／25 日）", dest: "なし（月次は末日固定）", has: mig0191On() },
  { step: 5, item: "源泉区分の既定（委託キャスト／委託スタッフ）", dest: "なし（人ごと＝set_withholding_kind・店の既定 2 列は無い）", has: mig0191On() },
  { step: 5, item: "前払・日次精算", dest: "settings mid_pay／settlement_cycle=daily（0188＝settlement は daily の店だけ）", has: true },
  { step: 5, item: "送り 4 方式＋距離 3 段", dest: "set_store_okuri_mode／settings okuri_flat_tiers（0180）・okuri_base_amount", has: true },
  { step: 5, item: "マイページに出すもの", dest: "set_store_mine_settings（給与明細・ランキング・ドリンク申告・修正申請・予約申請）", has: true },
  { step: 5, item: "マイページ（遅刻連絡・ノルマ進捗・出勤ボーナスの表示）", dest: "なし（mine_settings にキーが無い＝常に出る）", has: false },
  { step: 6, item: "スタッフ（職種・権限・シフトを組める・雇用形態・給与・PIN）", dest: "/api/staff/create／staff_contract_set{contract_kind, pay_kind, 額}／set_staff_perms{can_shift}／set_staff_pin（4 桁）", has: true },
  { step: 6, item: "PIN 4〜6 桁", dest: "なし（set_staff_pin／set_cast_pin は 4 桁固定）", has: mig0191On() },
  { step: 7, item: "シフトの集め方（希望・休み希望）・締切・自動確定・最初の期間", dest: "mine_settings shift_request_mode／shift_period_set{wish_deadline, status}／settings shift_auto_confirm_hours", has: true },
  { step: 7, item: "シフトの集め方「店が決める」", dest: "なし（shift_request_mode は 2 値）", has: mig0191On() },
  { step: 7, item: "曜日別必要人数", dest: "set_staffing_need（0189＝翌 24:00 まで）", has: true },
  { step: 7, item: "打刻の場所・条件に合わないとき・丸め", dest: "settings punch_methods／punch_require_shift／punch_round_unit・mode", has: true },
  { step: 7, item: "打刻ゲート（出勤していない人はレジを使えない）", dest: "なし（0190 duty_gate＝MIG_0190_APPLIED の配下）", has: mig0190On() },
  { step: 8, item: "キオスク ON・キャストのレジ 3 段階・スタッフの割引 3 段階・売掛", dest: "settings kiosk_features／sys_cast_register（裁定420）／sys_staff_discount（裁定421）／set_store_receivable_policy", has: true },
  { step: 8, item: "店の端末の登録（端末アカウント発行）", dest: "/api/kiosk/provision（purpose register・初期 PW は完了画面で 1 回）", has: true },
  { step: 8, item: "釣銭準備金", dest: "なし（daily_report_close の p_cash_float＝毎回入力）", has: mig0191On() },
  { step: 8, item: "カード手数料・現金割引（0187）・丸め", dest: "set_store_pricing{card_tax_rate}／settings pay_fee_rates／pay_discount_rates・pay_discount_base／set_store_tax_config{tax_rounding}", has: true },
  { step: 8, item: "領収書（発行者・登録番号・但し書き）", dest: "set_store_invoice_profile／set_store_receipt_profile{reg_no}／set_store_tax_config{invoice_status}", has: true },
  { step: 9, item: "完了画面＝キャスト 1 人ずつ・CSV（9 列・PIN・送り距離）・PIN 一覧印刷", dest: "cast_create（生年月日が必須＝18 歳判定）／set_cast_employment／set_cast_plan／set_cast_pin／set_cast_okuri_tier／招待＝/api/cast/invite（メール）", has: true },
  { step: 0, item: "入力の自動保存（org 単位の下書き・再開）", dest: "なし（localStorage＝店ごと・端末ごと。org 単位の表は 0191）", has: mig0191On() },
];

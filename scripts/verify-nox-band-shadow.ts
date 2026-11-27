/*
 * verify:nox-band-shadow — ★裁定515-3（2026-11-27 09:50 Agoora）料金適用ルールの赤い警告に「この行を上へ動かす」ボタン（画面だけ・段ア）。
 *   DB に触れない（純関数と画面の配線の照合・f0 の鎖には入れていない＝CC が足す）。
 *  (1) 純関数 lib/nox/pricing/band-shadow：当たらない下の帯（上の広い帯が条件を覆い、同じ種類の有効な行を持つ）・覆う一番上の帯・
 *      狭い帯が上の重なりは出さない・一部の重なりは今の警告のまま・無効の行は覆わない・区分・日をまたぐ時間帯・曜日 null と 127
 *  (2) 並べ替え：下の帯を覆う一番上の帯のすぐ上へ（全件の並び）・範囲外と古い並びは null・直した後は警告が消える（デモ ACE／LUNA の形）
 *  (3) 乱数：どの当たらない帯も、直した並びでは当たる（上の帯は動かない）・帯の数は変わらない
 *  (5) 既定の延長の印（0173:158＝並びより先に効く）：ACE の形はボタンなし・警告が残る／延長以外の種類は直る／並びに依らない
 *  (4) 画面の配線：∧∨ とボタンが同じ applyBandOrder（pricing_rule_reorder・初回の柵）・確認の窓なし・成功で読み直す・今の重複の文は残す
 *  使い方: npm run verify:nox-band-shadow
 */
import fs from "node:fs";
import {
  bandWarningsOf, bandCoversOf, bandHidesOf, bandsOverlapOf, bandRangeOf, moveAboveOf, bandShadowFixOrderOf, defaultExtBlockerOf,
  BAND_SHADOW_HEAD_JA, BAND_SHADOW_BTN_JA, BAND_SHADOW_DONE_JA, BAND_DEFAULT_EXT_JA, BAND_DEFAULT_EXT_WHERE_JA, BAND_DEFAULT_EXT_HEAD_JA, type BandCond,
} from "../lib/nox/pricing/band-shadow";

let ok = 0; const fails: string[] = [];
const expect = (label: string, cond: boolean, detail?: unknown) => { if (cond) ok++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };

const CUT = 360; // 営業日の区切り 06:00
const B = (key: string, o: Partial<BandCond>): BandCond => {
  const kinds = o.kinds ?? ["set"];
  return { key, seat_kind: null, dow_mask: null, from: null, to: null, category_id: null, kinds, activeKinds: o.activeKinds ?? kinds, ...o };
};
const keysOf = (bs: BandCond[]) => bs.map((b) => b.key);
const reorder = (bs: BandCond[], order: string[]) => order.map((k) => bs.find((b) => b.key === k)!);

// ── (1) 純関数 ──
{
  // デモ CLUB ACE の種（payload）の形から既定の延長の印を除いた形（印ありの本当の ACE は (5)）：平日（全席種・月〜木）・週末（全席種・金土）・VIP 平日（延長＋VIP チャージ）・VIP 金土（VIP チャージ）
  const ace = [
    B("wd", { dow_mask: 15, kinds: ["set", "extension"] }),
    B("we", { dow_mask: 48, kinds: ["set", "extension"] }),
    B("vipwd", { seat_kind: "VIP", dow_mask: 15, kinds: ["extension", "vip_charge"] }),
    B("vipwe", { seat_kind: "VIP", dow_mask: 48, kinds: ["vip_charge"] }),
  ];
  const w = bandWarningsOf(ace, CUT);
  expect("(1-1) ACE（印なし）：VIP 平日の延長は上の全席種・平日に覆われて当たらない（1 行・覆う帯は平日）・一部の重なりは無い",
    w.shadows.length === 1 && w.shadows[0].lower === 2 && w.shadows[0].upper === 0 && w.shadows[0].lowerKey === "vipwd" && w.shadows[0].upperKey === "wd" && w.overlaps.length === 0, w);
  const fixed = bandShadowFixOrderOf(keysOf(ace), w.shadows[0]);
  expect("(1-2) ACE（印なし）：直す並び＝VIP 平日を平日のすぐ上へ（ほかの帯の順は変えない）", JSON.stringify(fixed) === JSON.stringify(["vipwd", "wd", "we", "vipwe"]), fixed);
  const w2 = bandWarningsOf(reorder(ace, fixed!), CUT);
  expect("(1-3) ACE（印なし）：直した後は警告が消える（当たらない帯 0・重なりの組 0＝狭い帯が上は出さない）", w2.shadows.length === 0 && w2.overlaps.length === 0, w2);

  // CLUB LUNA の形：全日の平日の上に、平日アーリー（20:00-20:59）が下
  const luna = [B("all", { dow_mask: 31, kinds: ["set", "extension"] }), B("early", { dow_mask: 31, from: 1200, to: 1259, kinds: ["set", "extension"] })];
  const wl = bandWarningsOf(luna, CUT);
  expect("(1-4) LUNA：アーリーは全日の帯に覆われて当たらない→直すと警告 0", wl.shadows.length === 1 && wl.shadows[0].lowerKey === "early"
    && (() => { const o = bandShadowFixOrderOf(keysOf(luna), wl.shadows[0])!; const x = bandWarningsOf(reorder(luna, o), CUT); return x.shadows.length === 0 && x.overlaps.length === 0; })(), wl);

  // 覆う帯が 2 つ：一番上の帯のすぐ上へ
  const two = [B("x", {}), B("y", { dow_mask: 127 }), B("mid", { seat_kind: "卓" }), B("vip", { seat_kind: "VIP", dow_mask: 1 })];
  const wt = bandWarningsOf(two, CUT);
  const sv = wt.shadows.find((s) => s.lowerKey === "vip");
  expect("(1-5) 覆う帯が 2 つ以上：upper は一番上の帯（x）・帯ごとに 1 件", !!sv && sv.upper === 0 && wt.shadows.filter((s) => s.lowerKey === "vip").length === 1, wt);
  expect("(1-6) 曜日 null と 127 は同じ（毎日）＝下の 127 の帯も当たらない", wt.shadows.some((s) => s.lowerKey === "y" && s.upperKey === "x"), wt);
  expect("(1-7) 直すと vip は x の上（先頭）", JSON.stringify(bandShadowFixOrderOf(keysOf(two), sv!)) === JSON.stringify(["vip", "x", "y", "mid"]));

  // 無効の行は覆わない
  const inactive = [B("broad", { kinds: ["extension"], activeKinds: [] }), B("vip", { seat_kind: "VIP", kinds: ["extension"] })];
  const wi = bandWarningsOf(inactive, CUT);
  expect("(1-8) 上の広い帯が無効＝当たらない帯にしない・重なりの警告にも出さない", wi.shadows.length === 0 && wi.overlaps.length === 0 && !bandHidesOf(inactive[0], inactive[1], CUT), wi);
  // 種類が一部だけ有効：下の種類に有効なものがあれば覆う
  const partKind = [B("broad", { kinds: ["set", "extension"], activeKinds: ["extension"] }), B("vip", { seat_kind: "VIP", kinds: ["extension"] })];
  expect("(1-9) 上の帯の延長の行が有効なら、下の延長の行は当たらない", bandWarningsOf(partKind, CUT).shadows.length === 1);
  const otherKind = [B("broad", { kinds: ["set"] }), B("vip", { seat_kind: "VIP", kinds: ["extension"] })];
  expect("(1-10) 共通の種類が無い＝重ならない（今の検出と同じ）", bandWarningsOf(otherKind, CUT).shadows.length === 0 && bandWarningsOf(otherKind, CUT).overlaps.length === 0 && !bandsOverlapOf(otherKind[0], otherKind[1], CUT));

  // 一部の重なり：どちらも覆わない
  const partial = [B("a", { from: 1200, to: 1380 }), B("b", { from: 1320, to: 1500 })];
  const wp = bandWarningsOf(partial, CUT);
  expect("(1-11) どちらも覆わない重なり＝今の重複の警告のまま（当たらない帯にはしない）", wp.shadows.length === 0 && wp.overlaps.length === 1 && wp.overlaps[0][0] === 0 && wp.overlaps[0][1] === 1, wp);
  const narrowTop = [B("vip", { seat_kind: "VIP" }), B("all", {})];
  expect("(1-12) 狭い帯が上・広い帯が下＝警告なし", bandWarningsOf(narrowTop, CUT).shadows.length === 0 && bandWarningsOf(narrowTop, CUT).overlaps.length === 0);
  const seatPartial = [B("vip", { seat_kind: "VIP", dow_mask: 3 }), B("all", { dow_mask: 6 })];
  expect("(1-13) 席種は狭いが曜日が一部だけ重なる＝一部の重なり（警告のまま）", bandWarningsOf(seatPartial, CUT).overlaps.length === 1 && bandWarningsOf(seatPartial, CUT).shadows.length === 0);

  // 区分：区分なしの上の帯は区分つきの下の帯を覆う・逆は覆わない
  const cat = [B("none", {}), B("first", { category_id: "c1" })];
  expect("(1-14) 区分なしの帯が上＝区分つきの下の帯は当たらない（料金の決まり＝並びが先）", bandWarningsOf(cat, CUT).shadows.length === 1);
  const cat2 = [B("first", { category_id: "c1" }), B("none", {})];
  expect("(1-15) 区分つきが上＝警告なし（区分なしは他の区分で当たる）", bandWarningsOf(cat2, CUT).shadows.length === 0 && bandWarningsOf(cat2, CUT).overlaps.length === 0);
  const cat3 = [B("c1", { category_id: "c1" }), B("c2", { category_id: "c2" })];
  expect("(1-16) 別の区分は重ならない", bandWarningsOf(cat3, CUT).shadows.length === 0 && bandWarningsOf(cat3, CUT).overlaps.length === 0);

  // 日をまたぐ時間帯（区切り 06:00）：20:00〜翌 05:00 は 01:00〜03:00 を覆う・24:00（to=0）
  const night = B("n", { from: 1200, to: 300 }), late = B("l", { from: 60, to: 180 });
  expect("(1-17) 日をまたぐ帯の比べ方（+1440）：20:00〜翌05:00 ⊇ 翌01:00〜03:00",
    JSON.stringify(bandRangeOf(night, CUT)) === JSON.stringify([1200, 1740]) && JSON.stringify(bandRangeOf(late, CUT)) === JSON.stringify([1500, 1620]) && bandCoversOf(night, late, CUT) && !bandCoversOf(late, night, CUT));
  expect("(1-18) to=0 は 24:00・終日は区切り〜区切り+1440", JSON.stringify(bandRangeOf(B("z", { from: 1200, to: 0 }), CUT)) === JSON.stringify([1200, 1440]) && JSON.stringify(bandRangeOf(B("d", {}), CUT)) === JSON.stringify([360, 1800]));
  expect("(1-19) 席種：全席種は VIP を覆う・VIP は卓を覆わない", bandCoversOf(B("a", {}), B("b", { seat_kind: "VIP" }), CUT) && !bandCoversOf(B("a", { seat_kind: "VIP" }), B("b", { seat_kind: "卓" }), CUT) && !bandCoversOf(B("a", { seat_kind: "VIP" }), B("b", {}), CUT));
  expect("(1-20) 文言", BAND_SHADOW_HEAD_JA(2) === "下の行が当たらない時間帯があります（2行・上の広い条件の行が先に当たります）" && BAND_SHADOW_BTN_JA === "この行を上へ動かす" && BAND_SHADOW_DONE_JA.startsWith("並びを直しました"));
}

// ── (5) 既定の延長の印 ──
{
  const ace = [
    B("wd", { dow_mask: 15, kinds: ["set", "extension"], defaultExt: true }),
    B("we", { dow_mask: 48, kinds: ["set", "extension"] }),
    B("vipwd", { seat_kind: "VIP", dow_mask: 15, kinds: ["extension", "vip_charge"] }),
    B("vipwe", { seat_kind: "VIP", dow_mask: 48, kinds: ["vip_charge"] }),
  ];
  const w = bandWarningsOf(ace, CUT);
  expect("(5-1) ACE（平日通常 延長に既定の印）：ボタンの行なし（shadows 0）・赤い警告は残る（defaultBlocks＝VIP 平日 ← 平日通常）・重なりの組 0",
    w.shadows.length === 0 && w.defaultBlocks.length === 1 && w.defaultBlocks[0].lowerKey === "vipwd" && w.defaultBlocks[0].byKey === "wd" && w.overlaps.length === 0, w);
  const moved = reorder(ace, ["vipwd", "wd", "we", "vipwe"]);
  const wm = bandWarningsOf(moved, CUT);
  expect("(5-2) ACE：∧∨ で VIP 平日を上へ動かしても警告は消えない（印は並びに依らない）", wm.defaultBlocks.length === 1 && wm.defaultBlocks[0].lowerKey === "vipwd" && wm.shadows.length === 0, wm);
  expect("(5-3) 印の付いた帯そのもの・延長の無い帯・覆わない印は止めない",
    defaultExtBlockerOf(ace, 0, CUT) === -1 && defaultExtBlockerOf(ace, 3, CUT) === -1 && defaultExtBlockerOf(ace, 1, CUT) === -1);
  const inactiveDef = [B("wd", { dow_mask: 15, kinds: ["extension"], defaultExt: false }), B("vip", { seat_kind: "VIP", dow_mask: 15, kinds: ["extension"] })];
  expect("(5-4) 印の行が無効（defaultExt false）＝今までどおりボタンで直る", bandWarningsOf(inactiveDef, CUT).shadows.length === 1 && bandWarningsOf(inactiveDef, CUT).defaultBlocks.length === 0);
  const below = [B("vip", { seat_kind: "VIP", kinds: ["extension"] }), B("all", { kinds: ["extension"], defaultExt: true })];
  expect("(5-5) 印の付いた広い帯が下でも、上の狭い帯の延長は使われない（並びに依らない＝関数と同じ順）", bandWarningsOf(below, CUT).defaultBlocks.length === 1 && bandWarningsOf(below, CUT).shadows.length === 0 && bandWarningsOf(below, CUT).overlaps.length === 0);
  // セットは並びで直る・延長は印で残る（LUNA の形に印を足した例）
  const mix = [B("all", { dow_mask: 31, kinds: ["set", "extension"], defaultExt: true }), B("early", { dow_mask: 31, from: 1200, to: 1259, kinds: ["set", "extension"] })];
  const wx = bandWarningsOf(mix, CUT);
  const ox = bandShadowFixOrderOf(keysOf(mix), wx.shadows[0]);
  const wx2 = ox ? bandWarningsOf(reorder(mix, ox), CUT) : null;
  expect("(5-6) セットは当たらない＝ボタンで直る・延長は印の警告が残る（押した後も）", wx.shadows.length === 1 && wx.defaultBlocks.length === 1 && !!wx2 && wx2.shadows.length === 0 && wx2.defaultBlocks.length === 1 && wx2.overlaps.length === 0, { wx, wx2 });
  // NOIR・LUNA・VESPER の形（印なし）は今のまま
  const noir = [
    B("main", { dow_mask: 15, kinds: ["set", "extension"] }), B("we", { dow_mask: 48, kinds: ["set", "extension"] }),
    B("vipwd", { seat_kind: "VIP", dow_mask: 15, kinds: ["set", "extension"] }), B("vipwe", { seat_kind: "VIP", dow_mask: 48, kinds: ["set", "extension"] }),
    B("early", { dow_mask: 15, from: 1200, to: 1259, kinds: ["set", "extension"] }),
  ];
  let cur = noir, presses = 0;
  for (; presses < 10; presses++) { const ww = bandWarningsOf(cur, CUT); if (!ww.shadows.length) break; cur = reorder(cur, bandShadowFixOrderOf(keysOf(cur), ww.shadows[0])!); }
  const wn = bandWarningsOf(cur, CUT);
  expect("(5-7) NOIR の形：当たらない 3 行・ボタン 3 回で 0（印の警告 0）", bandWarningsOf(noir, CUT).shadows.length === 3 && presses === 3 && wn.shadows.length === 0 && wn.defaultBlocks.length === 0, { presses, wn });
  expect("(5-8) 文言", BAND_DEFAULT_EXT_JA("平日通常 延長 60 分") === "『平日通常 延長 60 分』に既定の延長の印が付いているため、並びを変えてもこの行は使われません。"
    && BAND_DEFAULT_EXT_WHERE_JA.includes("「延長パターン」") && BAND_DEFAULT_EXT_HEAD_JA(1).includes("1行"));
}

// ── (2) 並べ替え ──
{
  expect("(2-1) moveAboveOf：3 番目を 1 番目の上へ", JSON.stringify(moveAboveOf(["a", "b", "c", "d"], 2, 0)) === JSON.stringify(["c", "a", "b", "d"]));
  expect("(2-2) moveAboveOf：上でない・範囲外は null", moveAboveOf(["a", "b"], 0, 0) === null && moveAboveOf(["a", "b"], 0, 1) === null && moveAboveOf(["a", "b"], 2, 0) === null && moveAboveOf(["a", "b"], 1, -1) === null);
  expect("(2-3) 元の配列は変えない", (() => { const k = ["a", "b", "c"]; moveAboveOf(k, 2, 0); return k.join() === "a,b,c"; })());
  expect("(2-4) 並びが古い（key の位置が違う）＝null", bandShadowFixOrderOf(["a", "b", "c"], { lower: 2, upper: 0, lowerKey: "b", upperKey: "a" }) === null);
}

// ── (3) 乱数：直した並びでは、その帯は当たる・上の帯は動かない ──
{
  let seed = 20261127;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const seats = [null, null, "VIP", "卓", "カウンター"];
  const masks = [null, 127, 31, 15, 48, 1, 96];
  const wins: [number | null, number | null][] = [[null, null], [1200, 1380], [1200, 300], [1260, 0], [60, 180], [1320, 1500 - 1440]];
  const kindsAll = ["set", "extension", "dohan", "vip_charge"];
  let cases = 0, shadowsSeen = 0, bad = 0, badCount = 0, badTop = 0, badDef = 0, defSeen = 0;
  for (let t = 0; t < 4000; t++) {
    const n = 2 + rnd(6);
    const bs: BandCond[] = [];
    for (let i = 0; i < n; i++) {
      const ks = kindsAll.filter(() => rnd(2) === 0); if (ks.length === 0) ks.push("set");
      const [from, to] = wins[rnd(wins.length)];
      bs.push(B(`k${i}`, { seat_kind: seats[rnd(seats.length)], dow_mask: masks[rnd(masks.length)], from, to, category_id: rnd(4) === 0 ? "c1" : null, kinds: ks, activeKinds: ks.filter(() => rnd(5) !== 0) }));
    }
    { const ei = bs.findIndex((b) => b.kinds.includes("extension")); if (ei >= 0 && rnd(3) === 0) bs[ei] = { ...bs[ei], defaultExt: true }; } // 既定の印は 1 店 1 本
    { const a = bandWarningsOf(bs, CUT).defaultBlocks.map((x) => x.lowerKey).sort().join(), b = bandWarningsOf([...bs].reverse(), CUT).defaultBlocks.map((x) => x.lowerKey).sort().join(); if (a !== b) badDef++; if (a) defSeen++; }
    cases++;
    const w = bandWarningsOf(bs, CUT);
    for (const s of w.shadows) {
      shadowsSeen++;
      const o = bandShadowFixOrderOf(keysOf(bs), s);
      if (!o || o.length !== bs.length || new Set(o).size !== bs.length) { badCount++; continue; }
      const after = reorder(bs, o);
      if (bandWarningsOf(after, CUT).shadows.some((x) => x.lowerKey === s.lowerKey)) bad++;
      if (o.slice(0, s.upper).join() !== keysOf(bs).slice(0, s.upper).join()) badTop++;
    }
  }
  expect(`(3-1) 乱数 ${cases} 件（当たらない帯 ${shadowsSeen} 件）：直した並びでは、その帯は当たらない帯に出ない`, shadowsSeen > 100 && bad === 0, { shadowsSeen, bad });
  expect(`(3-3) 既定の印の警告（${defSeen} 件）は並びに依らない（逆順でも同じ帯）`, defSeen > 50 && badDef === 0, { defSeen, badDef });
  expect("(3-2) 直した並びは全件（欠け・重複なし）・覆う帯より上の帯は動かない", badCount === 0 && badTop === 0, { badCount, badTop });
}

// ── (4) 画面の配線 ──
{
  const src = fs.readFileSync("app/(manage)/master/pricing/pricing-board.tsx", "utf8");
  const fnBody = (name: string) => { const i = src.indexOf(`async function ${name}(`); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }\n", i)); };
  const apply = fnBody("applyBandOrder"), fix = fnBody("fixShadow"), move = fnBody("moveBand");
  expect("(4-1) band-shadow を読む（bandWarningsOf・bandShadowFixOrderOf）", src.includes('from "@/lib/nox/pricing/band-shadow"') && src.includes("bandWarningsOf(") && src.includes("bandShadowFixOrderOf("));
  expect("(4-2) applyBandOrder＝fee_kind ごとの pricing_rule_reorder（今の関数）・初回の柵（shadowGuard）・成功で読み直す",
    apply.includes('supabase.rpc("pricing_rule_reorder"') && apply.includes("shadowGuard(") && apply.includes("await reload()") && apply.includes("for (const fk of TIMED_KINDS)"));
  expect("(4-3) ∧∨（moveBand）もボタン（fixShadow）も applyBandOrder を通る", move.includes("await applyBandOrder(order)") && fix.includes("await applyBandOrder(order)") && !move.includes("pricing_rule_reorder"));
  expect("(4-4) ボタンは確認の窓を出さない（∧∨ と同じ）・忙しい間は押せない", !/confirm\(/.test(fix) && fix.includes("if (busy) return") && src.includes("disabled={busy} onClick={() => void fixShadow(s)}"));
  expect("(4-5) 赤い警告にボタン（BAND_SHADOW_BTN_JA）・見出し BAND_SHADOW_HEAD_JA", src.includes("{BAND_SHADOW_BTN_JA}</button>") && src.includes("BAND_SHADOW_HEAD_JA(bandShadows.length)"));
  expect("(4-6) 今の一部の重なりの文は残す", src.includes("条件が重複している時間帯があります（{bandOverlaps.length}組・上の行が適用されます）"));
  expect("(4-7) 権限の判定を画面に足さない（関数が決める＝∧∨ と同じ）", !fix.includes("isOwner"));
  expect("(4-8) 関数・mig は増やさない（新しい rpc 名なし）", [...src.matchAll(/supabase\.rpc\("([a-z_0-9]+)"/g)].every((m) => m[1] !== "pricing_band_shadow_fix"));
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  expect("(4-10) 既定の印の警告：ボタンを置かない・文と切替の場所・印は関数と同じ（有効な延長の行の is_default_ext）",
    src.includes("bandDefaultBlocks.length > 0 &&") && src.includes("BAND_DEFAULT_EXT_JA(defaultExtNameOf(by))") && src.includes("{BAND_DEFAULT_EXT_WHERE_JA}")
    && src.includes('defaultExt: b.all.some((r) => r.fee_kind === "extension" && r.is_active && r.is_default_ext === true)')
    && (() => { const i = src.indexOf("bandDefaultBlocks.length > 0 &&"); const blk = src.slice(i, src.indexOf("bandShadows.length > 0 &&", i)); return !blk.includes("<button") && !blk.includes("fixShadow"); })());
  expect("(4-9) npm script はある・f0 の鎖には入れていない（CC が足す）", pkg.scripts["verify:nox-band-shadow"] === "tsx scripts/verify-nox-band-shadow.ts" && !pkg.scripts["verify:f0"].includes("verify:nox-band-shadow"));
}

if (fails.length) { console.error(`FAIL ${fails.length}/${ok + fails.length}`); for (const f of fails) console.error("  ✗ " + f); process.exit(1); }
console.log(`verify:nox-band-shadow OK ${ok}`);

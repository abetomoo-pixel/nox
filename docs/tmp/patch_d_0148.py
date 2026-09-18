# D 段: client 三面鏡（案 Q・裁定272 追補）＋ suite の assert 追加 ＋ package.json 登録
import json, re
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)

# ── D-1 check-calc.ts groupDueFull（DB check_group_due L20／L36 と同じ 2 箇所＝v_bx／v_bx10・v_bx8）
edit('lib/nox/check-calc.ts', [
 ('''// ★三面鏡: check_group_due（DB）・本関数・receipt.ts の税表示を必ず同時改修（F5 の3点セットと同じ規律）。
export type DueLine = { line_total: number; kind: string; tax_category?: string | null };''',
  '''// ★三面鏡: check_group_due（DB）・本関数・receipt.ts の税表示を必ず同時改修（F5 の3点セットと同じ規律）。
// ★裁定272 追補（案 Q・mig0148 ★10・2026-09-18）: kind 'referral'（紹介料＝店が払う手当）は伝票合計・課税額から除外
//   ＝DB の v_bx（L20）と v_bx10／v_bx8（L36）の `and kind <> 'referral'` と同じ 2 箇所。cast の gross（referralTotal）にのみ載る。
export type DueLine = { line_total: number; kind: string; tax_category?: string | null };'''),
 ('''  const bx = lines.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0);
  const disc = lines.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
  const net = Math.max(0, bx - disc);
  if (net === 0) return 0;''',
  '''  const bx = lines.filter((l) => l.kind !== "discount" && l.kind !== "referral").reduce((a, l) => a + l.line_total, 0); // ★裁定272 追補: referral 除外（DB L20）
  const disc = lines.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
  const net = Math.max(0, bx - disc);
  if (net === 0) return 0;'''),
 ('''    const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0);
    const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0);
    const sv = roundYen((net * s.service_rate) / 100); // v_sv = round(v_net * v_rate / 100.0) と同式''',
  '''    const bx10 = lines.filter((l) => l.kind !== "discount" && l.kind !== "referral" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0); // ★裁定272 追補: referral 除外（DB L36）
    const bx8 = lines.filter((l) => l.kind !== "discount" && l.kind !== "referral" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0); // ★裁定272 追補: referral 除外（DB L36）
    const sv = roundYen((net * s.service_rate) / 100); // v_sv = round(v_net * v_rate / 100.0) と同式'''),
])

# ── D-1 receipt.ts（鏡像: gross／bx10／bx8 の 3 式＋明細行を印字しない）
edit('lib/nox/receipt.ts', [
 ('''  // 金額段（冒頭コメントの順算式＝check_group_due と同式）
  const gross = lines.filter((l) => l.kind !== "discount").reduce((s, l) => s + l.line_total, 0);''',
  '''  // 金額段（冒頭コメントの順算式＝check_group_due と同式）
  // ★裁定272 追補（案 Q・mig0148 ★10）: kind 'referral'（紹介料＝店が払う手当）は客への請求ではない＝
  //   小計・税率別集計から除外（groupDueFull／DB と同じ 2 箇所）し、明細にも印字しない。
  const gross = lines.filter((l) => l.kind !== "discount" && l.kind !== "referral").reduce((s, l) => s + l.line_total, 0);'''),
 ('''  const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((s2, l) => s2 + l.line_total, 0);
  const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((s2, l) => s2 + l.line_total, 0);
  const base10 = Math.max(0, bx10 - discount) + service; // 外税の 10% 基底（clamp＋サ料算入）''',
  '''  const bx10 = lines.filter((l) => l.kind !== "discount" && l.kind !== "referral" && catOf(l) === "taxable_10").reduce((s2, l) => s2 + l.line_total, 0);
  const bx8 = lines.filter((l) => l.kind !== "discount" && l.kind !== "referral" && catOf(l) === "taxable_8").reduce((s2, l) => s2 + l.line_total, 0);
  const base10 = Math.max(0, bx10 - discount) + service; // 外税の 10% 基底（clamp＋サ料算入）'''),
 ('''  // ── 明細（当該 pay_group のみ・discount はマイナス表記）──
  for (const l of lines) {
    if (l.kind === "discount") {''',
  '''  // ── 明細（当該 pay_group のみ・discount はマイナス表記・referral は印字しない＝裁定272 追補）──
  for (const l of lines) {
    if (l.kind === "referral") continue;
    if (l.kind === "discount") {'''),
])

# ── D-1 verify-nox-receipt.ts: referral 行ありの fixture でも一致
edit('scripts/verify-nox-receipt.ts', [
 ('''    check("C4-4 ★groupDueFull 過剰割引 clamp: base10 は負にしない（due=128）",
      groupDueFull(clampLines, exSettings) === 128, String(groupDueFull(clampLines, exSettings)));
  }''',
  '''    check("C4-4 ★groupDueFull 過剰割引 clamp: base10 は負にしない（due=128）",
      groupDueFull(clampLines, exSettings) === 128, String(groupDueFull(clampLines, exSettings)));

    // ★裁定272 追補（案 Q・mig0148 ★10・2026-09-18）: kind 'referral'（紹介料＝店が払う手当）は伝票合計・課税額から除外
    //   ＝DB check_group_due の L20／L36 と同じ 2 箇所を groupDueFull／receipt.ts に足した三面鏡。referral 行ありでも T8 と 1 円も動かない。
    const refLines: ReceiptLine[] = [...exLines, { name_snapshot: "紹介料(検証)", qty: 1, unit_price_snapshot: 1000, line_total: 1000, kind: "referral", tax_category: "taxable_10" }];
    check("C4-5 ★referral 除外: groupDueFull は referral 1000 込みでも外税 381／内税 347（T8 と同値）",
      groupDueFull(refLines, exSettings) === 381 && groupDueFull(refLines, { service_rate: 10, round_unit: 1, round_mode: "round" }) === 347,
      `ex=${groupDueFull(refLines, exSettings)} in=${groupDueFull(refLines, { service_rate: 10, round_unit: 1, round_mode: "round" })}`);
    const xr = buildReceiptXml({ ...t8, lines: refLines });
    check("C4-5 ★referral 除外: 領収書は合計 381・消費税(10%) 34 のまま・紹介料の明細行を印字しない・端数調整 行なし",
      xr.includes("¥381") && xr.includes("消費税(10%)") && xr.includes("¥34") && !xr.includes("紹介料(検証)") && !xr.includes("端数調整"));
    const refMix: ReceiptLine[] = [...mixLines, { name_snapshot: "紹介料(8%枠)", qty: 1, unit_price_snapshot: 505, line_total: 505, kind: "referral", tax_category: "taxable_8" }];
    check("C4-5 ★referral 除外: 税率別集計（8%）にも referral を含めない（T9 と同じ 1311）",
      groupDueFull(refMix, mixSettings) === 1311 && buildReceiptXml({ ...t9, lines: refMix }).includes("¥1,311"), String(groupDueFull(refMix, mixSettings)));
  }'''),
])

# ── D-1 verify-nox-pricing.ts 段43(21): referral 行ありの伝票で三点一致（DB＝TS＝手計算）
edit('scripts/verify-nox-pricing.ts', [
 ('''        await runCase("C1 10%のみ", {}, async (cid) => { await addCustom(cid, "c1", 105, 3); }, 300);''',
  '''        await runCase("C1 10%のみ", {}, async (cid) => { await addCustom(cid, "c1", 105, 3); }, 300);
        // ★裁定272 追補（案 Q・mig0148 ★10・2026-09-18）: 紹介料行（kind 'referral'・check_add_referral）を載せても
        //   DB total（check_group_due の referral 除外）＝TS 鏡像（groupDueFull・referral 込み入力）＝手計算（C1 と同じ 300）の三点一致。
        await runCase("C1r 10%＋紹介料 1000（referral 除外・案 Q）", {}, async (cid) => {
          await addCustom(cid, "c1r", 105, 3);
          const { error: eRef } = await owner.rpc("check_add_referral", { p_check_id: cid, p_cast_id: null, p_amount: 1000, p_memo: "verify 紹介料", p_idem_key: null });
          if (eRef) throw new Error("check_add_referral 拒否: " + eRef.message);
        }, 300);'''),
])

# ── package.json: 5 本の script ＋ verify:f0 末尾に連結
p = 'package.json'
s = open(p, encoding='utf-8').read()
s = s.replace('''    "verify:nox-late": "tsx scripts/verify-nox-late.ts",''',
'''    "verify:nox-late": "tsx scripts/verify-nox-late.ts",
    "verify:nox-carryover": "tsx scripts/verify-nox-carryover.ts",
    "verify:nox-referral": "tsx scripts/verify-nox-referral.ts",
    "verify:nox-cast-norm-self": "tsx scripts/verify-nox-cast-norm-self.ts",
    "verify:nox-product-types": "tsx scripts/verify-nox-product-types.ts",
    "verify:nox-receivable-policy": "tsx scripts/verify-nox-receivable-policy.ts",''', 1)
old_tail = 'npm run verify:nox-setup && npm run verify:nox-late",'
assert s.count(old_tail) == 1
s = s.replace(old_tail, 'npm run verify:nox-setup && npm run verify:nox-late && npm run verify:nox-carryover && npm run verify:nox-referral && npm run verify:nox-cast-norm-self && npm run verify:nox-product-types && npm run verify:nox-receivable-policy",')
open(p, 'w', encoding='utf-8', newline='').write(s)
json.loads(s)
print("edited package.json (json ok)")
print("D patch done")

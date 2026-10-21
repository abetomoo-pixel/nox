/*
 * verify:nox-cast-picker — 便 GV-B W-14（2026-10-15）裁定384（GV-37）キャスト選択の既定＝担当中→出勤中→すべて・担当中 1 人なら選択済み（DB 不触・env 不要）。
 *   npm run verify:nox-cast-picker。
 *   (1) pickerDefaultChipOf: seated＞0→"seated"／working＞0→"working"／どちらも 0→""（すべて）
 *   (2) CastPicker: defaultChip prop で初期チップ（未指定は従来＝grouped&&chips なら出勤中）
 *   (3) register の配線＝ドリンク帰属（担当中 1 人なら selectedIds＋「{名前} に追加」主 56）・分配率カードの CastPicker も defaultChip
 */
import fs from "node:fs";
import { pickerDefaultChipOf } from "../components/nox/cast-picker";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

check("cp(1) pickerDefaultChipOf＝担当中→出勤中→すべて", pickerDefaultChipOf({ seated: 2, working: 5 }) === "seated" && pickerDefaultChipOf({ seated: 1, working: 0 }) === "seated" && pickerDefaultChipOf({ seated: 0, working: 3 }) === "working" && pickerDefaultChipOf({ seated: 0, working: 0 }) === "");
const cp = src("components/nox/cast-picker.tsx");
check("cp(2) CastPicker: defaultChip prop＝初期チップ（useState の初期値・未指定は従来）", cp.includes('defaultChip?: "" | "working" | "seated";') && cp.includes('useState<"" | "attend" | "seated" | "working">(defaultChip ?? (grouped && chips ? "working" : ""))'));
const rb = src("app/(manage)/register/register-board.tsx");
check("cp(3) register: ドリンク帰属の CastPicker に defaultChip＝pickerDefaultChipOf({seated, working})・分配率側は S-6 の 出勤中（既定）／全員の固定チップ・担当中 1 人なら selectedIds＋「に追加」主 56（data-pick-single）",
  (rb.match(/defaultChip=\{pickerDefaultChipOf\(\{ seated: seatedIds\.size, working: attendIds\.size \+ todayIds\.size \}\)\}/g) || []).length === 1 /* ★便 S（S-6 ①）: 分配率側は chipSet two */ && rb.includes('chips chipSet="two" defaultChip="working"') && rb.includes("selectedIds={seatedIds.size === 1 ? seatedIds : undefined}") && rb.includes("data-pick-single") && rb.includes('import CastPicker, { pickerDefaultChipOf, nomKindBadgesOf } from "@/components/nox/cast-picker";') /* ★便 X13-G W-4 */);

if (fails.length) { console.error(`✗ verify:nox-cast-picker 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-cast-picker OK (${pass} checks)`);

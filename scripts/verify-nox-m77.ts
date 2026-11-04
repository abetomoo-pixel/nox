/*
 * verify:nox-m77 — 便 C①（2026-11-04・M-77 ①＝期間の公開で配置キャスト全員に 1 通）＝純関数＋client／route の pin（env 不要・DB 不触）。
 *   ②（unfollow でブロック）③（紐付け解除）は 0195 待ち＝ここでは扱わない。
 *   使い方: npm run verify:nox-m77
 */
import fs from "node:fs";
import { shiftPublishedBody, shiftPublishedTargetsOf, SHIFT_PUBLISHED_LINE_KIND, CAST_NOTIF_BODY_MAX } from "../lib/nox/people/notify-text";
import { linePushKindOfNotif, LINE_PUSH_KINDS } from "../lib/nox/line/liff-endpoint";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

const rows = [
  { cast_id: "c1", date: "2026-11-08", start_hm: "20:00", end_hm: "25:00", status: "confirmed" },
  { cast_id: "c2", date: "2026-11-07", start_hm: "19:00", end_hm: "24:00", status: "confirmed" },
  { cast_id: "c1", date: "2026-11-05", start_hm: "20:00", end_hm: "24:00", status: "confirmed" },
  { cast_id: "c3", date: "2026-11-06", start_hm: "20:00", end_hm: "24:00", status: "planned" },
];
const t = shiftPublishedTargetsOf(rows);
check("m77(1-1) 宛先＝確定（confirmed）の配置があるキャストだけ（planned だけの c3 は含まない）・本人の出勤日は日付順",
  [...t.keys()].sort().join(",") === "c1,c2" && t.get("c1")!.map((d) => d.date).join(",") === "2026-11-05,2026-11-08" && t.get("c2")!.length === 1, [...t.entries()]);
const body = shiftPublishedBody({ start_date: "2026-11-01", end_date: "2026-11-15" }, t.get("c1")!);
check("m77(1-2) 文面＝「11/1〜11/15 のシフトが公開されました。あなたの出勤日: 11/5（木） 20:00–翌00:00、11/8（日） 20:00–翌01:00」（翌表記は他画面と同じ）",
  body === "11/1〜11/15 のシフトが公開されました。あなたの出勤日: 11/5（木） 20:00–翌00:00、11/8（日） 20:00–翌01:00", body);
const many = Array.from({ length: 40 }, (_, i) => ({ date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`, start: "20:00", end: "24:00" }));
const long = shiftPublishedBody({ start_date: "2026-11-01", end_date: "2026-11-30" }, many);
check("m77(1-3) 500 字を超えるときは日数だけ（CHECK の body ≤ 500 を守る）", long.length <= CAST_NOTIF_BODY_MAX && long.includes("あなたの出勤日は 40 日です"), long);
check("m77(1-4) LINE 台帳の kind＝shift_published（既存の 4 kind の 1 つ・route の写像は shift_published をそのまま・他の shift_* は shift_changed）",
  SHIFT_PUBLISHED_LINE_KIND === "shift_published" && LINE_PUSH_KINDS.includes("shift_published") && linePushKindOfNotif("shift_published") === "shift_published" && linePushKindOfNotif("shift_added") === "shift_changed" && linePushKindOfNotif("other") === "notice");
const sb = src("app/(manage)/shift/shift-board.tsx"), nt = src("lib/nox/people/notify.ts");
check("m77(1-5) client＝shift_period_set の成功後（published）に自店の確定シフトを期間で読み（store_id・confirmed）・notifyCasts（kind other・lineKind shift_published・ref shift_periods:id）・文言に人数",
  sb.includes('if (!error && st === "published") {') && sb.includes('.eq("store_id", storeId).eq("status", "confirmed").gte("date", pe.start_date).lte("date", pe.end_date)')
  && sb.includes('(id) => ({ kind: "other", lineKind: SHIFT_PUBLISHED_LINE_KIND, body: shiftPublishedBody(pe, targets.get(id) ?? []), ref: notifRefOf("shift_periods", pe.id) })')
  && nt.includes("kind: p.lineKind ?? p.kind") && nt.includes("lineKind?: string"));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m77 ALL PASS (${pass} assertions)`);

/**
 * verify:nox-b3 — 便 3（2026-11-11 夜・夜便レーン 1 の続き＝client・DDL なし）。DB は触らない（source と純関数だけ）。
 *  (1) M-177 自分の情報の編集＝本人が編集できる範囲（連絡先・住所・緊急連絡先・PIN・パスワード）・店長とオーナーだけの項目は出さない・店の端末は PIN だけ
 *  (2) /setup の「ホームへ」＝全体の読み込み（教訓142＝/setup の専用の殻がレイアウトに残らない）
 */
import fs from "node:fs";
import { selfProfileErrorOf, selfProfilePatchOf } from "../lib/nox/people/self-profile";
import { demoPinOf, guessablePinOf } from "../lib/nox/demo/pin";
import { lateForPayOf } from "../lib/nox/shift/late";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1) M-177
{
  const f = { address: "東京都", emergency_name: "母", emergency_relation: "母", emergency_phone: "090-0000-0000" };
  check("b3(1-1) 変わった項目だけ・空は null・変更なしは null", JSON.stringify(selfProfilePatchOf({ ...f, address: "" }, { address: "大阪", emergency_name: "母", emergency_relation: "母", emergency_phone: "090-0000-0000" })) === '{"address":null}' && selfProfilePatchOf(f, f) === null);
  check("b3(1-2) 緊急連絡先の電話の形（RPC と同じ）・長さ", selfProfileErrorOf({ ...f, emergency_phone: "abc" }) !== null && selfProfileErrorOf(f) === null && selfProfileErrorOf({ ...f, address: "あ".repeat(201) }) !== null);
  const p = src("app/(manage)/staff/me/profile/page.tsx"), pf = src("app/(manage)/staff/me/profile/profile-form.tsx");
  check("b3(1-4) 書込は既存の本人の RPC だけ（set_my_contact＝ContactForm・member_profile_self_save・PinSelfCard）・氏名・生年月日・口座の欄は無い",
    p.includes("<ContactForm ") && pf.includes('supabase.rpc("member_profile_self_save", { p: patch })') && p.includes('<PinSelfCard kind="staff" />') && !/legal_name|birth|bank|口座番号/.test(p + pf) && p.includes("selfProfileStoreOnlyNoteOf(role)") /* ★■N-5（2026-11-12）: 役割ごとの注記 */);
  check("b3(1-5) 店の端末の本人セッション＝PIN の変更だけ（連絡先・住所・パスワードを出さない）", /kioskPerson \? \(\s*mig0201On\(\) \? <section className="nox-panel" style=\{sec\}><PinSelfCard kind="staff" \/><\/section>/.test(p) && p.includes("SELF_PROFILE_KIOSK_NOTE"));
  check("b3(1-6) パスワードはこの画面で変えない（client で auth.updateUser を呼ばない＝dg(6-1)）・再設定の画面へのリンク", !/auth\.updateUser\(/.test(pf + p) && p.includes('href="/auth/forgot"'));
  check("b3(1-7) 入口＝自分の勤怠（/staff/me）と右上の「自分の情報」から「自分の情報を編集」", src("app/(manage)/staff/me/page.tsx").includes('href="/staff/me/profile"') && src("components/ui/header-chips.tsx").includes('data-user-edit-link="1"') && src("app/(manage)/layout.tsx").includes('editHref={role !== "cast" ? "/staff/me/profile" : null}') && src("app/(manage)/layout.tsx").includes('canPhoto={role !== "cast" && !kioskPersonOn}'));
}
// (2) /setup の「ホームへ」
{
  const w = src("app/(manage)/setup/setup-wizard.tsx");
  check("b3(2-1) /setup の「ホームへ」は全体の読み込み（a href）＝専用の殻がレイアウトに残らない（教訓142）", w.includes('<a href="/dashboard" style={{ ...t.btnGold, textDecoration: "none" }} data-setup-home="1">ホームへ</a>') && !w.includes('<Link href="/dashboard" style={{ ...t.btnGold, textDecoration: "none" }} data-setup-home="1">'));
}

// (3) デモの人ごとの PIN・今日出勤中のスタッフ
{
  const OLD = "$2a$06$es6a5JEXahHwq41iFe.f9OWukggPKCQgYnB32ozpl.8mpEOK1EJh2"; // 旧＝全員 1234
  const hashes = JSON.parse(src("scripts/demo/demo-pin-hashes.json")) as Record<string, { pin: string; hash: string }>;
  const bad: string[] = [];
  let pins = 0, onDuty = 0;
  for (const code of ["muse", "luna", "noir", "ace", "lily", "nest"]) {
    const p = JSON.parse(src(`docs/demo/payload/${code}.json`)) as { tables: Record<string, Record<string, unknown>[]> };
    const rows = [...(p.tables.cast_pin ?? []), ...(p.tables.staff_pin ?? [])];
    pins += rows.length;
    if (rows.some((r) => r.pin_hash === OLD || r.pin_hash === "MISSING")) bad.push(`${code}: old/missing hash`);
    const mine = Object.entries(hashes).filter(([k]) => k.startsWith(`${code}:`));
    const ps = mine.map(([, v]) => v.pin);
    if (new Set(ps).size !== ps.length) bad.push(`${code}: 店の中で PIN が重複`);
    for (const [k, v] of mine) { if (demoPinOf(k.slice(code.length + 1)) !== v.pin) bad.push(`${k}: demoPinOf と不一致`); if (guessablePinOf(v.pin)) bad.push(`${k}: 推測されやすい ${v.pin}`); }
    onDuty += (p.tables.staff_punches ?? []).filter((r) => (r.biz_date as { $rel?: number } | null)?.$rel === 0 && r.kind === "in").length;
  }
  check("b3(3-1) デモの PIN＝人ごと（旧 1234 のハッシュなし）・店の中で重複なし・表示名から決まる値と一致・推測されやすい番号なし", bad.length === 0 && pins > 40, { bad, pins });
  check("b3(3-2) 推測されやすい PIN の判定（同じ数字・連番・2 桁の繰り返し）", guessablePinOf("1234") && guessablePinOf("0000") && guessablePinOf("9876") && guessablePinOf("4545") && guessablePinOf("8901") && !guessablePinOf("3907") && !guessablePinOf("0283"));
  const kp = src("app/kiosk/page.tsx"), kl = src("app/kiosk/layout.tsx"), dt = src("components/ui/demo-terms.tsx");
  check("b3(3-3) デモの端末だけ名前の下に PIN（layout が org の is_demo を server で判定して配る・本番の店は出ない）・入口の案内は「名前の下に出ます」",
    kl.includes("<DemoProvider isDemo={await kioskIsDemo()}>") && kl.includes('select("is_demo")') && kp.includes("const isDemo = useIsDemo();") && kp.includes("{c.has_pin && demoPinLine(c.cast_name)}") && kp.includes("{m.has_pin && demoPinLine(m.user_name)}") && !dt.includes("デモの PIN は 1234") && dt.includes('data-demo-pin="per-person"'));
  check("b3(3-4) 各店の「スタッフで入る」の人が今日出勤中（in・営業日の始まり）＝6 店で 6 行", onDuty === 6, onDuty);
}

// (4) M-134 遅刻＝給与と同じ規則の 1 関数（KPI と行が同じ関数・給与の計算は不変）
{
  const base = { shiftStatus: "confirmed", attStatus: null as string | null, hasDohanSlip: false, startHm: "20:00", inHm: "20:25", graceMin: 10 };
  check("b3(4-1) M-134 lateForPayOf＝確定シフト・猶予を超えた打刻＝分（素値）／未確定・出勤の記録・同伴の伝票・当欠・休み＝null／出勤の記録が遅刻なら打刻なしでも 0",
    lateForPayOf(base) === 25 && lateForPayOf({ ...base, shiftStatus: "planned" }) === null && lateForPayOf({ ...base, attStatus: "shukkin" }) === null && lateForPayOf({ ...base, hasDohanSlip: true }) === null
    && lateForPayOf({ ...base, attStatus: "absent" }) === null && lateForPayOf({ ...base, inHm: "20:10" }) === null && lateForPayOf({ ...base, attStatus: "late", inHm: null }) === 0 && lateForPayOf({ ...base, attStatus: "late" }) === 25);
  const sb = src("app/(manage)/shift/shift-board.tsx");
  check("b3(4-2) M-134 行の遅刻（チップ・(+N 分)）は lateForPayOf・KPI は確定シフトだけ遅刻・伝票の同伴は打ち消し",
    sb.includes("const n = lateForPayOf({ shiftStatus: s.status, attStatus: att?.status, hasDohanSlip: !!dohanSeats.get(s.cast_id), startHm: s.start_hm, inHm: io?.inHm, graceMin: lateGraceMin });") && sb.includes('if (fin?.type === "late" && s.status !== "confirmed") { arrived += 1; continue; }') && sb.includes('if (st === "shukkin" || st === "dohan" || dohanSeats.get(s.cast_id)) { arrived += 1; continue; }'));
}

// (5) フラグ便 0201b（2026-11-12）に同乗＝M-180（希望の一括の注記の重なり）・M-181（折り返すセグメントで全部の選択肢を読める）
{
  const wf = src("app/mine/wishes/wish-form.tsx");
  check("b3(5-1) M-180 希望の時刻欄 4 つは中身の幅（固定 76／72px をやめる）・一括の注記は次の行（flexBasis 100%）",
    (wf.match(/style=\{timeBox\}/g) ?? []).length === 4 && wf.includes('const timeBox: React.CSSProperties = { width: "auto" };') && !/width: 7[26]\b/.test(wf)
    && wf.includes('flexBasis: "100%" }} data-wish-bulk-note="1">日ごとに変えるときは下で上書き</span>'));
  const css = src("app/globals.css"), sw = src("app/(manage)/setup/setup-wizard.tsx");
  check("b3(5-2) M-181 折り返すセグメント＝900px 以上は次の行へ折り返す・2 列のときも長い選択肢はセルの中で折り返す・初期設定のスタッフの職種・権限・雇用形態は wrap",
    css.includes(".nox-seg.nox-seg--wrap { flex-wrap: wrap; overflow: visible; }\n.nox-seg.nox-seg--wrap > * { flex: 1 1 auto; white-space: normal; text-align: center; }")
    && css.indexOf(".nox-seg.nox-seg--wrap { flex-wrap: wrap;") > css.indexOf(".nox-seg.nox-seg--wrap > * { min-height: 44px; white-space: nowrap;")
    && ['ariaLabel="職種" wrap', 'ariaLabel="権限" wrap', 'ariaLabel="雇用形態" wrap'].every((k) => sw.includes(k))
    && css.includes(".nox-setup-main [data-staff-row] .nox-seg > button { white-space: normal; flex: 1 1 auto;") && !css.includes(".nox-setup-main [data-staff-row] .nox-seg > button { white-space: nowrap;") /* ★初期設定の画面専用の規則も折り返す（本番の実測で発見） */);
  check("b3(5-3) 0201b の後＝MIG_0201B_APPLIED true（売掛のスイッチは set_store_receivable_policy の 1 本）", src("lib/nox/rules-0175/flag.ts").includes("export const MIG_0201B_APPLIED = true;"));
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b3 ALL PASS (${pass} assertions)`);

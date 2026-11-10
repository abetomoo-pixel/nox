/*
 * verify:nox-k — 0190 のフラグ true 便（便 K client・2026-10-30）: K-5／K-0／K-1／435 タイル／K-4／M-29／退店 route／打刻ゲートの client 配線。
 *  K-5 端末の束縛＝lib/nox/kiosk/device-fp（localStorage の乱数 ID・8〜128 文字）→ kiosk_device_bind をログイン直後に（/kiosk・/kiosk-register）・p_device_fp を kiosk_login／qr_secret／qr_poll に添える
 *  K-0 包み＝kiosk-register は RegisterBoard を同じ props で描く（写しの会計 RPC 呼びが無い）・自動ロック 3 分・操作担当のバー「〇〇さんとして操作中」
 *  K-1 人を選ぶ→PIN 4〜6 桁（PIN だけの解除＝KioskUnlockPad は mount しない・QR は近道）・ロック＝/api/kiosk/lock-notice（audience staff・重複 10 分）
 *  435 タイル＝出退勤／レジ／シフト／在庫／日報（kioskTilesOf・フラグ false は 3 つ）・シフト／在庫／日報は案内画面（KioskFeaturePage）
 *  K-4＝端末アカウントは / から /kiosk／/kiosk-register・manifest-kiosk.json（start_url /kiosk）を kiosk 配下の layout が指す
 *  M-29＝端末一覧の再発行して有効化／削除／固定の解除（route reactivate／delete・RPC kiosk_device_unbind）・上限 3 台（kioskDeviceLimit）
 *  退店＝/api/auth/retire（ban／unban）を casts-board／staff-board が呼ぶ・打刻ゲート＝rpc-err 'off duty'・店舗設定 data-duty-gate・フラグ MIG_0190_APPLIED
 *  使い方: npm run verify:nox-k（env 不要・DB 不触）
 */
import fs from "node:fs";
import { deviceFpOf, isValidDeviceFp, DEVICE_FP_KEY, OFF_DUTY_MSG, isOffDuty, bindErrJa } from "../lib/nox/kiosk/device-fp";
import { kioskTilesOf, kioskPersonNavOf, KIOSK_PERSON_IDLE_MINUTES, KIOSK_FEATURE_HREF, KIOSK_FEATURE_LABEL, KIOSK_FEATURE_READY, KIOSK_FEATURES_ALL } from "../lib/nox/rules-0175/kiosk";
import { mig0190On, __set0190ForTest, MIG_0190_APPLIED } from "../lib/nox/rules-0175/flag";
import { lockNoticeTextOf, jstDatePlus } from "../lib/nox/kiosk/lock-notice";
import { kioskDeviceLimit, kioskErrJa } from "../lib/nox/kiosk/device-errors";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const has = (p: string) => fs.existsSync(p);

// ── フラグ ──
check("k(0-1) MIG_0190_APPLIED=true・mig0190On() が読む・テスト上書き", MIG_0190_APPLIED === true && mig0190On() === true && (__set0190ForTest(false), mig0190On() === false) && (__set0190ForTest(null), mig0190On() === true));

// ── K-5 純関数 ──
{
  const mem = new Map<string, string>(); const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const a = deviceFpOf(st); const b = deviceFpOf(st);
  check("k(5-1) deviceFpOf＝32 桁 hex を 1 回だけ作って保存・2 回目は同じ値・キーは nox_device_fp", !!a && /^[0-9a-f]{32}$/.test(a) && a === b && mem.get(DEVICE_FP_KEY) === a, { a, b });
  mem.set(DEVICE_FP_KEY, "bad fp"); const c = deviceFpOf(st);
  check("k(5-2) 保存値が不正（空白・8 文字未満）なら作り直す・isValidDeviceFp＝8〜128 文字・空白なし・storage なしは null", !!c && c !== "bad fp" && isValidDeviceFp("12345678") && !isValidDeviceFp("1234567") && !isValidDeviceFp("a".repeat(129)) && !isValidDeviceFp("abcd efgh") && deviceFpOf(null) === null);
  const thrower = { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined };
  check("k(5-3) localStorage が投げたら null（呼び手が注記）・bindErrJa＝'device bound'→固定の解除の案内・'bad device_fp'・'forbidden'", deviceFpOf(thrower) === null && bindErrJa("device bound").includes("固定を解除") && bindErrJa("bad device_fp").includes("保存領域") && bindErrJa("forbidden").includes("端末アカウント"));
  check("k(5-4) 打刻ゲートの文言＝「出勤してからレジを開けます」・isOffDuty", OFF_DUTY_MSG.startsWith("出勤してからレジを開けます") && isOffDuty("off duty") && !isOffDuty("forbidden") && !isOffDuty(null));
}
// ── 配線（grep） ──
const kp = src("app/kiosk/page.tsx") /* ★裁定469（M-128・2026-11-09）: 包み（kiosk-workspace）は廃止＝kr は読まない */, qr = src("components/nox/kiosk-qr-display.tsx");
check("k(5-5) 端末ログインの直後に kiosk_device_bind(fp, ua)＝/kiosk（★裁定469（M-128・2026-11-09）: /kiosk-register は廃止）・'device bound' は denied（別の端末に固定済み）", kp.includes('supabase.rpc("kiosk_device_bind", { p_device_fp: fp, p_ua:') && kp.includes('if (!(await bindDevice())) { setPhase("denied")') && kp.includes("この端末では使えません"));
check("k(5-6) p_device_fp を kiosk_qr_secret／kiosk_qr_poll に添える（フラグ false は引数ごと送らない）・★裁定469（M-128・2026-11-09）: kiosk_login は KioskUnlockPad の kiosk_unlock が担う（0196 2-1）", qr.includes('rpc("kiosk_qr_secret", { p_rotate: false, ...fpArg() })') && qr.includes('rpc("kiosk_qr_poll", { ...fpArg() })'));
// K-0
check("k(0-2) ★裁定469（M-128・2026-11-09）: 簡易画面（/kiosk-register・/kiosk-shift・/kiosk-inventory・/kiosk-report）は /kiosk へ redirect・包み（kiosk-workspace／kiosk-views／kiosk-feature-page）は削除", ["register", "shift", "inventory", "report"].every((f) => fs.readFileSync(`app/kiosk-${f}/page.tsx`, "utf8").includes('redirect("/kiosk");')) && !fs.existsSync("components/nox/kiosk-workspace.tsx") && !fs.existsSync("components/nox/kiosk-views.tsx") && !fs.existsSync("components/nox/kiosk-feature-page.tsx"));
check("k(0-3) ★裁定469（M-128・2026-11-09）: タイル（レジ／シフト／在庫／日報）→ PIN（KioskPersonEntry の dest）→ 本人セッションで本店の同じページ・出退勤は名前選択＋PIN のまま", fs.readFileSync("app/kiosk/page.tsx", "utf8").includes("onClick={() => setTileDest(KIOSK_FEATURE_HREF[k])}") && fs.readFileSync("app/kiosk/page.tsx", "utf8").includes("<KioskPersonEntry dest={tileDest} open onClose={() => setTileDest(null)} />") && fs.readFileSync("components/nox/kiosk-person-entry.tsx", "utf8").includes("window.location.assign(dest ?? r.dest);"));
// K-1
check("k(1-1) ★裁定469（M-128・2026-11-09）: PIN なしで見えるのは出退勤の名前一覧だけ＝タイルは a（直リンク）でなく button（PIN の後に開く）", kp.includes('<button type="button" key={k} data-kiosk-tile={k}') && !kp.includes("<a key={k} href={KIOSK_FEATURE_HREF[k]}"));
check("k(1-2) ロックのお知らせ route（/api/kiosk/lock-notice）は残す（★裁定469（M-128・2026-11-09）: 人を選んで PIN の入口が無くなり呼び手は 0＝PIN だけの解除は誰のロックか分からない＝読取の気づき）", fs.existsSync("app/api/kiosk/lock-notice/route.ts") && typeof lockNoticeTextOf === "function");
{
  const r = src("app/api/kiosk/lock-notice/route.ts");
  check("k(1-3) lock-notice route＝端末を kiosk_devices.auth_user_id で確かめる（無ければ 403）・代筆者＝org の owner（無ければ manager）・直近 10 分の重複は書かない・audience 'staff'・until 翌日", r.includes('.eq("auth_user_id", user.id).eq("is_active", true).maybeSingle()') && r.includes('return NextResponse.json({ error: "forbidden" }, { status: 403 })') && r.includes('.in("role", ["owner", "manager"])') && r.includes('(writers ?? []).find((w) => w.role === "owner")') && r.includes('reason: "duplicate"') && r.includes('audience: "staff"'));
  const tx = lockNoticeTextOf({ deviceLabel: "入口タブレット", operatorName: "林", lockedUntil: "2026-10-30T05:10:00Z", now: new Date("2026-10-30T05:00:00Z") });
  check("k(1-4) お知らせ文＝題「端末「入口タブレット」で PIN の失敗が続きロックしました（14:00）」・本文に 14:10 頃に解除・until＝翌日（JST）", tx.title === "端末「入口タブレット」で PIN の失敗が続きロックしました（14:00）" && tx.body.includes("林さんの PIN が 5 回続けて違いました。14:10 頃に自動で解除されます。") && tx.until === "2026-10-31" && jstDatePlus(new Date("2026-10-30T16:00:00Z"), 1) === "2026-11-01", tx);
}
// 435 タイル
check("k(435-1) 5 タイル＝出退勤／レジ／シフト／在庫／日報（既定・無いキーは true）・店設定で OFF は落ちる・フラグ false は 3 つ・href／label／READY", JSON.stringify(kioskTilesOf(null)) === JSON.stringify(["punch", "register", "shift", "inventory", "report"]) && JSON.stringify(kioskTilesOf({ kiosk_features: { shift: false } })) === JSON.stringify(["punch", "register", "inventory", "report"]) && JSON.stringify(kioskTilesOf(null, false)) === JSON.stringify(["punch", "register", "shift"]) && KIOSK_FEATURES_ALL.every((k) => KIOSK_FEATURE_HREF[k] && KIOSK_FEATURE_LABEL[k]) && KIOSK_FEATURE_HREF.inventory === "/master/stock" && KIOSK_FEATURE_HREF.report === "/report" && KIOSK_FEATURE_HREF.register === "/register" && KIOSK_FEATURE_HREF.shift === "/shift" /* ★裁定469（M-128・2026-11-09）: 本店のページ */ && KIOSK_FEATURE_LABEL.report === "日報" && KIOSK_FEATURE_READY.register && KIOSK_FEATURE_READY.inventory /* ★0194（2026-11-04）: 在庫タイル＝kiosk_stock_levels */);
check("k(435-2) ホームのタイルに data-kiosk-tile／ready（★裁定469（M-128・2026-11-09）: button＝PIN → 本店のページ・簡易画面は redirect）", kp.includes('data-kiosk-tile={k} data-kiosk-tile-ready={KIOSK_FEATURE_READY[k] ? "1" : "0"}') && ["register", "shift", "inventory", "report"].every((f) => fs.readFileSync(`app/kiosk-${f}/page.tsx`, "utf8").includes('redirect("/kiosk");')));
// K-4
check("k(4-1) K-4 端末アカウントは / から /kiosk-register（kiosk_operator_list）／/kiosk（kiosk_cast_list）・それ以外は /login・manifest-kiosk.json（start_url /kiosk・ショートカット 2）を kiosk 配下 5 つの layout が指す", src("app/page.tsx").includes('if (Array.isArray(ops) && ops.length > 0) redirect("/kiosk");') /* ★裁定469（M-128・2026-11-09）: レジ端末も /kiosk */ && src("app/page.tsx").includes('if (Array.isArray(casts) && casts.length > 0) redirect("/kiosk");') && has("public/manifest-kiosk.json") && JSON.parse(src("public/manifest-kiosk.json")).start_url === "/kiosk" && JSON.parse(src("public/manifest-kiosk.json")).shortcuts.length === 2 && ["kiosk", "kiosk-register", "kiosk-shift", "kiosk-inventory", "kiosk-report"].every((d) => has(`app/${d}/layout.tsx`) && src(`app/${d}/layout.tsx`).includes('manifest: "/manifest-kiosk.json"')) && src("public/manifest.json").includes('"start_url": "/"'));
// M-29・退店・打刻ゲート（管理側）
{
  const route = src("app/api/kiosk/provision/route.ts"), kdp = src("app/(manage)/master/kiosk-device-panel.tsx"), de = src("lib/nox/kiosk/device-errors.ts");
  check("k(29-1) 端末一覧＝再発行して有効化（route reactivate＝kiosk_reactivate＋unban＋新 PW）・削除（route delete＝kiosk_delete＋deleteUser）・固定の解除（kiosk_device_unbind）・GET が bound／bound_at を返す", route.includes('"reactivate"') && route.includes('rpc("kiosk_reactivate"') && route.includes('ban_duration: "none"') && route.includes('"delete"') && route.includes('rpc("kiosk_delete"') && route.includes("deleteUser(") && route.includes("bound_at") && kdp.includes("data-kiosk-reactivate=") && kdp.includes("data-kiosk-delete=") && kdp.includes('rpc("kiosk_device_unbind"') && kdp.includes("固定を解除"));
  check("k(29-2) 上限 3 台（kioskDeviceLimit＝フラグ true で 3・false で 1）・'device limit'／'device bound'／'already active'／'still active' の日本語", kioskDeviceLimit() === 3 && (__set0190ForTest(false), kioskDeviceLimit() === 1) && (__set0190ForTest(null), true) && kioskErrJa(409, "device limit", "打刻").includes("上限（3 台）") && kioskErrJa(409, "device bound", "レジ").includes("固定") && kioskErrJa(409, "already active", "レジ").includes("有効") && kioskErrJa(409, "still active", "レジ").includes("削除できません") && de.includes("export function kioskDeviceLimit()"));
  const retire = has("app/api/auth/retire/route.ts") ? src("app/api/auth/retire/route.ts") : "";
  check("k(r-1) 退店 route＝/api/auth/retire（cast／staff・ban／unban・owner／manager・is_active=false のときだけ ban・他の有効な役があれば ban しない）・casts-board／staff-board が呼ぶ", retire.includes('"876000h"') && retire.includes('ban_duration: "none"') && retire.includes("other active role") && src("app/(manage)/casts/casts-board.tsx").includes('"/api/auth/retire"') && src("app/(manage)/staff/staff-board.tsx").includes('"/api/auth/retire"'));
  check("k(g-1) 打刻ゲート＝rpc-err 'off duty'→「出勤してからレジを開けます」・register-board も同文・店舗設定の打刻ゲートのスイッチは ★M-143 で撤去", src("lib/nox/ui/rpc-err.ts").includes("[/^off duty$/,") && src("app/(manage)/register/register-board.tsx").includes("off duty") && src("app/(manage)/register/register-board.tsx").includes("出勤してからレジを開けます") && !src("app/(manage)/master/store-profile-panel.tsx").includes('data-duty-gate="0190"') && src("app/(manage)/master/store-profile-panel.tsx").includes("★M-143") /* ★M-143（2026-11-10）: 打刻ゲート（duty_gate）は撤去＝裁定472 で例外が廃止 */);
}
// gen-demo
check("k(d-1) gen-demo の settings_json に duty_gate:false（6 デモ店＝06:05 の reset で ON に戻らない）・payload 6 本に反映", src("scripts/demo/gen-demo.mjs").includes("duty_gate: false") && ["ace", "lily", "luna", "muse", "nest", "noir"].every((s) => src(`docs/demo/payload/${s}.json`).includes('"duty_gate":false') || src(`docs/demo/payload/${s}.json`).includes('"duty_gate": false')));
// 旧 pin の整合＝kiosk-register に残す文字列（qr／p175prep）
check("k(x-1) ★裁定469（M-128・2026-11-09）: 本人セッションの無操作＝3 分（店設定が短ければ店設定）・帯のナビ＝ホーム／レジ／シフト／在庫／日報（cast はレジだけ）", KIOSK_PERSON_IDLE_MINUTES === 3 && src("app/(manage)/layout.tsx").includes("idleMinutes={Math.min(KIOSK_PERSON_IDLE_MINUTES, kioskPersonIdleMinutesOf(storeRows?.[0]?.settings_json))}") && JSON.stringify(kioskPersonNavOf("manager", { shift: false, register: false })[0].items.map((x) => x.label)) === JSON.stringify(["ホーム", "レジ", "シフト", "在庫", "日報"]) && JSON.stringify(kioskPersonNavOf("staff", { shift: false, register: true })[0].items.map((x) => x.label)) === JSON.stringify(["ホーム", "レジ", "日報"]) && JSON.stringify(kioskPersonNavOf("cast", { shift: true, register: true })[0].items.map((x) => x.label)) === JSON.stringify(["レジ"]));

if (fails.length) { console.error(`verify:nox-k FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-k OK ${pass} checks（0190 のフラグ true 便＝K-5／K-0／K-1／435 タイル／K-4／M-29／退店／打刻ゲート）`);

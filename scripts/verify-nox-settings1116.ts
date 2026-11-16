/*
 * verify:nox-settings1116 — 店舗設定の作り直し（2026-11-16 ■8・裁定499-10・試作 docs/tmp/proto_settings_1113/index6.html）の第 1 段＝6 タブへの配り直し。DB 不触・env 不要＝逐語 pin。
 *   npm run verify:nox-settings1116。対応表＝docs/tmp/settings_map_1116.md。
 *  st(1) タブ＝店舗情報／レジ／シフトと打刻／給与／キャスト画面／税と請求（＋LINE 連携）・旧 features は給与・既定は店舗情報。
 *  st(2) 落とさない＝今の店舗設定の節（StoreProfilePanel の 11 の鍵）とパネル（報酬制度・機能の公開・キャスト画面・打刻の設定・体入の条件・LINE）が全部どこかのタブに出る。
 *  st(3) 店長の打刻の許可＝シフトと打刻（set_store_manager_punch・p_on は明示の boolean・オーナーだけ）。
 *  st(4) 保存する値と RPC は不変（set_store_profile の呼び口 1 つ・patchOf は節を見ない）。
 */
import fs from "node:fs";
import { storeProfileTabOf, STORE_PROFILE_TABS6, MASTER_NAV } from "../lib/nox/master/nav";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const pg = src("app/(manage)/master/store-profile/page.tsx"), sp = src("app/(manage)/master/store-profile-panel.tsx"), mp = src("app/(manage)/master/manager-punch-panel.tsx");

const spTabs = MASTER_NAV.flatMap((g) => g.pages).find((p) => p.href === "/master/store-profile")?.tabs ?? [];
check("st(1-1) 6 タブ（＋LINE）の並びと名前（マスタの共通のタブ）", JSON.stringify(spTabs.map((x) => `${x.href.split("tab=")[1]}:${x.label}`)) === JSON.stringify(["info:店舗情報", "register:レジ", "shift:シフトと打刻", "pay:給与", "mine:キャスト画面", "tax:税と請求", "line:LINE 連携"]) && JSON.stringify(STORE_PROFILE_TABS6) === JSON.stringify(["info", "register", "shift", "pay", "mine", "tax"]));
check("st(1-3) ★タブの並びは 1 つだけ（2026-11-16 相談役）＝ページは自前の並び（StoreSettingsTabs・nox-segtabs）を描かない・上のマスタの共通のタブだけ", !pg.includes("StoreSettingsTabs") && !pg.includes("nox-segtabs") && !fs.existsSync("app/(manage)/master/store-settings-tabs.tsx"));
check("st(1-2) 既定＝店舗情報・旧 features＝給与", storeProfileTabOf(undefined) === "info" && storeProfileTabOf("features") === "pay" && storeProfileTabOf("zzz") === "info");
const KEYS = ["profile", "payprof", "regprof", "data", "timeBasis", "shift", "ar", "opsTax", "opsPay", "opsReg", "opsShift"];
const used = new Set([...pg.matchAll(/sections=\{\["([a-zA-Z]+)"\]\}/g)].map((m) => m[1]));
check("st(2-1) StoreProfilePanel の 11 の節の鍵が全部どこかのタブで使われる（落とさない）", KEYS.every((k) => used.has(k)) && used.size === KEYS.length, [...used]);
check("st(2-2) 節の鍵が型に全部ある", KEYS.every((k) => sp.includes(`"${k}"`)));
check("st(2-3) ほかのパネルも全部どこかのタブに", ["<SystemsBoard storeId={systems.storeId}", "<FeatureFlagsPanel stores={stores} />", "<MineSettingsPanel stores={stores} isOwner={isOwner} />", "<PunchRulesPanel stores={stores} isOwner={isOwner} />", "<TrialTermsPanel stores={stores} isOwner={isOwner} />", "<LineConfigPanel stores={stores} isOwner={isOwner} />", "<ManagerPunchPanel stores={stores} isOwner={isOwner} />"].every((x) => pg.includes(x)));
check("st(2-4) 旧の会計と運用の項目＝節の鍵の下に全部（インボイス・支払日・消費税・フロア・支払い方法・打刻・端末の本人ログイン・割合・源泉区分 2・釣銭・締め日）",
  sp.includes('{on("opsTax") && <label style={{ display: "block", minWidth: 0 }}>\n                <span style={label}>インボイス登録日') && sp.includes('{on("opsPay") && <label style={{ display: "block", minWidth: 0 }}>\n                <span style={label}>給与の支払日') && sp.includes('{on("opsTax") && <div style={{ minWidth: 0 }}>\n                <span style={label}>消費税の表示')
  && sp.includes('{on("opsReg") && <div style={{ minWidth: 0 }}>\n                <span style={label}>フロア') && sp.includes('{on("opsReg") && <div style={{ minWidth: 0 }}>\n                <span style={label}>お客様の支払い方法') && sp.includes('{on("opsShift") && <div style={{ minWidth: 0 }}>\n                {mig0197On() && (') && sp.includes('{on("opsShift") && mig0192On() && (')
  && sp.includes('{on("opsPay") && <><span style={label}>指名の区分ごとの割合') && sp.includes('{on("opsTax") && <div><span style={label}>源泉区分の既定（委託キャスト）') && sp.includes('{on("opsTax") && <div><span style={label}>源泉区分の既定（委託スタッフ）') && sp.includes('{on("opsReg") && <div><span style={label}>釣銭準備金') && sp.includes('{on("opsPay") && <div><span style={label}>締め日'));
check("st(2-5) 旧の店舗情報の項目＝店舗名 4 つ（profile）・送りの基本額／精算方式／途中払い（payprof）・途中合流／支払方法の調整／手数料（regprof）",
  ["name", "short", "store_code", "display_name"].every((k) => sp.includes(`{on("profile") && field("${k}"`)) && (sp.match(/\{on\("payprof"\) && <label/g) ?? []).length === 3 && (sp.match(/\{on\("regprof"\)/g) ?? []).length === 3);
check("st(3-1) 店長の打刻＝シフトと打刻・set_store_manager_punch(p_store_id, p_on)・オーナーだけ・明示の boolean", pg.includes('{tab === "shift" && mig0201On() && <ManagerPunchPanel stores={stores} isOwner={isOwner} />}') && mp.includes('rpc("set_store_manager_punch", { p_store_id: storeSel, p_on: v })') && mp.includes("disabled={!isOwner || busy || cur === null}") && mp.includes('.select("manager_punch_enabled")'));
check("st(4-1) RPC と保存の式は不変（set_store_profile の呼び口 1 つ・patchOf は節を見ない）", (sp.match(/rpc\("set_store_profile"/g) ?? []).length === 1 && !/const patchOf = \(\): Record<string, unknown> => \{[\s\S]*?on\("/.test(sp.slice(sp.indexOf("const patchOf"), sp.indexOf("const dirty"))));

if (fails.length) {
  console.error(`verify:nox-settings1116 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-settings1116 OK (${pass} checks)`);
console.log("店舗設定の作り直し（■8 第 1 段）: 6 タブ・節の鍵 11 とパネル 7 が全部どこかに・店長の打刻＝シフトと打刻・RPC 不変");

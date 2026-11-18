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
check("st(1-4) ★スマホのタブは 2 列（2026-11-16 Agoora 17:20）＝マスタの共通のタブ（master-subnav）に nox-segtabs--grid2・900px 未満はリンクのタブも 2 列・奇数は最後を横いっぱい・900 以上は 1 段（横スクロール）", (() => { const sn = fs.readFileSync("app/(manage)/master/master-subnav.tsx", "utf8"); const css = fs.readFileSync("app/globals.css", "utf8"); return sn.includes('className="nox-seg nox-segtabs nox-segtabs--grid2"') && sn.includes('className="nox-ctoolbar nox-subnav-tabs"') && !sn.includes('overflowX: "auto"') && css.includes(".nox-segtabs.nox-segtabs--grid2 > a { display: flex;") && css.includes(".nox-segtabs.nox-segtabs--grid2 > a:last-child:nth-child(odd) { grid-column: 1 / -1;") && css.includes("@media (min-width: 900px) { .nox-subnav-tabs { overflow-x: auto; } }"); })());
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
  sp.includes('{on("profile") && field("name", "店舗名"') && ["short", "store_code", "display_name"].every((k) => !sp.includes(`{field("${k}"`)) && !sp.includes('data-settings-fold="profile"') && sp.includes('for (const k of ["name", "customer_purpose"] as const) {') /* ★2026-11-18（Agoora の決定）: 略称・店舗コード・表示名は画面から外した・送らない（DB の値は残す） */ && (sp.match(/\{on\("payprof"\) && <label/g) ?? []).length === 3 && (sp.match(/\{on\("regprof"\)/g) ?? []).length === 3);
check("st(3-1) 店長の打刻＝シフトと打刻・set_store_manager_punch(p_store_id, p_on)・オーナーだけ・明示の boolean", pg.includes('{tab === "shift" && mig0201On() && <ManagerPunchPanel stores={stores} isOwner={isOwner} />}') && mp.includes('rpc("set_store_manager_punch", { p_store_id: storeSel, p_on: v })') && mp.includes("disabled={!isOwner || busy || cur === null}") && mp.includes('.select("manager_punch_enabled")'));
const tp = src("app/(manage)/master/trial-terms-panel.tsx"), css = src("app/globals.css");
check("st(5-1) ★B6: 補足は項目の横の ⓘ（InfoTip）＝店舗情報のパネルと体入の条件に、ラベルの後ろの補足の文（細字の span）が残っていない", !sp.includes("<span style={{ fontWeight: 400, marginLeft: 6 }}>") && !tp.includes("<span style={{ fontWeight: 400, marginLeft: 6 }}>") && (sp.match(/<InfoTip>/g) ?? []).length === 16 && (tp.match(/<InfoTip>/g) ?? []).length === 2 && src("components/ui/info-tip.tsx").includes("aria-expanded={open}"));
check("st(5-2) ★B6: 特殊な設定は「詳しい設定」に畳む（店の端末で本人がログインしたとき・★2026-11-18 略称・店舗コード・表示名は外した）", !sp.includes('data-settings-fold="profile"') && sp.includes('data-settings-fold="kiosk-idle"') && css.includes(".nox-settings-fold > summary {"));
check("st(5-3) ★B6: 保存はカードの下に固定（2 枚のカード）・文字と欄の大きさは初期設定（13px・最小 40px）に揃える範囲＝nox-settings", (sp.match(/className="nox-actions nox-settings-save"/g) ?? []).length === 2 && css.includes(".nox-settings-save { position: sticky;") && pg.includes('<div className="nox-mv1 nox-settings">') && css.includes(".nox-settings input:not([type=checkbox]):not([type=radio]), .nox-settings select, .nox-settings textarea { font-size: 13px; min-height: 40px; }"));
{ const pr = src("app/(manage)/master/punch-rules-panel.tsx"), ms = src("app/(manage)/master/mine-settings-panel.tsx"), lc = src("app/(manage)/master/line-config-panel.tsx");
  check("st(5-4) ★C（2026-11-16）: 打刻の設定・キャスト画面・LINE 連携も同じ形＝説明は ⓘ（リンクの説明は残す）・保存の帯・LINE の URL は詳しい設定に畳む・主ボタンは金の小（大きな主ボタンは無い）",
    (pr.match(/<InfoTip>/g) ?? []).length === 5 && !pr.includes("<p style={rowDesc}>") && (ms.match(/<InfoTip>/g) ?? []).length === 3 && (ms.match(/style={rowDesc}/g) ?? []).length === 1 /* リンクの 1 つだけ */
    && lc.includes('data-settings-fold="line-urls"') && lc.includes("<InfoTip>{LINE_NOTIFY_COUNT_NOTE}</InfoTip>") && !lc.includes("t.btnPrimary56")
    && [pr, ms].every((x) => (x.match(/className="nox-actions nox-settings-save"/g) ?? []).length === 1) && (lc.match(/className="nox-actions nox-settings-save"/g) ?? []).length === 2); }
check("st(4-1) RPC と保存の式は不変（set_store_profile の呼び口 1 つ・patchOf は節を見ない）", (sp.match(/rpc\("set_store_profile"/g) ?? []).length === 1 && !/const patchOf = \(\): Record<string, unknown> => \{[\s\S]*?on\("/.test(sp.slice(sp.indexOf("const patchOf"), sp.indexOf("const dirty"))));

// ★2026-11-17（相談役 4・Agoora 確定）: 店舗設定のレイアウト（見せ方だけ）
{ const cssL = fs.readFileSync("app/globals.css", "utf8");
  check("st(6-1) PC＝1 項目 1 行の 2 列（左 200〜300px に項目名と説明・右に部品）・説明は 46em まで・金額と単位の欄は 320px まで・保存は右下",
    cssL.includes('.nox-settings .nox-cardtop [style*="repeat(auto-fit, minmax(2"] { grid-template-columns: minmax(0, 1fr) !important; row-gap: 0 !important; }')
    && cssL.includes("grid-template-columns: minmax(200px, 300px) minmax(0, 1fr); column-gap: 28px;") && cssL.includes("> :not(:first-child) { grid-column: 2; max-width: 46em; }")
    && cssL.includes(".nox-settings .nox-cardtop :is(.nox-money, .nox-unit) { max-width: 320px !important; }") && cssL.includes(".nox-settings .nox-settings-save { display: flex; justify-content: flex-end; gap: 8px; }"));
  check("st(6-2) PC＝ON／OFF と状態の文字は 1 行（カウンターが 2 行に折れない・状態の位置が揃う）", cssL.includes(".nox-settings .nox-onoffwrap { flex-wrap: nowrap; }") && cssL.includes('.nox-settings [style*="inline-flex"]:has(> .nox-onoffwrap) { white-space: nowrap; }'));
  check("st(6-3) 375＝保存の帯と下のメニューが中身に重ならない（変更の無い帯は流れの中・変更のある帯だけ下のメニューのすぐ上に固定＋その分の余白 76px）",
    cssL.includes(".nox-settings .nox-settings-save:not(:has(button:not(:disabled))) { position: static; margin-bottom: 0; }")
    && cssL.includes(".nox-settings .nox-settings-save:has(button:not(:disabled)) { position: fixed; left: 0; right: 0; bottom: calc(var(--nox-bnav-h, 66px) + env(safe-area-inset-bottom, 0px));")
    && cssL.includes(".nox-settings:has(.nox-settings-save button:not(:disabled)) { padding-bottom: 76px; }"));
  check("st(6-4) 375＝3 択以上の選択は縦に横いっぱい・チェックの行は折り返す", cssL.includes(".nox-settings .nox-seg:has(> :nth-child(3)) { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; }") && cssL.includes(".nox-settings div:has(> label > input[type=checkbox]) { flex-wrap: wrap !important; row-gap: 8px; }"));
  const btns = ["app/(manage)/master/store-profile-panel.tsx", "app/(manage)/master/punch-rules-panel.tsx", "app/(manage)/master/mine-settings-panel.tsx"].every((p) => /data-settings-save="1"[sS]{0,400}disabled={busy || !dirty}/.test(fs.readFileSync(p, "utf8")));
  check("st(6-5) 固定の判定の元＝保存の帯の「元に戻す」は変更があるときだけ押せる（店舗情報・打刻・キャスト画面）", btns); }
{ const cssY = fs.readFileSync("app/globals.css", "utf8");
  check("st(6-6) ★Y1: PC の 2 列を残りのタブにも（打刻のカード＝data-punch-choice の親・シフト運用＝自動確定時間・LINE の欄）・保存は右下（.nox-actions）",
    cssY.includes("  .nox-settings .nox-actions { justify-content: flex-end; }") && cssY.includes(".nox-settings div:has(> [data-punch-choice]) { display: grid;") && cssY.includes(".nox-settings label:has(> [data-shift-auto-confirm]), .nox-settings [data-line-form] > label { display: grid !important;") && cssY.includes(".nox-settings [data-line-form] { max-width: none !important; }")); }
{ const cssY = fs.readFileSync("app/globals.css", "utf8");
  check("st(6-7) ★Y1: キャスト画面の行（data-cast-register-link と 1 1 240px の左の欄を持つ行）も 2 列", cssY.includes(":is(.nox-settings div:has(> div[style*=\"1 1 240px\"]:first-child), .nox-settings [data-cast-register-link]) { display: grid !important;")); }
{ const pr = fs.readFileSync("lib/nox/ui/actions-center-probe.ts", "utf8");
  check("st(6-8) ★Y1: 中央寄せの検査の例外は店舗設定の保存の PC だけ（.nox-settings .nox-actions かつ 900px 以上）", pr.includes('else if (b.closest(".nox-settings .nox-actions") && innerWidth >= 900) reason = "店舗設定の保存（PC は枠の右下＝相談役 4・Y1 2026-11-17）";')); }
{ const pgI = fs.readFileSync("app/(manage)/master/store-profile/page.tsx", "utf8");
  check("st(7-1) ★2026-11-18（Agoora の決定）: 店舗情報のタブの説明に略称・店舗コード・表示名が無い", pgI.includes('desc: "店舗名。営業時間と定休日は') && !/desc: "[^"]*略称/.test(pgI)); }
if (fails.length) {
  console.error(`verify:nox-settings1116 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-settings1116 OK (${pass} checks)`);
console.log("店舗設定の作り直し（■8 第 1 段）: 6 タブ・節の鍵 11 とパネル 7 が全部どこかに・店長の打刻＝シフトと打刻・RPC 不変");

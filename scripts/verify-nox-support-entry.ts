/* verify:nox-support-entry — 起票152（2026-11-24・相談役の便【2】）: サポート許可の入口を 3 つ足す（置き場は動かさない・DB 変更 0）。
 *  ア 直通の URL（/ops の会社の詳細＝サポート許可が無いときの黄色い注意の所に URL とコピー）・ログインの後に同じ場所へ戻る（?next=・マスタの中だけ）
 *  イ マスタの「店舗・運用」のカード（オーナーだけ・デモの会社は出さない）・ウ マスタの検索（「サポート」「代行」）
 *  オーナー以外が URL を開いたら 1 行。許可を出す・取り消す関数と権限の判定には触れない。 */
import fs from "node:fs";
import {
  SUPPORT_GRANT_PATH, SUPPORT_GRANT_URL, SUPPORT_TAB_KEY, SUPPORT_OWNER_ONLY_NOTE, SUPPORT_DEMO_NOTE, SUPPORT_CARD,
  supportCardHitOf, supportCardShownOf, supportMissingNoteOf, safeNextOf, loginNextOf,
} from "../lib/nox/support/grant-entry";
import { assistGateOf, supportUrlShownOf, NO_SUPPORT_GRANT_REASON } from "../lib/nox/ops/assist";

let pass = 0; const fails: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ア URL
check("(1) URL は https://noxapp.jp から・場所を指すだけ（tab=support の 1 つ・トークンや鍵の形が無い）",
  SUPPORT_GRANT_URL === "https://noxapp.jp/master/system?tab=support" && SUPPORT_GRANT_PATH === "/master/system?tab=support"
  && !/token|key|secret|hash|sig|code=/i.test(SUPPORT_GRANT_URL) && [...new URL(SUPPORT_GRANT_URL).searchParams.keys()].join(",") === "tab");
const now = new Date("2026-11-24T05:00:00Z");
const gNo = assistGateOf({ onboarding_state: "done", is_demo: false, support_until: null }, now);
const gOld = assistGateOf({ onboarding_state: "done", is_demo: false, support_until: "2026-11-20T00:00:00Z" }, now);
const gOn = assistGateOf({ onboarding_state: "done", is_demo: false, support_until: "2026-11-30T00:00:00Z" }, now);
const gOnb = assistGateOf({ onboarding_state: "onboarding", is_demo: false, support_until: null }, now);
const gDemo = assistGateOf({ onboarding_state: "done", is_demo: true, support_until: null }, now);
check("(1) /ops で URL を出すのは「導入完了の後で許可が無い」ときだけ（期限切れも出す・許可の間・導入中・デモは出さない）",
  supportUrlShownOf(gNo) && supportUrlShownOf(gOld) && !supportUrlShownOf(gOn) && !supportUrlShownOf(gOnb) && !supportUrlShownOf(gDemo) && !supportUrlShownOf(null) && gNo.reason === NO_SUPPORT_GRANT_REASON,
  { gNo, gOn, gOnb, gDemo });
const od = src("app/ops/orgs/[id]/org-detail.tsx");
check("(1) /ops の会社の詳細＝黄色い注意の下に URL の欄とコピーのボタン（中央＝nox-actions・コピーは clipboard だけ＝通信なし）",
  od.includes("{supportUrlShownOf(assist) && <SupportUrlBox />}") && od.includes('data-ops-support-url="1"') && od.includes('data-ops-support-copy="1"')
  && od.includes("navigator.clipboard.writeText(SUPPORT_GRANT_URL)")
  && od.includes('<div className="nox-actions" style={{ marginTop: 8 }}>\n        <button type="button" style={t.btnGhost} onClick={() => void copy()} data-ops-support-copy="1">URL をコピー</button>')
  && !/function SupportUrlBox[\s\S]{0,1200}fetch\(/.test(od));

// ログインの後に戻る（マスタの中だけ）
check("(2) ?next= はマスタの中の同じサイトのパスだけ通す（外のサイト・//・\\・:・マスタの外・長すぎは断る）",
  safeNextOf("/master/system?tab=support") === "/master/system?tab=support" && safeNextOf("/master/store-profile?tab=info") === "/master/store-profile?tab=info"
  && [null, "", "//evil.example/master/x", "https://evil.example/master/x", "/master//evil", "/master/x\\y", "javascript:alert(1)", "/dashboard", "/register", "/mine", "/master/x?a=b:c", "/" + "master/" + "a".repeat(300), "/master/..%2f", "/master/a b"]
    .every((x) => safeNextOf(x as string | null) === null));
check("(2) middleware が付ける next はマスタの中のパスだけ（ほかは付けない＝今のまま）",
  loginNextOf("/master/system", "?tab=support") === "/master/system?tab=support" && loginNextOf("/dashboard", "") === null && loginNextOf("/register", "?kiosk=1") === null && loginNextOf("/shift", "") === null);
const mw = src("lib/supabase/middleware.ts");
check("(2) middleware＝未ログインの保護パスで loginNextOf があるときだけ ?next=・無いときは元のクエリのまま（今の形）",
  mw.includes("const next = loginNextOf(path, request.nextUrl.search);") && mw.includes("if (next) url.search = `?next=${encodeURIComponent(next)}`;") && mw.includes('url.pathname = "/login";'));
const lg = src("app/login/page.tsx");
check("(2) ログイン＝キャスト以外は safeNextOf を通った next へ（読み直す移動）・無ければ今のまま（/mine・/dashboard の行は 1 字も変えない）",
  lg.includes('const nextTo = role === "cast" ? null : safeNextOf(new URLSearchParams(window.location.search).get("next"));') && lg.includes("if (nextTo) { window.location.replace(nextTo); return; }")
  && lg.includes('window.location.replace(role === "cast" ? "/mine" : "/dashboard");') && lg.indexOf("if (nextTo)") < lg.indexOf('window.location.replace(role === "cast" ? "/mine" : "/dashboard");'));

// スタッフ・システムのタブ（置き場は動かさない）
const sp = src("app/(manage)/master/system/page.tsx");
const sb = src("app/(manage)/master/system/system-board.tsx");
check("(3) ?tab=support で開く＝サポート許可のタブを最初に（タブの出し方＝旗・オーナー・デモでない＝今のまま）",
  SUPPORT_TAB_KEY === "support" && sp.includes('{ key: "support", label: "◇ サポート許可", node: <SupportGrantPanel orgId={orgId as string} /> }') && sp.includes("if (mig0202bOn() && role === \"owner\") {")
  && sp.includes("initialKey={requestedTab === SUPPORT_TAB_KEY && tabs.some((x) => x.key === SUPPORT_TAB_KEY) ? SUPPORT_TAB_KEY : null}") && sb.includes("useState(initialKey && tabs.some((t) => t.key === initialKey) ? initialKey : (tabs[0]?.key ?? \"\"))"));
check("(3) タブが無いとき（店長・デモの会社のオーナー）は 1 行・support 以外の tab やタブがあるときは出さない",
  supportMissingNoteOf({ requestedTab: "support", hasSupportTab: false, role: "manager", isDemo: false }) === SUPPORT_OWNER_ONLY_NOTE
  && supportMissingNoteOf({ requestedTab: "support", hasSupportTab: false, role: "owner", isDemo: true }) === SUPPORT_DEMO_NOTE
  && supportMissingNoteOf({ requestedTab: "support", hasSupportTab: true, role: "owner", isDemo: false }) === null
  && supportMissingNoteOf({ requestedTab: null, hasSupportTab: false, role: "manager", isDemo: false }) === null
  && supportMissingNoteOf({ requestedTab: "pins", hasSupportTab: false, role: "manager", isDemo: false }) === null
  && SUPPORT_OWNER_ONLY_NOTE === "サポート許可はオーナーだけが出せます" && sp.includes('{supportNote && <p data-support-note="1"'));

// イ カード・ウ 検索
check("(4) カードはオーナーだけ・デモの会社と旗 false は出さない",
  supportCardShownOf({ flag: true, role: "owner", isDemo: false }) && !supportCardShownOf({ flag: true, role: "manager", isDemo: false }) && !supportCardShownOf({ flag: true, role: "owner", isDemo: true }) && !supportCardShownOf({ flag: false, role: "owner", isDemo: false }));
const mp = src("app/(manage)/master/page.tsx"); const mb = src("app/(manage)/master/master-board.tsx");
check("(4) マスタのトップ＝「店舗・運用」の群にだけカード（showSupport）・行き先は直通の URL と同じ",
  mp.includes("<MasterBoard storeId={storeId} showSupport={showSupport} showInquiry={showInquiry} />") /* ★0212: 運営への問い合わせのカードの prop が増えた */ && mb.includes('const supportHere = g.key === "store" && showSupport && supportCardHitOf(hubSearch);')
  && mb.includes('href={SUPPORT_CARD.href} className="nox-fcard" data-hub-support="1"') && SUPPORT_CARD.href === SUPPORT_GRANT_PATH);
check("(5) 検索＝「サポート」「代行」「許可」で当たる・関係ない語は当たらない・空は出す",
  supportCardHitOf("サポート") && supportCardHitOf("代行") && supportCardHitOf("許可") && supportCardHitOf("サポート許可") && supportCardHitOf("") && !supportCardHitOf("商品") && !supportCardHitOf("ノルマ") && !supportCardHitOf("席"));
check("(5) 検索で何も当たらないときの文は、カードが当たるときは出さない", mb.includes("&& !(showSupport && supportCardHitOf(hubSearch)) && ("));

// 触れないもの
const panel = src("components/nox/support-grant-panel.tsx");
check("(6) 許可を出す・取り消す関数の呼び方（日数 1／3／7・取り消し）は今のまま",
  panel.includes('rpc("support_grant_set", { p_days: d }') && panel.includes('rpc("support_grant_revoke", {}') && panel.includes("[1, 3, 7].map"));
check("(6) マスタの入口の数（9）は変えない＝カードは MASTER_NAV に足していない", !src("lib/nox/master/nav.ts").includes("サポート許可"));

if (fails.length) { console.log(`verify:nox-support-entry FAIL ${fails.length}（pass ${pass}）`); for (const f of fails) console.log(" - " + f); process.exit(1); }
console.log(`verify:nox-support-entry OK (${pass} checks)`);

/*
 * verify:nox-line-richmenu — LINE のリッチメニューの自動登録と友だち追加の必須（2026-11-18 夜・相談役 ⑤・0201q の後＝フラグ MIG_0201Q_APPLIED）。DB 不触・env 不要・LINE に送らない。
 *  lr(1) 純関数：公式アカウントの ID の検査（set_store_line_extra と同じ形）・友だち追加の URL・必須にする条件（ID がある店だけ）・自動登録の条件・結果の 1 行。
 *  lr(2) リッチメニューの形：2500×843・3 等分（ホーム／シフト／お知らせ＝LIFF の ?to＝裁定500-6 の許可表）・画像は PNG で同じ大きさ・1MB 未満。
 *  lr(3) route：フラグ・セッション・owner／自店 manager・デモ 403・トークンは Vault・ID の保存は利用者の client の set_store_line_extra・失敗は理由を返す（保存を止めない）。
 *  lr(4) 紐付けの route：id_token の確かめの後・bind_line の前に、ID がある店だけ Messaging API のプロフィールで友だちかを確かめる（友だちでなければ 403＋追加の URL・わからなければ止めない）。
 *  lr(5) LIFF：ID がある店だけ getFriendship（false＝連携に進まず追加の案内）・route の 403 も同じ案内。
 *  lr(6) 設定の画面：公式アカウントの ID の欄・保存で ID を set_store_line_extra に・LIFF ID かトークンを入れた保存だけ自動で登録・作り直す／外す・失敗は別の行。
 */
import fs from "node:fs";
import { BOT_BASIC_ID_RE, botBasicIdErrorOf, botBasicIdNormOf, friendAddUrlOf, friendRequiredOf, richMenuAutoOf, richMenuBodyOf, richMenuResultTextOf, richMenuStateOf, RICHMENU_AREAS } from "../lib/nox/line/richmenu";
import { RICHMENU_IMAGE_SIZE, RICHMENU_PNG_BASE64 } from "../lib/nox/line/richmenu-image";
import { LIFF_TO_DEST } from "../lib/nox/line/liff-endpoint";
import { MIG_0201Q_APPLIED } from "../lib/nox/rules-0175/flag";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

check("lr(0) MIG_0201Q_APPLIED＝true（0201q 11/18 16:53 手貼り）", MIG_0201Q_APPLIED === true);
check("lr(1-1) 公式アカウントの ID＝'@'＋小文字の英数と . _ -（DB の検査と同じ）・前後の空白と大文字は直してから",
  BOT_BASIC_ID_RE.source === "^@[0-9a-z._-]{1,40}$" && botBasicIdNormOf(" @ABC123 ") === "@abc123" && botBasicIdErrorOf("@abc123") === null && botBasicIdErrorOf("") === null && botBasicIdErrorOf("abc") !== null && botBasicIdErrorOf("@あ") !== null);
check("lr(1-2) 友だち追加の URL＝https://line.me/R/ti/p/%40<id>", friendAddUrlOf("@abc123") === "https://line.me/R/ti/p/%40abc123");
check("lr(1-3) 必須にするのは公式アカウントの ID がある店だけ（無い店は今までどおり）", friendRequiredOf({ bot_basic_id: "@abc" }) && !friendRequiredOf({}) && !friendRequiredOf(null) && !friendRequiredOf({ bot_basic_id: "abc" }));
check("lr(1-4) 自動で登録するのは LIFF ID かトークンを入れた保存のときだけ", richMenuAutoOf(true, false) && richMenuAutoOf(false, true) && !richMenuAutoOf(false, false));
check("lr(1-5) 結果の 1 行（失敗は理由と「設定の保存は済んでいます」）・状態＝ID があれば使う（友だち全員）",
  richMenuResultTextOf({ ok: true, status: "created" }) === "リッチメニューを登録しました（友だち全員）"
  && richMenuResultTextOf({ ok: false, reason: "no_token" }).includes("チャネルアクセストークンが未設定です") && richMenuResultTextOf({ ok: false, reason: "no_token" }).endsWith("設定の保存は済んでいます")
  && richMenuStateOf({ richmenu_id_default: "richmenu-" + "a".repeat(32) }) === "on" && richMenuStateOf({}) === "off");

const body = richMenuBodyOf("1234567890-AbCdEfGh") as { size: { width: number; height: number }; areas: { bounds: { x: number; width: number; height: number }; action: { type: string; uri: string } }[] };
check("lr(2-1) 2500×843・3 等分（隙間・重なりなし）・URI＝https://liff.line.me/<LIFF ID>?to=home／shift／notices（許可表の鍵）",
  body.size.width === 2500 && body.size.height === 843 && body.areas.length === 3 && body.areas.reduce((a, x) => a + x.bounds.width, 0) === 2500
  && body.areas.every((x, i) => i === 0 || x.bounds.x === body.areas[i - 1].bounds.x + body.areas[i - 1].bounds.width)
  && body.areas.map((x) => x.action.uri).join() === RICHMENU_AREAS.map((a) => `https://liff.line.me/1234567890-AbCdEfGh?to=${a.to}`).join()
  && RICHMENU_AREAS.every((a) => a.to in LIFF_TO_DEST));
const png = Buffer.from(RICHMENU_PNG_BASE64, "base64");
check("lr(2-2) 画像＝PNG・2500×843・1MB 未満", png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === RICHMENU_IMAGE_SIZE.width && png.readUInt32BE(20) === RICHMENU_IMAGE_SIZE.height && png.length < 1_000_000, { bytes: png.length });

const rt = src("app/api/line/richmenu/route.ts");
check("lr(3-1) route：フラグ false＝404・セッション 401・owner／自店 manager・デモ 403（demoGuardErr）・org の店か",
  rt.includes('if (!mig0201qOn()) return NextResponse.json({ error: "not found" }, { status: 404 });') && rt.includes('if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });')
  && rt.includes('if (authRole === "manager" && storeId !== authStoreId)') && rt.includes("const demo = await demoGuardErr(orgId as string)") && rt.includes("store.org_id !== orgId"));
check("lr(3-2) route：トークンは Vault（getLineSecret）だけ・ID の保存は利用者の client の set_store_line_extra・作った後に保存できなければ消す・トークンをログに出さない",
  rt.includes('await getLineSecret(admin, storeId, "access_token")') && rt.includes('supabase.rpc("set_store_line_extra", { p_store_id: storeId, p_patch: { richmenu_id_default: id } })')
  && rt.includes("if (!(await save(made.id))) { await removeRichMenu(token, made.id);") && !/console\.(log|error)\([^)]*token/.test(rt));
const rs = src("lib/nox/line/richmenu-server.ts");
check("lr(3-3) LINE の呼び方：作る→画像（api-data）→友だち全員の既定・途中で失敗したら消す／外す＝既定を外して消す（404 は済み）／友だち＝プロフィール 200／404",
  rs.includes("`${API}/richmenu`, { method: \"POST\"") && rs.includes("`${DATA}/richmenu/${encodeURIComponent(id)}/content`") && rs.includes("`${API}/user/all/richmenu/${encodeURIComponent(id)}`, { method: \"POST\" }")
  && (rs.match(/method: "DELETE" \}\); return fail/g) ?? []).length === 2 && rs.includes('r.status === 200 ? "friend" : r.status === 404 ? "not_friend" : "unknown"'));

const bd = src("app/api/line/bind/route.ts");
const iV = bd.indexOf("const v = await verifyLineIdTokenEx("), iF = bd.indexOf("if (mig0201qOn() && friendRequiredOf(store.config))"), iB = bd.indexOf('admin.rpc("bind_line"');
check("lr(4-1) 紐付けの route：id_token の確かめの後・bind_line の前に友だちの確かめ（ID がある店だけ・友だちでなければ 403＋追加の URL・わからなければ止めない）",
  iV > 0 && iF > iV && iB > iF && bd.includes('if (fr === "not_friend") return NextResponse.json({ error: "not friend", addUrl: friendAddUrlOf(String(store.config.bot_basic_id)) }, { status: 403 });')
  && bd.includes('const fr = at ? await lineFriendOf(at, v.sub) : "unknown";'));

const br = src("app/liff/[storeId]/liff-bridge.tsx"), lp = src("app/liff/[storeId]/page.tsx");
check("lr(5-1) LIFF：紐付けのときだけ・ID がある店だけ getFriendship（false＝連携に進まず案内・使えなければ route に任せる）・route の 403 も同じ案内・追加の URL と開き直すボタン",
  br.includes("if (bind && botBasicId && liff.getFriendship) {") && br.includes("if (fr && fr.friendFlag === false) { setFriendUrl(friendAddUrlOf(botBasicId));") && br.includes('if (res.status === 403 && j.error === "not friend")')
  && br.includes('data-liff-friend-add="1"') && br.includes('data-liff-friend-retry="1"') && lp.includes("botBasicId={mig0201qOn() && friendRequiredOf(store.config) ? store.config.bot_basic_id ?? null : null}"));

const pn = src("app/(manage)/master/line-config-panel.tsx");
check("lr(6-1) 設定の画面：公式アカウントの ID の欄（フラグ true）・保存で set_store_line_extra（変わったときだけ）・検査は保存の前",
  pn.includes('data-line-field="bot_basic_id"') && pn.includes('supabase.rpc("set_store_line_extra", { p_store_id: storeId, p_patch: { bot_basic_id: botNext } })') && pn.includes("const vb = extraOn ? botBasicIdErrorOf(botId) : null;"));
check("lr(6-2) 設定の画面：LIFF ID かトークンを入れた保存だけ自動で登録（デモは登録しない）・保存のメッセージは先に出す・作り直す／外す・結果は別の行",
  pn.includes('const auto = extraOn && !isDemo && richMenuAutoOf(!!patch && "liff_id" in patch, !!secrets.access_token.trim());')
  && pn.indexOf("setMsg(patch || botChanged") > 0 && pn.indexOf("setMsg(patch || botChanged") < pn.indexOf('if (auto) await richMenu("ensure");')
  && pn.includes('data-line-richmenu-rebuild="1"') && pn.includes('data-line-richmenu-remove="1"') && pn.includes('{rmMsg && <Message kind={rmMsg.ok ? "info" : "error"}>{rmMsg.text}</Message>}'));
// ★2026-11-20 午後（相談役 ③）: ほかのボタンで保存していない通知の種類を戻さない・未保存の印・結果の文は押したボタンの近く
check("lr(6-3) 設定の画面：保存のあとの読み直しは押した節だけ（LINE の設定＝config・作り直す／外す＝cfg・上限＝limit・通知の種類＝notify）・通知の種類を DB の値に戻すのは最初と店の切り替えと通知の保存だけ・未保存の印・結果の文は 3 か所",
  pn.includes('if (part === "all" || part === "notify") setNotify(nf);') && pn.includes('await load("config");') && pn.includes('await load("cfg");') && pn.includes('await load("limit");') && pn.includes('await load("notify");')
  && !/await load\(\);/.test(pn) && pn.includes('data-line-notify-unsaved="1">まだ保存していません</span>') && pn.includes("const notifyDirty = LINE_NOTIFY_KINDS.some((k) => notify[k] !== savedNotify[k]);")
  && ["config", "notify", "limit"].every((w) => pn.includes(`{outAt("${w}")}`)) && !pn.includes('{err && <Message kind="error">{err}</Message>}\n      {msg && <Toast msg={msg} />}\n    </section>'));

if (fails.length) { console.error(`✗ verify:nox-line-richmenu 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-line-richmenu OK (${pass} checks)`);

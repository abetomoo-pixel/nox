/*
 * verify:nox-m5 — 便 M5（2026-10-30・client・DB 0）の本体担当分＝M-37b（/setup を正本の密度に）・M-31（onoff の OFF 選択中＝明るい灰＋黒字）・M-32（select の幅）。
 *  M-37b＝.nox-setup 配下の CSS だけで上書き（本体の部品は触らない）＋見出し＋導入文をカードの外（.nox-setup-head）に＝9 STEP・料金ルールのヘッダーに印（data-setup-rule-head）。
 *  M-41／M-35／M-36／M-33／M-40 は verify:nox-lp／verify:nox-m5c／各 suite の pin。
 *  使い方: npm run verify:nox-m5（env 不要・DB 不触）
 */
import fs from "node:fs";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const css = src("app/globals.css"), wz = src("app/(manage)/setup/setup-wizard.tsx");

// M-31
check("m5(31-1) onoff の OFF 選択中＝明るい灰（#d9d6ce）＋黒字（#17140c）・ON 選択中は青（--primary）のまま・部品 1 か所（CSS）", css.includes('.nox-onoff > button.on[data-v="off"] { background: #d9d6ce; border-color: #d9d6ce; color: #17140c; }') && css.includes('.nox-onoff > button.on[data-v="on"] { background: var(--primary-fill); border-color: var(--primary-fill); color: #fff; }') /* ★M-139: 青塗りは --primary-fill（白文字 AA） */ && !css.includes('[data-v="off"] { background: #5a5750'));
// M-32
check("m5(32-1) select の幅＝max-width 100％＋box-sizing を部品で統一（.nox-dark／.nox-formfield／.nox-setup-wrap）", css.includes(".nox-dark select, .nox-formfield select, .nox-setup-wrap select { max-width: 100%; box-sizing: border-box; }"));
{
  // 同型の一覧＝inline の固定幅（width: <数値>）を持つ select は max-width で収まる（一覧を detail に）
  const walk = (dir: string, out: string[]) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p, out); else if (/\.tsx$/.test(e.name)) out.push(p); } };
  const files: string[] = []; walk("app", files); walk("components", files);
  const fixed: string[] = [];
  for (const f of files) { const s = src(f); const re = /<select[^>]*style=\{\{[^}]*width:\s*(\d+)/g; let m; while ((m = re.exec(s))) fixed.push(`${f}:${m[1]}`); }
  check("m5(32-2) 固定幅の select は 4 本以下（全部 max-width 100％ で収まる＝一覧は detail）", fixed.length <= 4, fixed);
}
// M-37b
check("m5(37b-1) 見出し 24px 白をカードの外＝.nox-setup-head（9 STEP）・本文 15／注記 14／ラベル 13・カード余白 24・入力欄は列いっぱい高さ 44", (wz.match(/<div className="nox-setup-head" data-setup-head="1"><h2>/g) ?? []).length >= 8 && css.includes(".nox-setup-head h2 { margin: 0 0 4px; font-size: 24px; font-weight: 800; color: var(--ink);") && css.includes(".nox-setup-wrap { font-size: 15px; }") && css.includes(".nox-setup-main p { font-size: 14px !important;") && css.includes(".nox-setup-main label > span:first-child { font-size: 13px !important;") && css.includes(".nox-setup-main section.nox-cardtop { padding: 24px !important;") && css.includes("min-height: 44px !important; width: 100% !important; max-width: 100%; box-sizing: border-box; font-size: 15px !important;"));
check("m5(37b-2) 選択状態＝青枠＋「選択中」バッジ（業態カード）・曜日は幅いっぱいのセグメント・料金ルールは番号＋名前＋削除のヘッダー・下段の主ボタンは中央・52px", css.includes('.nox-setup-main button[data-type][aria-pressed="true"] { border: 2px solid var(--blueline, #4f86d9) !important;') && css.includes('.nox-setup-main button[data-type][aria-pressed="true"]::after { content: "選択中";') && css.includes(".nox-setup-main .nox-seg { width: 100% !important; display: flex !important;") && wz.includes('data-setup-rule-head="1"><span className="nox-stpill">{i + 1}</span>') && wz.includes("このルールを削除") && css.includes('.nox-setup-main [data-setup-rule-head="1"] { padding: 12px 16px !important;') && css.includes(".nox-setup-foot .in { justify-content: center; }") && css.includes(".nox-setup-foot button { min-height: 52px !important; font-size: 17px !important;"));
check("m5(37b-3) 本体の部品は触らない＝上書きは .nox-setup-* 配下だけ（theme.ts・seg-select・on-off は不変＝CSS の M-37b 節に .nox-setup 以外のセレクタが無い）", (() => { const at = css.indexOf("★便 M5 M-37b"); const i = css.lastIndexOf("\n", at) + 1; const end = css.indexOf("★便 M5b", at); /* ★便 M5b: 後ろに足した共通部品の節（.nox-unit 等）は M-37b の節に含めない */ const sec = css.slice(i, end > at ? css.lastIndexOf("\n", end) : undefined).split(/\r?\n/).filter((l) => /^\S/.test(l) && !l.startsWith("/*") && !l.startsWith("@media")); return sec.length > 0 && sec.every((l) => l.startsWith(".nox-setup-")); })());
check("m5(37b-4) 旧の見出し（カードの中の h2＋lead）が 9 STEP に残らない・見出し文言 9 は不変", !/<section className="nox-cardtop" style={card}>\n\s*<h2 style={secTitle}>(お店について|席・卓|料金|メニュー|キャスト待遇|スタッフ|シフト・勤怠|会計・レジ|確認)<\/h2>/.test(wz) && ["お店について", "席・卓", "料金", "メニュー", "キャスト待遇", "スタッフ", "シフト・勤怠", "会計・レジ", "確認"].every((h) => wz.includes(`<h2>${h}</h2>`)));

// M-43
{
  const lay = src("app/(manage)/layout.tsx"), ac = src("scripts/verify-nox-actions-center.ts");
  check("m5(43-1) 会計 OFF のスタッフ＝auth_staff_can_register で判定・レジをナビに出さない・/register は /dashboard へ（シフト権限と同じ型）・actions-center に staffRegOffA1 の 1 段", fs.readFileSync("lib/nox/register/register-visibility-server.ts", "utf8").includes('supabase.rpc("auth_staff_can_register")') /* ★M-158／M-159: 判定は 1 本の関数へ */ && lay.includes('...(role !== "staff" || staffRegister ? [{ href: "/register", label: "レジ" }] : [])') && lay.includes('if (!staffRegister && (pathnameReg === "/register" || pathnameReg.startsWith("/register/"))) redirect("/dashboard");') && ac.includes('await enter(page, "staffRegOffA1");') && ac.includes("extraFails.push("));
}
check("m5(37b-5) ?step= の明示は server の下書き（setup_drafts）の step より優先＝直リンク・撮影で STEP が下書きに引きずられない", wz.includes("setS(typeof initialStep === \"number\" && initialStep >= 0 && initialStep <= 9 ? { ...d.S, step: initialStep } : d.S);"));
check("m5(37b-6) 撮影比較の追い込み＝料金ルールのヘッダーは 1 行（nowrap・名前は伸びる・削除は右端）・スタッフ行の権限 seg は 2 列分で縦割れしない・≤430 は業態カード 1 列＋副題の補足を隠す・単位は折り返さない", css.includes('.nox-setup-main [data-setup-rule-head="1"] { flex-wrap: nowrap !important; }') && css.includes(".nox-setup-main [data-staff-row] label:has(> span + .nox-seg) { grid-column: span 2; }") && css.includes(".nox-setup-main div:has(> button[data-type]) { grid-template-columns: 1fr !important; }") && css.includes(".nox-setup-main span:has(> input.num) > em { white-space: nowrap; flex: 0 0 auto; }") && wz.includes('<span className="nox-setup-sub-note">'));
// M-44／M-45／M-46（相談役の追加 1 通・2026-10-30 夕）
{
  const p173 = src("lib/nox/register/p173.ts"), ces = src("lib/nox/register/cast-entry-server.ts"), ml = src("app/mine/layout.tsx"), mp = src("app/mine/page.tsx"), cb = src("app/(manage)/casts/casts-board.tsx"), kpp = src("app/(manage)/master/kiosk-pin-panel.tsx"), fl = src("lib/nox/rules-0175/flag.ts");
  check("m5(44-1) /mine のナビ「レジ」＝店 ON ∧ 自分のスマホ（∨ 端末未登録）∧ 本人の許可 ∧（duty_gate ON なら）出勤中＝castMineRegisterNavOf（純関数）・理由 4 語（store_off／not_allowed／store_device_only／off_duty）", p173.includes("export function castMineRegisterNavOf(") && p173.includes('if (!i.onDuty) return { show: false, reason: "off_duty", note: CAST_MINE_REGISTER_NOTE.off_duty };') && ["店が許可していない", "本人の許可がない", "店の端末からだけ", "出勤中だけ使えます"].every((w) => p173.includes(w)) /* ★裁定472（2026-11-10）: duty_gate に関わらず出勤中だけ */);
  check("m5(44-2) server＝castMineRegisterNavEntryOf＝duty_gate（0190 配下）∧ 当日営業日（biz_cutoff_hm）の自分の打刻の最終が in・layout はナビ・page は理由 1 行（?denied が無いとき）", ces.includes("export async function castMineRegisterNavEntryOf(") && ces.includes("async function castOnDutyOf(") && !ces.includes("sj.duty_gate === true") /* ★裁定472: 打刻ゲートの例外は廃止＝出勤中は castOnDutyOf（入場とナビ） */ && ces.includes('punchStateOf((punches ?? []) as { type: string; punched_at: string }[]).state === "open"') && ml.includes('...(regNav.show ? [{ href: "/register", label: "レジ" }] : [])') && !ml.includes("castRegisterEntryOf(") && mp.includes("{!deniedText && !regNav.show && regNav.note && <PunchPending attr=\"register-note\"><p data-mine-register-note=") /* ★2026-11-13（相談役【3】a）: 打刻の直後は「反映中…」 */);
  check("m5(44-3) 本人の許可の置き場＝既存（マスタ › キャスト待遇 › レジ会計＝set_cast_register）＝キャスト詳細 › アカウントは案内の 1 行だけ（二重の編集口を作らない）", cb.includes('data-cast-register-pointer="1"') && cb.includes('<Link href="/master/cast-comp/register"') && !cb.includes('rpc("set_cast_register"'));
  check("m5(45-1) PIN の 2 系統の名称＝キャスト詳細は「キオスク PIN を設定」・マスタ › システムの一覧は見出し PIN＋2 系統の説明＋キャストの行（0192 cast_pin_status の配下・未適用は案内 1 行・設定はキャスト詳細）", cb.includes("キオスク PIN を設定") && cb.includes("のキオスク PIN</h2>") && !cb.includes("打刻PIN を設定") && kpp.includes('data-pin-two-kinds="1"') && kpp.includes('supabase.rpc("cast_pin_status", { p_store_id: s.id })') && kpp.includes("if (!mig0192On()) { setCastRows(null); return; }") && kpp.includes('data-cast-pin-rows="pending"') && fl.includes("export const MIG_0192_APPLIED = true;") /* ★0192（2026-11-02 手貼り）: false→true＝キャストの行は cast_pin_status から並ぶ（案内 1 行は未適用時の分岐として残る） */);
  check("m5(46-1) PIN ポリシーのロック時間＝既定 10 分（裁定437）＝UI の既定 2 か所・kiosk_login（0190）は店設定 pin_lock_minutes を読み既定 10・staff_punch（0191）の既定 15 は 0192 に同乗", kpp.includes("useState(10); // ★便 M5 M-46") && kpp.includes("setLockMin(asInt(sj.pin_lock_minutes, 10));") && !kpp.includes("asInt(sj.pin_lock_minutes, 15)") && src("supabase/migrations/0190_duty_gate_device_bind.sql").includes("->>'pin_lock_minutes'), '')::int, 10))") && src("supabase/migrations/0191_setup_v5_gaps.sql").includes("->>'pin_lock_minutes'), '')::int, 15))"));
}
// M-47（裁定435 追補・2026-10-30 夕）＝端末の用途の廃止（client は 0192 の配下）
{
  const kd = src("app/(manage)/master/kiosk-device-panel.tsx");
  check("m5(47-1) 端末の用途（打刻／レジ）の廃止＝0192 の配下＝発行欄の用途選択を外し「1 台で 5 タイル」・一覧の列は「タイル＝全タイル」・上限の文言は店舗ごと（false の間は従来）", kd.includes('data-kiosk-no-purpose="1"') && kd.includes('const purposeHead = mig0192On() ? "タイル" : "用途";') && kd.includes('data-kiosk-tiles={mig0192On() ? "all" : d.purpose}') && kd.includes('{mig0192On() ? "店舗ごとに" : "店舗×用途ごとに"}') && kd.includes('options={[["punch", "打刻（タイムレコーダー）"], ["register", "レジ（会計）"]] as const} />'));
}
// M-49（相談役・2026-10-30 夕）＝キオスクの「本人でログイン」＋無操作 N 分で戻す
{
  const pl = src("lib/nox/kiosk/person-login.ts"), plc = src("lib/nox/kiosk/person-login-client.ts"), g = src("components/nox/kiosk-person-guard.tsx"), kp = src("app/kiosk/page.tsx"), lg = src("app/login/page.tsx"), lay = src("app/(manage)/layout.tsx");
  check("m5(49-1) 純関数＝kioskPersonIdleMinutesOf（店設定 kiosk_person_idle_minutes・1〜120・既定 10）・店長以上（owner／admin／manager）・idleExpiredOf", pl.includes("export const KIOSK_PERSON_IDLE_DEFAULT_MIN = 10;") && pl.includes('export const KIOSK_PERSON_ROLES = ["owner", "admin", "manager"] as const;') && pl.includes("return Number.isInteger(n) && n >= 1 && n <= 120 ? n : KIOSK_PERSON_IDLE_DEFAULT_MIN;") && pl.includes("nowMs - lastActiveMs >= minutes * 60_000"));
  check("m5(49-2) 入口＝/kiosk のタイルの下に小さなリンク（5 タイルは不変＝kioskTiles の構成に触らない）→ 端末のセッションを控えて local サインアウト→/login?kiosk=1・/login は店長以上だけ通す（staff／cast は端末へ戻す）", kp.includes('data-kiosk-person-login="1"') && kp.includes("onClick={() => void startKioskPersonLogin(supabase)}") && !kp.includes('"person"') && plc.includes('await supabase.auth.signOut({ scope: "local" });') && plc.includes('window.location.assign("/login?kiosk=1");') && lg.includes("if (fromKiosk && !kioskPersonAllowedOf(role as string | null)) { setError(KIOSK_PERSON_DENY);"));
  check("m5(49-3) 本体画面の guard＝印のあるセッションだけ・無操作 N 分（15 秒ごとに判定・操作で延長）で local サインアウト→端末のセッションを setSession で復元→/kiosk（復元できなければ /login）・帯に「今すぐキオスクへ戻る」・layout は店設定から N を渡す", g.includes("if (!kioskPersonActive()) return;") && g.includes("if (idleExpiredOf(last.current, Date.now(), idleMinutes)) leave();") && g.includes('data-kiosk-person-leave="1"') && plc.includes("const { error } = await supabase.auth.setSession(s); ok = !error;") && plc.includes('window.location.assign(ok ? "/kiosk" : "/login");') && lay.includes("<KioskPersonGuard idleMinutes={Math.min(KIOSK_PERSON_IDLE_MINUTES, kioskPersonIdleMinutesOf(storeRows?.[0]?.settings_json))} role={role as string} name={meName} />") /* ★裁定469（M-128）: 無操作 3 分（店設定が短ければ店設定） */ /* ★便 E（0196 用）: 帯に本人の名前 */);
}
// M-48（相談役・2026-10-30 夕）＝着卓中バッジの 2 段＋省略記号
{
  const sr = src("lib/nox/register/seat-roster.ts"), cp = src("components/nox/cast-picker.tsx"), rb = src("app/(manage)/register/register-board.tsx"), ac = src("scripts/verify-nox-actions-center.ts");
  check("m5(48-1) 着卓中バッジ＝2 段（1 段目 着卓中・2 段目 卓名＝max-width＋省略記号）・title に全文・カードは min-width 0＋max-width 100％（グリッドの 94／78px は不変）・指名カードの印も省略記号＋title", sr.includes("export const servingBadgeOf = (seat: string | null | undefined): { top: string; seat: string | null; title: string } =>") && cp.includes('data-serving-badge={id} title={b.title}') && cp.includes('data-serving-seat="1" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}') && cp.includes('minWidth: 0, maxWidth: "100%", boxSizing: "border-box",') && !cp.includes("data-serving-badge={c.id}>{servingLabelOf(") && rb.includes('data-nom-serving={ca.id} title={servingMarkOf(servingSeat.get(ca.id)) ?? undefined}') && css.includes(".nox-castgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(94px, 1fr)); gap: 8px; }"));
  check("m5(48-2) actions-center に卓名 8 文字（テーブル10番席）のケース 1 段＝1,280／390 でバッジがカード幅に収まる・2 段・title 全文・終わりに伝票 2 と卓 2 を必ず消す", ac.includes("'テーブル10番席'") && ac.includes("rb.right <= rc.right + 0.5 && rb.left >= rc.left - 0.5") && ac.includes('r.title !== "着卓中（テーブル10番席）"') && ac.includes("M-48 cleanup checks"));
}
// M-42
{
  const rt = src("app/api/kiosk/photos/route.ts"), kp = src("app/kiosk/page.tsx"), kr = "" /* ★裁定469（M-128・2026-11-09）: 包みは廃止 */;
  check("m5(42-1) キオスクの写真＝route /api/kiosk/photos（端末を kiosk_devices で確かめ・admin が本体と同じ signCastPhotos／signUserPhotos で署名・実体は返さない・no-store）", rt.includes('.eq("auth_user_id", user.id).eq("is_active", true).maybeSingle()') && rt.includes("signCastPhotos(admin, orgId,") && rt.includes("signUserPhotos(admin, orgId,") && rt.includes('"cache-control": "private, no-store"') && rt.includes('return NextResponse.json({ error: "forbidden" }, { status: 403 })'));
  check("m5(42-2) /kiosk（キャスト・スタッフ）と /kiosk-register（操作担当）のタイルに本体と同じ部品 CastAvatar（url＝route の署名 URL・失敗は頭文字）", kp.includes('fetch("/api/kiosk/photos")') && kp.includes("<CastAvatar name={c.cast_name} url={photoUrls.casts[c.cast_id]} size={44} variant=\"flat\" />") && kp.includes("<CastAvatar name={m.user_name} url={photoUrls.operators[m.membership_id]} size={44} variant=\"flat\" />") && kr === "" /* ★裁定469（M-128・2026-11-09）: 操作担当を選ぶ画面は廃止（PIN だけ） */);
}

if (fails.length) { console.error(`verify:nox-m5 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-m5 OK ${pass} checks（便 M5＝M-37b 密度・M-31 onoff・M-32 select）`);

// verify:nox-invite-mail（★0211・相談役 11/25 の便 D1＝起票157 の続き）— スタッフの招待のメール・出し直し・取り消し・初回のパスワード変更・ログインの道
//   (1) 純関数＝送るかどうか（鍵なし skipped・本番でない・デモ・テスト用ドメイン）・件名に店名なし・本文に店名と署名と返信の文・結果の 1 行
//   (2) 送る部品＝fetch を差し替え（鍵なしは呼ばない・200 sent・429→やり直し・5xx 2 回 failed・400 はやり直さない・通信の失敗→やり直し・打ち切り）
//   (3) 初回のパスワード変更の純関数（印・止める道と止めない道・戻る先・新しいパスワードの確かめ）
//   (4) 配線（route・印を付ける所は初期パスワードを作る／出し直す所だけ・middleware・本人の変更は監査に残さない・初期設定の文・0215 は旗の後ろ）
//   (5) ログインの道＝5 つの役（オーナー・店長・スタッフ・キャスト・端末）と運営者が今までどおり（パスワードで入れる・印は付いていない＝止められない）＝読むだけ
//   (6) DB（本番・1 トランザクション・ROLLBACK）＝出し直し・1 日 5 回（link と mail を合わせて）・取り消し（2 回目は何もせず成功）・メールの結果の監査・anon は BLOCKED
import fs from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { pgTx } from "./fixtures-pgtx";
import { inviteMailDecisionOf, inviteMailOf, inviteMailResultLineOf, INVITE_MAIL_SUBJECT, INVITE_EXPIRED_SHOWN_DAYS } from "../lib/nox/people/invite-mail";
import { sendNoxMail, MAIL_FROM, MAIL_REPLY_TO } from "../lib/nox/mail/send";
import { mustChangePasswordOf, mustChangeRedirectOf, mustChangeNextOf, newPasswordErrOf, MUST_CHANGE_PATH } from "../lib/nox/auth/must-change";
import { MIG_0211_APPLIED, MIG_0215_APPLIED } from "../lib/nox/rules-0175/flag";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else { fails.push(label); console.error(`NG ${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");

async function main() {
  // (1)
  const base = { hasKey: true, vercelEnv: "production", isDemo: false, email: "taro@gmail.com" };
  check("(1-1) 送る＝鍵あり・本番・デモでない・普通の宛先", inviteMailDecisionOf(base).send === true);
  check("(1-2) 送らない理由＝鍵なし no_key・本番でない not_production・デモ demo・テスト用 test_domain",
    JSON.stringify([inviteMailDecisionOf({ ...base, hasKey: false }), inviteMailDecisionOf({ ...base, vercelEnv: "preview" }), inviteMailDecisionOf({ ...base, isDemo: true }), inviteMailDecisionOf({ ...base, email: "x@example.com" }), inviteMailDecisionOf({ ...base, email: "s-1@o-1.nox.local" })])
      === JSON.stringify([{ send: false, reason: "no_key" }, { send: false, reason: "not_production" }, { send: false, reason: "demo" }, { send: false, reason: "test_domain" }, { send: false, reason: "test_domain" }]));
  const m = inviteMailOf({ name: "山田 太郎", storeName: "CLUB 見本", url: "https://noxapp.jp/i/abc", expiresAt: "2026-12-09T03:00:00Z" });
  check("(1-3) 件名に店名は入れない・本文に店名・名前・リンク・期限・署名・返信の文", m.subject === INVITE_MAIL_SUBJECT && !m.subject.includes("CLUB 見本") && m.text.includes("山田 太郎 様") && m.text.includes("CLUB 見本から、NOX への招待") && m.text.includes("https://noxapp.jp/i/abc") && m.text.includes("12/9 まで使えます") && m.text.includes("NOX（株式会社レクソル）") && m.text.endsWith("返信すると NOX のサポートに届きます（お店には届きません）"));
  check("(1-4) 名前が空なら宛名なし・店名が読めなければ「お店から、」", !inviteMailOf({ name: "", storeName: null, url: "u", expiresAt: null }).text.includes("様") && inviteMailOf({ name: "", storeName: null, url: "u", expiresAt: null }).text.startsWith("お店から、"));
  check("(1-5) 結果の 1 行＝送った・送れなかった・送っていない", inviteMailResultLineOf({ status: "sent" }, { name: "太郎", email: "t@x.jp" })?.kind === "success" && inviteMailResultLineOf({ status: "failed" }, { name: "", email: "" })?.kind === "error" && /送っていません/.test(inviteMailResultLineOf({ status: "skipped", reason: "no_key" }, { name: "", email: "" })?.text ?? "") && inviteMailResultLineOf(null, { name: "", email: "" }) === null);
  check("(1-6) 一覧に出す期限切れは 30 日まで", INVITE_EXPIRED_SHOWN_DAYS === 30);

  // (2)
  const mk = (seq: (number | "throw" | "abort")[]) => { const calls: { body: string; headers: Record<string, string> }[] = []; let i = 0; return { calls, fetch: async (_u: string, init: RequestInit) => { calls.push({ body: String(init.body), headers: init.headers as Record<string, string> }); const s = seq[i++]; if (s === "throw") throw new TypeError("fetch failed"); if (s === "abort") { const e = new Error("aborted"); e.name = "AbortError"; throw e; } return { ok: s >= 200 && s < 300, status: s, headers: { get: () => null } }; } }; };
  const sleep = async () => undefined;
  const mail = { to: "t@x.jp", subject: "s", text: "t", idemKey: "k1" };
  { const f = mk([200]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: null, sleep }); check("(2-1) 鍵が無ければ送らない（skipped no_key・fetch を呼ばない）", r.status === "skipped" && r.reason === "no_key" && f.calls.length === 0); }
  { const f = mk([200]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: "k", sleep }); const b = JSON.parse(f.calls[0].body); check("(2-2) 200＝sent・送り手と reply-to・冪等キー", r.status === "sent" && b.from === MAIL_FROM && b.reply_to === MAIL_REPLY_TO && MAIL_REPLY_TO === "support@noxapp.jp" && f.calls[0].headers["Idempotency-Key"] === "k1"); }
  { const f = mk([429, 200]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: "k", sleep }); check("(2-3) 429→1 回やり直して 200＝sent", r.status === "sent" && f.calls.length === 2); }
  { const f = mk([500, 503]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: "k", sleep }); check("(2-4) 5xx が 2 回＝failed（やり直しは 1 回だけ）", r.status === "failed" && r.reason === "http_503" && f.calls.length === 2); }
  { const f = mk([400]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: "k", sleep }); check("(2-5) 400 はやり直さない＝failed", r.status === "failed" && f.calls.length === 1); }
  { const f = mk(["throw", 200]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: "k", sleep }); check("(2-6) 通信の失敗→やり直して 200＝sent", r.status === "sent" && f.calls.length === 2); }
  { const f = mk(["abort"]); const r = await sendNoxMail(mail, { fetch: f.fetch, key: "k", sleep }); check("(2-7) 打ち切り＝failed timeout（やり直さない）", r.status === "failed" && r.reason === "timeout" && f.calls.length === 1); }
  check("(2-8) 送る部品のログに宛先・本文を出さない（console に出すのは理由の語だけ）", !/console\.(log|error)\([^)]*\b(m\.to|m\.text|body)\b/.test(src("lib/nox/mail/send.ts")) && !/RESEND_API_KEY\s*=\s*["']/.test(src("lib/nox/mail/send.ts")));

  // (3)
  check("(3-1) 印は app_metadata.must_change_password が true のときだけ", mustChangePasswordOf({ app_metadata: { must_change_password: true } }) && !mustChangePasswordOf({ app_metadata: { must_change_password: "true" } }) && !mustChangePasswordOf({ app_metadata: {} }) && !mustChangePasswordOf(null));
  const flagged = { app_metadata: { must_change_password: true } };
  check("(3-2) 印のある人の画面の道はパスワードの変更へ（元の行き先を next に）", mustChangeRedirectOf(flagged, "/dashboard", "") === `${MUST_CHANGE_PATH}?next=%2Fdashboard` && mustChangeRedirectOf(flagged, "/mine", "?x=1") === `${MUST_CHANGE_PATH}?next=%2Fmine%3Fx%3D1`);
  check("(3-3) 止めない道＝API・認証（変更の画面そのもの）・ログイン・デモ・公開面・端末・運営・トップ", ["/api/me/password", "/auth/change-password", "/auth/signout", "/login", "/demo", "/i/abc", "/r/x", "/kiosk", "/ops/orgs", "/lp", "/"].every((p) => mustChangeRedirectOf(flagged, p, "") === null));
  check("(3-4) 印の無い人は止めない（今いる人は何も変わらない）", ["/dashboard", "/mine", "/staff", "/master"].every((p) => mustChangeRedirectOf({ app_metadata: { provider: "email" } }, p, "") === null));
  check("(3-5) 戻る先は同じサイトの画面だけ", mustChangeNextOf("/mine") === "/mine" && mustChangeNextOf("//evil.example") === "/dashboard" && mustChangeNextOf("https://x") === "/dashboard" && mustChangeNextOf("/api/x") === "/dashboard" && mustChangeNextOf(null) === "/dashboard");
  check("(3-6) 新しいパスワードの確かめ（8〜72 字・2 回同じ・今と違う）", newPasswordErrOf("", "abcdefgh", "abcdefgh") !== null && newPasswordErrOf("old", "short", "short") !== null && newPasswordErrOf("old", "abcdefgh", "abcdefgX") !== null && newPasswordErrOf("abcdefgh", "abcdefgh", "abcdefgh") !== null && newPasswordErrOf("old", "abcdefgh", "abcdefgh") === null);

  // (4)
  const inv = src("app/api/staff/invite/route.ts"), re = src("app/api/staff/invite/reissue/route.ts"), mw = src("lib/supabase/middleware.ts"), me = src("app/api/me/password/route.ts");
  check("(4-1) 発行＝RPC の後にメール（送れなくても url を返す）・リンクは site の値", inv.indexOf('supabase.rpc("staff_invite_create"') < inv.indexOf("await sendInviteMail(") && inv.includes("return NextResponse.json({ id: r.id, url, expires_at: r.expires_at ?? null, email, name, role, mail });") && inv.includes("siteOriginOf("));
  check("(4-2) 出し直し＝RPC staff_invite_reissue・mail のときだけ送る・too many は 429・デモは 403", re.includes('supabase.rpc("staff_invite_reissue", { p_invite_id: inviteId, p_mode: mode })') && re.includes('if (mode === "mail") {') && re.includes("/too many/.test(error.message) ? 429") && re.includes("demoGuardErr("));
  check("(4-3) 結果の監査＝staff_invite_mail_note（本人のセッション）", src("lib/nox/people/invite-mail-server.ts").includes('userClient.rpc("staff_invite_mail_note"'));
  const setFlag = ["app/api/staff/create/route.ts", "app/api/cast/invite/route.ts", "app/api/staff/password-reissue/route.ts"].map(src);
  const allSrc = (() => { const out: string[] = []; const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) out.push(p); } }; walk("app"); walk("lib"); return out; })();
  const setters = allSrc.filter((p) => /MUST_CHANGE_META/.test(src(p)) && !p.endsWith("must-change.ts"));
  check("(4-4) 印を付けるのは初期パスワードを作る・出し直す所だけ（スタッフの登録・キャストの登録と再発行・店の出し直し）＝今いる人に付け直す道は無い", setFlag.every((s) => s.includes("MUST_CHANGE_META")) && setters.sort().join(",") === ["app/api/cast/invite/route.ts", "app/api/staff/create/route.ts", "app/api/staff/password-reissue/route.ts"].join(","), setters);
  check("(4-5) middleware は印のある人だけ止める（mustChangeRedirectOf）", mw.includes("const mustTo = user ? mustChangeRedirectOf(user, path, request.nextUrl.search) : null;"));
  check("(4-6) 本人の変更＝今のパスワードで確かめる・ほかのセッションを切らない（local）・印を外す・DB の監査は書かない", me.includes("probe.auth.signInWithPassword({ email: user.email, password: current })") && me.includes('signOut({ scope: "local" })') && me.includes("app_metadata: MUST_CHANGE_CLEAR") && !/audit_log|_note"/.test(me) && (me.match(/\.rpc\(/g) ?? []).length === 1 /* 読むのは auth_org_id だけ */);
  check("(4-7) メール無しの人も自分で変えられる（プロフィールから /auth/change-password）", src("app/(manage)/staff/me/profile/page.tsx").includes('href="/auth/change-password"') && fs.existsSync("app/auth/change-password/page.tsx"));
  const wiz = src("app/(manage)/setup/setup-wizard.tsx");
  check("(4-8) 初期設定の文＝送っていない「招待メール」「招待済み」「招待に失敗」を言わない", !/招待メール|招待済み|招待に失敗/.test(wiz));
  check("(4-9) 旗：0211 は true・0215（店の初期パスワードの出し直し＝監査の関数）は false の後ろ", (MIG_0211_APPLIED as boolean) === true && (MIG_0215_APPLIED as boolean) === false && src("app/api/staff/password-reissue/route.ts").includes("if (!mig0215On())") && src("app/(manage)/staff/staff-board.tsx").includes("{mig0215On() && !isDemo && sel.role === \"staff\""));

  // (5) ログインの道（読むだけ）
  const anonOf = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const roles: [string, string][] = [["オーナー", "nox-verify-owner-a@example.com"], ["店長", "nox-verify-manager-a1@example.com"], ["スタッフ", "nox-verify-staff-a1@example.com"], ["キャスト", "nox-verify-cast-a1a@example.com"]];
  for (const [label, email] of roles) {
    const c = anonOf();
    const { data, error } = await c.auth.signInWithPassword({ email, password: env.SEED_PASSWORD });
    const u = data?.user ?? null;
    check(`(5) ${label}：パスワードで入れる・印は無い・画面の道で止められない`, !error && !!u && !mustChangePasswordOf(u) && ["/dashboard", "/mine", "/staff"].every((p) => mustChangeRedirectOf(u, p, "") === null), error?.message);
    await c.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-invite-mail" });
  await db.connect();
  try {
    const dev = (await db.query("select d.auth_user_id from public.kiosk_devices d join public.stores s on s.id = d.store_id where d.is_active order by (s.name like 'NOX-VERIFY%') desc, s.name limit 1")).rows[0] as { auth_user_id: string } | undefined;
    const du = dev ? (await admin.auth.admin.getUserById(dev.auth_user_id)).data.user : null;
    check("(5) 端末：端末のアカウント（有効な端末・NOX-VERIFY に無ければデモの店）に印は無い・端末の道（/kiosk）は止めない", !!du && !mustChangePasswordOf(du) && mustChangeRedirectOf({ app_metadata: { must_change_password: true } }, "/kiosk", "") === null, dev ? "" : "有効な端末が無い");
    const ops = (await db.query("select auth_user_id from public.ops_operators where is_active")).rows as { auth_user_id: string }[];
    let opsOk = ops.length > 0;
    for (const o of ops) { const u = (await admin.auth.admin.getUserById(o.auth_user_id)).data.user; if (!u || mustChangePasswordOf(u)) opsOk = false; }
    check("(5) 運営者：印は無い・運営の道（/ops）は止めない", opsOk && mustChangeRedirectOf({ app_metadata: { must_change_password: true } }, "/ops/login", "") === null);

    // (6) DB（1 トランザクション・ROLLBACK）
    const tx = pgTx(db);
    await db.query("begin");
    try {
      const uid = async (email: string) => ({ auth_user_id: (await tx.one<{ a: string }>("select auth_user_id a from users where email = $1", [email])).a });
      const owner = await uid("nox-verify-owner-a@example.com"), mgrA1 = await uid("nox-verify-manager-a1@example.com"), mgrB1 = await uid("nox-verify-manager-b1@example.com");
      const A1 = await tx.one<{ id: string }>("select id from stores where name = 'NOX-VERIFY-A1'");
      const mkI = await tx.as(owner, "select public.staff_invite_create($1, 'nox-verify-invite-mail-a@example.com', 'NOX-VERIFY 招待', 'staff', '{}'::jsonb) j", [A1.id]);
      const iid = mkI.ok ? String((mkI.rows[0].j as { id: string }).id) : "";
      const reis: boolean[] = [];
      for (const mode of ["link", "mail", "link", "mail", "link"]) { const r = await tx.as(mode === "mail" ? mgrA1 : owner, "select public.staff_invite_reissue($1, $2) j", [iid, mode]); reis.push(r.ok); }
      const r6 = await tx.as(owner, "select public.staff_invite_reissue($1, 'link') j", [iid]);
      check("(6-1) 出し直し（link と mail を合わせて）5 回まで・6 回目は too many", mkI.ok && reis.every(Boolean) && !r6.ok && /too many/.test(r6.err), [tx.errOf(mkI), reis, tx.errOf(r6)]);
      const fB = await tx.as(mgrB1, "select public.staff_invite_reissue($1, 'link') j", [iid]);
      const fA = await tx.as("anon", "select public.staff_invite_reissue($1, 'link') j", [iid]);
      const fN = await tx.as("anon", "select public.staff_invite_mail_note($1, 'create', 'sent', null)", [iid]);
      check("(6-2) 他社の店長は断る・anon は出し直しもメールの結果も BLOCKED", !fB.ok && !fA.ok && /permission denied for function/.test(fA.err) && !fN.ok && /permission denied for function/.test(fN.err), [tx.errOf(fB), tx.errOf(fA), tx.errOf(fN)]);
      const n1 = await tx.as(owner, "select public.staff_invite_mail_note($1, 'reissue', 'skipped', 'no_key')", [iid]);
      check("(6-3) メールの結果（skipped no_key）を監査に 1 行", n1.ok && (await tx.one<{ n: number }>("select count(*)::int n from audit_logs where action = 'staff_invite_mail' and target = $1 and after_json->>'reason' = 'no_key'", [`staff_invites:${iid}`])).n === 1, tx.errOf(n1));
      const v1 = await tx.as(owner, "select public.staff_invite_revoke($1) r", [iid]);
      const v2 = await tx.as(owner, "select public.staff_invite_revoke($1) r", [iid]);
      const rr = await tx.as(owner, "select public.staff_invite_reissue($1, 'link') j", [iid]);
      check("(6-4) 取り消し＝2 回目は何もせず成功・取り消した招待は出し直せない（revoked か too many）", v1.ok && v2.ok && !rr.ok && /revoked|too many/.test(rr.err), [tx.errOf(v1), tx.errOf(v2), tx.errOf(rr)]);
    } finally { await db.query("rollback").catch(() => undefined); }
  } finally { await db.end(); }

  if (fails.length) { console.error(`verify:nox-invite-mail FAIL ${fails.length}（OK ${pass}）`); process.exit(1); }
  console.log(`verify:nox-invite-mail OK (${pass} checks)`);
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * verify:nox-b5 — client 便（2026-11-12 夕・画面だけ・DDL なし）。DB は触らない（source と純関数だけ）。
 *  (1) ■K-2a /auth/set-password＝開いただけで token_hash を使わない（「続ける」で verifyOtp）・流れごとの文言・英語のエラーを出さない
 *  (2) ■K-2b 初期設定の保存先の無い 3 切替を出さない・「後で（マスタから）・0191」を出さない・フラグの false 側の注記の撤去
 *  (3) 裁定491 使わない設定の機能は枠ごと出さない（出勤ボーナス・ノルマの出勤日数・売掛／送りの注記・給与一覧の列）＋反転
 *  (4) 裁定492 給与を見せない店は報酬の額を送らない（勤怠の金額・月のまとめ・保証時給・出勤ボーナスの額）＋反転・見出しを折り返さない
 *  (5) ■K-3 NOX の Stripe の customer の metadata に tenant_id を入れない（service と org_id だけ）
 *  (6) ■N-5／6 自分の情報を編集の注記は役割ごと（「オーナー」は「管理者」）・ナビはどれも選ばない
 */
import fs from "node:fs";
import path from "node:path";
import { SET_PASSWORD_COPY, setPasswordErrJa, setPasswordFlowOf } from "../lib/nox/auth/set-password-copy";
import { mineVisibilityOf, slipFootNoteOf, stripKintaiPay } from "../lib/nox/mine/visibility";
import { noxMetadataOf } from "../lib/billing/nox-stripe";
import { activeHrefOf, isNoActivePath } from "../lib/nox/ui/nav-tabs";
import { SELF_PROFILE_STORE_ONLY_NOTE, selfProfileStoreOnlyNoteOf } from "../lib/nox/people/self-profile";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1) set-password
{
  const sp = src("app/auth/set-password/page.tsx");
  const effect = sp.slice(sp.indexOf("useEffect(() => {"), sp.indexOf("async function proceed()"));
  check("b5(1-1) 読み込み時は token_hash を覚えて「続ける」を出すだけ（useEffect の中に verifyOtp が無い）・押したときに verifyOtp",
    effect.includes('if (q.get("token_hash")) { setTokenHash(q.get("token_hash")); setPhase("confirm"); return; }') && !effect.includes("verifyOtp(")
    && sp.includes("const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpTypeOf(flow) });") && sp.includes('data-set-password-continue="1"') && sp.includes("onClick={() => void proceed()}"));
  check("b5(1-2) type→流れ（recovery／invite／email・signup／magiclink・不明は招待）",
    J(["recovery", "invite", "email", "signup", "magiclink", null, "x"].map(setPasswordFlowOf)) === J(["recovery", "invite", "email", "email", "magiclink", "invite", "invite"]));
  const copies = Object.values(SET_PASSWORD_COPY);
  check("b5(1-3) 流れごとに見出しと失敗の文が別・英字なし（NOX を除く）",
    new Set(copies.map((c) => c.title)).size === 4 && new Set(copies.map((c) => c.fail)).size === 4
    && copies.every((c) => !/[A-Za-z]/.test(Object.values(c).join("").replace(/NOX/g, ""))));
  check("b5(1-4) 保存の失敗は和文（英語の error は置き換える・和文はそのまま）",
    !/[A-Za-z]/.test(setPasswordErrJa(500, "Password should be at least 6 characters")) && !/[A-Za-z]/.test(setPasswordErrJa(401, "unauthorized")) && !/[A-Za-z]/.test(setPasswordErrJa(403, "forbidden (demo)"))
    && setPasswordErrJa(400, "パスワードが一致しません") === "パスワードが一致しません" && sp.includes("setErr(setPasswordErrJa(res.status, j.error))") && !sp.includes("setErr((e as Error).message)"));
}
// (2) 初期設定
{
  const wz = src("app/(manage)/setup/setup-wizard.tsx");
  check("b5(2-1) 初期設定に保存先の無い 3 切替（ノルマの進捗・遅刻・当欠の連絡・出勤ボーナス）が無い・「後で」に 0191 が無い",
    !wz.includes('<Opt title="ノルマの進捗"') && !wz.includes('<Opt title="遅刻・当欠の連絡"') && !wz.includes('<Opt title="出勤ボーナス" sub={<>その日に出た人') && !/later\("[^"]*0191/.test(wz)
    && !wz.includes('later("店の割合")') && !wz.includes('later("店の既定")') && !wz.includes('later("%の個別")') && wz.includes('later("段の写像は待遇プランで")'));
  check("b5(2-2) フラグの false 側の画面の注記を撤去（端末の再発行・在庫の切替の RPC 不在・定休日の 0183）",
    !src("app/(manage)/master/kiosk-device-panel.tsx").includes("data-kiosk-inactive-ops") && !src("app/(manage)/master/products/products-board.tsx").includes("0166 適用後")
    && !src("components/nox/no-shift-confirm.tsx").includes("0183"));
}
// (3)(4) /mine の出し分け
{
  const off = mineVisibilityOf({ sys_bonus: false, sys_norms: false, okuri_mode: "none" }, "off");
  const on = mineVisibilityOf({ ar_enabled: true, okuri_mode: "flat" }, "detail");
  check("b5(3-1) 491: OFF の店＝出勤ボーナスの枠・ノルマの出勤日数・売掛・送りの注記を出さない／ON（キー無し＝ON）の店は出す（反転）",
    !off.bonusCard && !off.normDays && !off.arNote && !off.okuriNote && on.bonusCard && on.normDays && on.arNote && on.okuriNote && mineVisibilityOf(null, "detail").bonusCard);
  check("b5(3-2) 明細の注記＝使う制度の名前だけ",
    slipFootNoteOf(on) === "※確定後の明細です。売掛・前借り・送りの未収残は店にご確認ください。" && slipFootNoteOf(off) === "※確定後の明細です。前借りの未収残は店にご確認ください。");
  check("b5(4-1) 492: 表示しない（既定・キー無し）は payHidden・net_only／detail は出す（反転）",
    mineVisibilityOf({}, undefined).payHidden && off.payHidden && !on.payHidden && !mineVisibilityOf({}, "net_only").payHidden);
  const rows = stripKintaiPay([{ bizDate: "2026-11-01", pay: { total: 21583 } }, { bizDate: "2026-11-02" }] as { bizDate: string; pay?: { total: number } }[]);
  check("b5(4-2) 492: 勤怠の行から金額を外す（キーごと無い＝client 部品の withPay が false）", rows.every((r) => !("pay" in r)) && !J(rows).includes("21583"));
  const pg = src("app/mine/page.tsx");
  check("b5(4-3) /mine の配線＝金額を外してから渡す・月のまとめ null・保証時給の印と契約の要約・出勤ボーナスの額・枠は sys_bonus・ノルマの出勤日数・明細の注記",
    pg.includes("vis.payHidden ? stripKintaiPay(kintaiBuilt.casts[0].rows) : kintaiBuilt.casts[0].rows") && pg.includes("const kintaiPay = vis.payHidden ? null :")
    && pg.includes("{guaLabel && !vis.payHidden && (") && pg.includes("guaranteeLabel: vis.payHidden ? null : guaLabel") && pg.includes("{vis.bonusCard && (") && pg.includes('data-mine-bonus="1"')
    && pg.includes("vis.payHidden ? <>定額</>") && pg.includes("const pDays = vis.normDays && meId && sId ? daysNormTargetsOf(") /* ★■7（2026-11-13 夜）: 読取を先に投げる形（同じクエリ・同じ条件） */ && pg.includes("const daysTargets = pDays ? await pDays :") && pg.includes("{vis.normDays && <p") && pg.includes(": slipFootNoteOf(vis)}"));
  const pb = src("app/(manage)/payroll/payroll-board.tsx");
  check("b5(3-3) 給与一覧の「売掛」「送り」の列＝設定に従う（値の残る行があれば出す）",
    pb.includes("const arColOn = storeSettings.ar_enabled === true ||") && pb.includes('const okuriColOn = okuriModeOf(storeSettings) !== "none" ||')
    && pb.includes("{arColOn && <th") && pb.includes("{okuriColOn && <th") && pb.includes("{arColOn && dedCell(r.arDeductTotal") && pb.includes("{okuriColOn && dedCell(r.okuriDeductTotal"));
  check("b5(4-4) 勤怠の表の見出しは折り返さない（本文の .opt は折り返す）", src("app/globals.css").includes(".nox-kintai-table thead th.opt { white-space: nowrap; }"));
}
// (5) tenant_id
{
  const walk = (d: string): string[] => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : [])) : [];
  const files = [...walk("app/api/billing"), ...walk("app/api/stripe"), ...walk("lib/billing")];
  const hits = files.filter((f) => /tenant_id/.test(src(f).replace(/\/\/.*$/gm, "")));
  check("b5(5-1) ■K-3 NOX の Stripe の作成物の metadata は service と org_id だけ（tenant_id を入れない＝BANZEN の印と混ざらない）",
    files.length > 0 && hits.length === 0 && J(Object.keys(noxMetadataOf("o1")).sort()) === J(["org_id", "service"]), hits);
}
// (6) ■N
{
  const items = [{ href: "/staff", label: "スタッフ" }, { href: "/staff/me", label: "勤怠" }, { href: "/dashboard", label: "ホーム" }] as Parameters<typeof activeHrefOf>[1];
  check("b5(6-1) ■N-6 自分の情報を編集はどのナビも選ばない（/staff と /staff/me は従来どおり）",
    isNoActivePath("/staff/me/profile") && activeHrefOf("/staff/me/profile", items) === "" && activeHrefOf("/staff", items) === "/staff" && activeHrefOf("/staff/me", items) === "/staff/me"
    && src("components/ui/side-nav.tsx").includes('const active = isNoActivePath(path) ? "" :'));
  const o = selfProfileStoreOnlyNoteOf("owner"), m = selfProfileStoreOnlyNoteOf("manager"), s = selfProfileStoreOnlyNoteOf("staff");
  check("b5(6-2) ■N-5 注記は役割ごと＝「オーナー」なし・管理者と店長には「店長にお伝えください」を出さない",
    ![o, m, s, SELF_PROFILE_STORE_ONLY_NOTE].some((x) => x.includes("オーナー")) && !o.includes("店長にお伝え") && !m.includes("店長にお伝え") && s.includes("店長にお伝え")
    && src("app/(manage)/staff/me/profile/page.tsx").includes("{selfProfileStoreOnlyNoteOf(role)}"));
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b5 ALL PASS (${pass} assertions)`);

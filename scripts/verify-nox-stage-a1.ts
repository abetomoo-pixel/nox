/*
 * verify:nox-stage-a1 — 相談役 11/26 22:10 夜便 N 改・段ア（画面だけの直し）の係留（純関数＋逐語 grep・DB 不触・env 不要）。
 *  a(1) 起票175・342（裁定511-3）: 店の端末の画面に端末ごとのログアウトを出さない（/kiosk の右上の「端末ログアウト」を消した）・
 *       本人（PIN）の間の「自分の情報」はログアウトの代わりに「キオスクへ戻る」の案内（UserChip kioskPerson）
 *  a(2) 起票60: 会計前の伝票がある席の「有効」を外す保存を席の窓で止める（赤い理由＝Message）・set_seat の引数は不変
 *  a(3) 起票281: 管理者（role owner）にした人をオーナーが見る一覧に残す（在籍中・自分以外）・管理者の行は関数が受けない欄を出さない
 *  a(4) 起票65: 「時給・最低保証」OFF の店でも描かれている最初の節で新しいプランを作れる（お金の式・set_comp_plan の引数は不変）
 *  （起票211 は直していない＝/api/print/jobs の答える相手を広げる＝権限の変更）
 */
import fs from "node:fs";
import { KIOSK_DEVICE_LOGOUT_ON_SCREEN, KIOSK_HIDDEN } from "../lib/nox/rules-0175/kiosk";
import { KIOSK_PERSON_LEAVE, KIOSK_PERSON_NO_LOGOUT_NOTE } from "../lib/nox/kiosk/person-session";
import { seatDeactivateBlockOf } from "../lib/nox/seat-open-guard";
import { staffListOwnerRowKeptOf, staffListOwnerRowsShownOf, staffListRolesOf } from "../lib/nox/rules-0175/roles";
import { planCreateGuideOf, planCreateSectionOf, planSaveFirstOf } from "../lib/nox/plan-create-section";
import { messageKindOf } from "../components/ui/toast";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const src = (p: string) => fs.readFileSync(p, "utf8");

// a(1)
{
  const kp = src("app/kiosk/page.tsx"), hc = src("components/ui/header-chips.tsx"), lay = src("app/(manage)/layout.tsx");
  check("a(1-1) KIOSK_HIDDEN の logout を読む＝店の端末の画面に端末ごとのログアウトは出さない", (KIOSK_HIDDEN as readonly string[]).includes("logout") && KIOSK_DEVICE_LOGOUT_ON_SCREEN === false);
  check("a(1-2) /kiosk に「端末ログアウト」のボタンが無い（denied の「ログアウト」＝端末でないアカウントの出口は残す）",
    !kp.includes(">\n        端末ログアウト\n") && !/>\s*端末ログアウト\s*</.test(kp) && !kp.includes("const clock = (") && kp.includes('<button onClick={async () => { await supabase.auth.signOut(); setPhase("login"); }}'));
  check("a(1-3) UserChip: kioskPerson のときはログアウトの form を出さず案内 1 行（帯の「キオスクへ戻る」）・layout は kioskPerson={kioskPersonOn}",
    hc.includes("kioskPerson = false }: {") && hc.includes('{kioskPerson ? (<p data-kiosk-person-no-logout="1"') && hc.includes('<form action="/auth/signout" method="post"') && lay.includes("kioskPerson={kioskPersonOn} isDemo={isDemo} />")
    && KIOSK_PERSON_NO_LOGOUT_NOTE.includes(`「${KIOSK_PERSON_LEAVE}」`));
}

// a(2)
{
  const sb = src("app/(manage)/master/seats/seats-board.tsx");
  const m = seatDeactivateBlockOf({ seatId: "s1", nextActive: false, openChecks: 2 });
  check("a(2-1) seatDeactivateBlockOf: 外す保存で会計前の伝票 1 件以上＝理由（件数入り・赤＝error）／有効のまま・新規・0 件＝止めない",
    !!m && m.includes("2 件") && messageKindOf(m) === "error" && seatDeactivateBlockOf({ seatId: "s1", nextActive: true, openChecks: 3 }) === null
    && seatDeactivateBlockOf({ seatId: null, nextActive: false, openChecks: 3 }) === null && seatDeactivateBlockOf({ seatId: "s1", nextActive: false, openChecks: 0 }) === null, m ?? "null");
  check("a(2-2) 席の窓: 外す保存の前に checks（主席）と check_seats（足した席）の open を数える・赤い理由は共通部品 Message・set_seat の 6 引数は不変",
    sb.includes('.eq("seat_id", id).eq("status", "open")') && sb.includes('supabase.from("check_seats").select("check_id").eq("seat_id", id)') && sb.includes("if (block) { setSeatErr(block); return; }")
    && sb.includes('{seatErr && <Message kind="error"') && sb.includes("p_id: sId, p_store_id: storeId, p_name: sName, p_kind: sKind, p_sort_order: sSort,") && sb.includes("会計前の伝票がある席は外せません。"));
}

// a(3)
{
  const st = src("app/(manage)/staff/staff-board.tsx");
  check("a(3-1) staffListOwnerRowsShownOf: 0193 の後・本来の役割 owner が見るときだけ owner の行を読む（staffListRolesOf は不変）",
    staffListOwnerRowsShownOf(true, "owner") && !staffListOwnerRowsShownOf(true, "manager") && !staffListOwnerRowsShownOf(true, "admin") && !staffListOwnerRowsShownOf(false, "owner")
    && JSON.stringify(staffListRolesOf(true)) === JSON.stringify(["staff", "manager", "admin"]));
  check("a(3-2) staffListOwnerRowKeptOf: owner の行は在籍中・自分以外だけ／ほかの役割は全部残す",
    staffListOwnerRowKeptOf({ role: "owner", is_active: true }, "u2", "u1") && !staffListOwnerRowKeptOf({ role: "owner", is_active: true }, "u1", "u1")
    && !staffListOwnerRowKeptOf({ role: "owner", is_active: false }, "u2", "u1") && staffListOwnerRowKeptOf({ role: "manager", is_active: false }, "u1", "u1"));
  check("a(3-3) staff-board: 読む役割に owner を足す・管理者の行は名前／連絡先／保存・働き方・異動・契約チップを出さない（Staff0193＝店長に戻す・在籍を解除は今のまま）",
    st.includes('staffListRolesOf(rules0175On()).concat(staffListOwnerRowsShownOf(mig0193On(), roleRaw) ? ["owner"] : [])') && st.includes("rows = rows.filter((m) => staffListOwnerRowKeptOf(m, map[m.user_id]?.auth_user_id ?? null, myAuthUserId));")
    && st.includes('{sel.role === "owner" ? (<p data-staff-owner-row="1"') && st.includes('{sel.role !== "owner" && <StaffWorkSection') && st.includes('sel.is_active && sel.role !== "owner" && (') && st.includes('{m.role !== "owner" && <ContractChip')
    && st.includes("{mig0193On() && <Staff0193 sel={sel} isOwner={isOwner} roleRaw={roleRaw}"));
}

// a(4)
{
  const pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"), pb = src("app/(manage)/master/cast-comp/plan/plan-board.tsx");
  check("a(4-1) planCreateSectionOf: 描かれている最初の節（基本給・保証 → 各種バック → スライド）・全部 OFF は null",
    planCreateSectionOf({ base: true, backs: true, slides: true }) === "基本給・保証" && planCreateSectionOf({ base: false, backs: true, slides: true }) === "各種バック"
    && planCreateSectionOf({ base: false, backs: false, slides: true }) === "スライド" && planCreateSectionOf({ base: false, backs: false, slides: false }) === null);
  check("a(4-2) 文言: 誘導は節の名前で・作る前の保存は同じ節を名指し",
    planCreateGuideOf("各種バック").includes("「各種バックを保存」") && planCreateGuideOf("基本給・保証").includes("「基本給・保証を保存」") && planSaveFirstOf("各種バック").includes("各種バックの保存"));
  check("a(4-3) plan-editor: creatable＝createSection・各種バック／スライドの節に新規のときだけプラン名の欄・set_comp_plan の引数は不変（p_base: draft.base）",
    (pe.match(/const creatable = section === createSection;/g) ?? []).length === 2 && pe.includes('data-plan-create-name="各種バック"') && pe.includes('data-plan-create-name="スライド"')
    && pe.includes("p_id: draft.id, p_store_id: storeId, p_name: draft.name, p_base: draft.base,") && pe.includes("{planCreateGuideOf(createSection)}"));
  check("a(4-4) plan-board: 「＋ 報酬プランを追加」は今のまま・0 件でも描かれないタブから移す（?tab=slides だけプランを待つ）",
    pb.includes('onClick={() => { setSelId(null); setTab("base"); }}') && pb.includes('if (data.plans.length === 0 && tab === "slides") return;'));
}

console.log(fails.length === 0 ? `verify:nox-stage-a1 ALL PASS (${pass} assertions)` : `verify:nox-stage-a1 FAIL ${fails.length}/${pass + fails.length}`);
for (const f of fails) console.log("  ✗ " + f);
if (fails.length) process.exit(1);

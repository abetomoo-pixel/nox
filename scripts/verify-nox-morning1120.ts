/*
 * verify:nox-morning1120 — 朝の便（2026-11-20・相談役 ①②⑤・Agoora の返事＝4 つとも推奨の側）。お金の計算の式は変えない。
 *  o(1)〜o(3) ① 送り：送りを記録できる役（オーナー・店長）だけに「送り」と退勤の 2 択を出す・スタッフは 0201u の後（旗）でシフトの許可がある人だけ。
 *  q(1)〜q(2) ② 休みの希望：承認待ちの人ごとの並びの休みの行は「見送り」だけ・一括採用の数と対象から外す。
 *  k(1)       ⑤ 場面 4：端末の入口で画面を戻ったら前の失敗の文を消す。
 *  （③ 報酬率の母数の行を出さない・④ 売上の基準の文言は verify:nox-sb-ui）
 */
import fs from "node:fs";
import { okuriRoleOk, okuriButtonOf, outDialogNeeded } from "../lib/nox/shift/today-row";
import { MIG_0201U_APPLIED, mig0201uOn, __set0201uForTest } from "../lib/nox/rules-0175/flag";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const src = (f: string) => fs.readFileSync(f, "utf8");

// ── ① ──
check("o(1-1) 旗 MIG_0201U_APPLIED＝true（2026-11-20 12:06:50 本番適用の後）", MIG_0201U_APPLIED === true && mig0201uOn() === true);
check("o(1-2) 役：オーナー・店長は出す・スタッフは旗 false なら出さない・旗 true でもシフトの許可が無いスタッフとキャストは出さない",
  okuriRoleOk({ role: "owner", staffCanShift: false, mig0201u: false }) && okuriRoleOk({ role: "manager", staffCanShift: false, mig0201u: false })
  && !okuriRoleOk({ role: "staff", staffCanShift: true, mig0201u: false }) && okuriRoleOk({ role: "staff", staffCanShift: true, mig0201u: true })
  && !okuriRoleOk({ role: "staff", staffCanShift: false, mig0201u: true }) && !okuriRoleOk({ role: "cast", staffCanShift: true, mig0201u: true }) && !okuriRoleOk({ role: "", staffCanShift: true, mig0201u: true }));
check("o(1-3) 出さないとき＝「送り」ボタンなし・退勤は 2 択を開かずそのまま退勤", okuriButtonOf({ canRecord: true, okuriActual: false, attStatus: "shukkin", hasIn: true, issuedToday: false }).show === false && outDialogNeeded({ okuriActual: false, issuedToday: false }) === false);
__set0201uForTest(false); check("o(1-4) 旗の上書き（試験用）", mig0201uOn() === false); __set0201uForTest(null);
{
  const sb = src("app/(manage)/shift/shift-board.tsx");
  check("o(2-1) 画面：okuriShow＝店の方式 ∧ 役（スタッフのシフトの許可＝isManagerUp）・送りのボタンと退勤の 2 択だけに使う", sb.includes('const okuriShow = okuriActual && okuriRoleOk({ role, staffCanShift: role === "staff" && isManagerUp, mig0201u: mig0201uOn() });')
    && sb.includes("okuriButtonOf({ canRecord, okuriActual: okuriShow,") && sb.includes("outDialogNeeded({ okuriActual: okuriShow, issuedToday: okuriIssued.has(castId) })") && (sb.match(/okuriShow/g) ?? []).length === 3);
  check("o(2-2) スタッフの退勤＝今までどおり p_okuri=false を明示（送りの印を残さない＝未記録の件を作らない）", sb.includes('const { error } = await supabase.rpc("punch_proxy", okuriActual\n      ? { p_cast_id: castId, p_type: "out", p_note: null, p_okuri: false }'));
}
{
  // 0201u の本体（docs/tmp・git 管理外）がある環境だけ照らす
  const f = "docs/tmp/0201u_transport_staff.sql";
  if (fs.existsSync(f)) {
    const s = src(f);
    check("o(3-1) 0201u：begin と commit が 1 つずつ・lock_timeout・表を作らない・関数は transport_issue_bulk だけ", (s.match(/^begin;$/gm) ?? []).length === 1 && (s.match(/^commit;$/gm) ?? []).length === 1 && s.includes("set local lock_timeout = '10s';") && !/create table/i.test(s) && (s.match(/create or replace function/gi) ?? []).length === 1 && s.includes("FUNCTION public.transport_issue_bulk(p_store_id uuid, p_items jsonb, p_idem_key uuid)"));
    check("o(3-2) 0201u：足すのはシフトの許可があるスタッフ（自店）だけ・権限は anon と public を revoke・authenticated に grant", s.includes("or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_shift())) then")
      && s.includes("revoke execute on function public.transport_issue_bulk(uuid, jsonb, uuid) from public, anon;") && s.includes("grant execute on function public.transport_issue_bulk(uuid, jsonb, uuid) to authenticated;")
      && s.includes("if v_amount is null or v_amount <= 0 then raise exception 'bad amount'; end if;") && s.includes("if v_mode = 'none' then raise exception 'okuri none'; end if;"));
  }
}

// ── ② ──
{
  const sb = src("app/(manage)/shift/shift-board.tsx");
  check("q(1) 人ごとの並び：休みの行は「見送り」だけ・出勤の行は今までどおり 3 つ", sb.includes('{isManagerUp && r.kind === "wish" && (r.wish!.kind ?? "work") === "off" && (') && sb.includes('<span className="nox-rowops" data-queue-off-ops="1">\n                              <button style={btnLight} onClick={() => decide(r.wish!.id, false)}>見送り</button>\n                            </span>')
    && sb.includes('{isManagerUp && r.kind === "wish" && (r.wish!.kind ?? "work") !== "off" && ('));
  check("q(2) 一括採用の数と対象・要調整から休みを外す（希望どおりの数＝ボタンの数）", sb.includes("const ids = wishes.filter((w) => !isOffWish(w) && !closedOf(w.date, w.start_hm, w.end_hm)).map((w) => w.id);")
    && sb.includes("const adjustN = wishes.filter((w) => !isOffWish(w) && closedOf(w.date, w.start_hm, w.end_hm)).length;") && sb.includes("onClick={() => void approveAllWishes(ids)}>") && sb.includes("希望どおり一括採用（{ids.length}件）"));
}

// ── ⑤ ──
{
  const k = src("components/nox/kiosk-unlock-pad.tsx");
  check("k(1) 端末の入口：名前を選び直す・名前の一覧のもどる・候補のもどるで前の失敗の文を消す", k.includes('onClick={() => { setNamed(null); setPin(""); setMsg(null); }} data-kiosk-unlock-named-back="1">')
    && k.includes("onClick={() => { setPeople(null); setMsg(null); }}>もどる</button>") && k.includes('onClick={() => { setCands(null); setPin(""); setMsg(null); }}>もどる</button>')
    && k.includes("onClick={() => { setNamed(c); setPeople(null); setPin(\"\"); setMsg(null);"));
}

if (fails.length) { console.error(`✗ verify:nox-morning1120 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-morning1120 OK (${pass} checks)`);

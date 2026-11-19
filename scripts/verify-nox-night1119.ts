/*
 * verify:nox-night1119 — 夜便（2026-11-19 夜・相談役 ①③）。お金の計算の式・権限の判定には触れない。
 *  r(1)〜r(2) ① 朝の再試行：DEMO_USERS に店の鍵が無い店は消さずに飛ばす（今のまま）・失敗（500）にせず「飛ばした店」として成功の応答に載せる。ほかの店の本当の失敗は今までどおり 500。
 *  p(1)〜p(3) ③ PIN の重なり（0201t＝起草と試走まで・手貼り前）：画面の側は旗 MIG_0201T_APPLIED の後ろ・件数だけ（PIN・誰かは出さない）。
 */
import fs from "node:fs";
import { MIG_0201T_APPLIED, mig0201tOn, __set0201tForTest } from "../lib/nox/rules-0175/flag";
import { PIN_OVERLAP_RPC, pinOverlapCountsOf, pinOverlapLinesOf } from "../lib/nox/staff/pin-overlap";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const src = (f: string) => fs.readFileSync(f, "utf8");

// ── ① ──
{
  const seed = src("lib/nox/demo/seed.ts");
  check("r(1-1) BuildErr に skip（鍵が無い＝消さずに止めた）・鍵が無いときだけ skip: true", seed.includes("export type BuildErr = { ok: false; status: 403 | 503; error: string; skip?: true };")
    && seed.includes("return { ok: false, status: 503, error: `DEMO_USERS に ${store} の鍵がありません（消さずに止めました）`, skip: true };")
    && (seed.match(/skip: true/g) ?? []).length === 1);
  const cron = src("app/api/cron/demo-reset/route.ts");
  const skipAt = cron.indexOf("if (!built.ok && built.skip) {");
  const failAt = cron.indexOf("if (!built.ok) { await markFailed(admin, orgId, built.error);");
  check("r(1-2) cron：skip は失敗の前に拾い、ok:true・skipped に理由・skipped_orgs に名前（監査の失敗は書かない）", skipAt > 0 && skipAt < failAt
    && cron.includes("results.push({ org: o.name as string, ok: true, skipped: built.error }); skippedOrgs.push({ org: o.name as string, reason: built.error }); continue; }")
    && !cron.slice(skipAt, failAt).includes("markFailed"));
  check("r(1-3) 応答に skipped_orgs・本当の失敗は今までどおり 500（1 店でも ok:false）", cron.includes("return NextResponse.json({ ok, count: results.length, retry, skipped_orgs: skippedOrgs, results }, { status: ok ? 200 : 500 });")
    && cron.includes("const ok = results.every((r) => r.ok);") && cron.includes('results.push({ org: o.name as string, ok: false, error: "reset failed" });') && cron.includes("results.push({ org: o.name as string, ok: false, error: built.error });"));
  // 手動の reset（店の画面の「初期化に戻す」）は今のまま＝鍵が無ければ 503 で止まる（飛ばしたことを成功に見せない）
  const manual = src("app/api/demo/reset/route.ts");
  check("r(2-1) 手動の reset は skip を見ない（今のまま失敗で返す）", !manual.includes(".skip"));
}

// ── ③ ──
check("p(1-1) 旗 MIG_0201T_APPLIED＝false（手貼り前）", MIG_0201T_APPLIED === false && mig0201tOn() === false);
{
  check("p(1-2) 件数の文：重なり＝「PIN を設定し直してください」・未照合＝確かめ方の案内・0 件は出さない", JSON.stringify(pinOverlapLinesOf({ overlap: 0, unchecked: 0 })) === "[]"
    && pinOverlapLinesOf({ overlap: 2, unchecked: 0 }).length === 1 && pinOverlapLinesOf({ overlap: 2, unchecked: 0 })[0].includes("2 件") && pinOverlapLinesOf({ overlap: 2, unchecked: 0 })[0].includes("PIN を設定し直してください")
    && pinOverlapLinesOf({ overlap: 0, unchecked: 3 })[0].includes("3 件") && pinOverlapLinesOf({ overlap: 0, unchecked: 3 })[0].includes("店の端末で入ると確かめます"));
  check("p(1-3) 店が複数（owner）＝店の名前を前に", pinOverlapLinesOf({ overlap: 1, unchecked: 1 }, "CLUB A").every((l) => l.startsWith("CLUB A：")));
  check("p(1-4) RPC の返りの形が違えば出さない（null）", pinOverlapCountsOf(null) === null && pinOverlapCountsOf({ overlap: 1 }) === null && pinOverlapCountsOf({ overlap: -1, unchecked: 0 }) === null && JSON.stringify(pinOverlapCountsOf({ overlap: 1, unchecked: 2 })) === '{"overlap":1,"unchecked":2}');
  __set0201tForTest(true); check("p(1-5) 旗の上書き（試験用）", mig0201tOn() === true); __set0201tForTest(null);
}
{
  const n = src("components/nox/pin-overlap-notice.tsx");
  check("p(2-1) 部品：旗が false なら RPC を呼ばず何も出さない", n.includes("if (!mig0201tOn()) return;") && n.includes("if (!mig0201tOn() || lines.length === 0) return null;") && n.includes(`supabase.rpc(PIN_OVERLAP_RPC, { p_store_id: s.id })`) && PIN_OVERLAP_RPC === "pin_overlap_counts");
  check("p(2-2) 部品：件数の文だけ（PIN・名前・membership を出さない）", !/pin_hash|membership_id|user_name|\.name\}/.test(n.replace("s.name", "")) && n.includes("overflowWrap: \"anywhere\""));
  const panel = src("app/(manage)/master/kiosk-pin-panel.tsx");
  check("p(2-3) PIN の画面の見出しの下に置く（RPC の呼び方はほかは今のまま）", panel.includes("<PinOverlapNotice stores={stores} />") && panel.indexOf("<PinOverlapNotice stores={stores} />") < panel.indexOf('data-pin-two-kinds="1"'));
}
{
  // mig の本体（docs/tmp・git 管理外）がある環境だけ照らす（f0 の別の環境では飛ばす）
  const f = "docs/tmp/0201t_pin_overlap.sql";
  if (fs.existsSync(f)) {
    const s = src(f);
    check("p(3-1) 0201t：begin と commit が 1 つずつ・lock_timeout・表を作らない", (s.match(/^begin;$/gm) ?? []).length === 1 && (s.match(/^commit;$/gm) ?? []).length === 1 && s.includes("set local lock_timeout = '10s';") && !/create table/i.test(s));
    check("p(3-2) 0201t：内部専用 5 本は 4 ロール revoke・件数の窓口だけ authenticated に grant", ["pin_overlap_mark_person(uuid, uuid)", "pin_overlap_mark_user()", "pin_overlap_on_set()", "pin_overlap_recheck(uuid, uuid, text)", "pin_overlap_mark(uuid, uuid[], text)"].every((x) => s.includes(`revoke execute on function public.${x} from public, anon, authenticated, service_role;`))
      && s.includes("revoke execute on function public.pin_overlap_counts(uuid) from public, anon;") && s.includes("grant execute on function public.pin_overlap_counts(uuid) to authenticated;") && (s.match(/grant execute/g) ?? []).length === 1);
    check("p(3-3) 0201t：件数の窓口は二重防御（auth_org_id の null・役割と店）・誰かを返さない", s.includes("if v_org is null or v_role is null then raise exception 'forbidden'; end if;") && s.includes("if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = v_st)) then raise exception 'forbidden'; end if;") && s.includes("jsonb_build_object('overlap', count(*) filter (where st = 'overlap'), 'unchecked', count(*) filter (where st = 'unchecked'))"));
  }
}

// ── ② 通しの C（文言・折り返し・重なり）の直し（2026-11-19 夜・本番のデモで 375 と 1024 を実測）──
{
  const kiosk = src("app/kiosk/page.tsx"), css = src("app/globals.css"), sb = src("app/(manage)/shift/shift-board.tsx");
  check("w(1) 店の端末：狭い幅だけ上の余白を足す（375 で「端末ログアウト」が「タイムレコーダー」に重ならない・500px 以上は 26px のまま）", kiosk.includes('paddingTop: "clamp(26px, calc((600px - 100vw) * 0.2), 52px)"') && !kiosk.includes('margin: "0 auto", paddingTop: 26 }}'));
  check("w(2) シフトの今日：480px 以下は名前の列を中身の幅に（1 文字ずつ縦に折れない）・1024 の行は今のまま", css.includes("@media (max-width: 480px) { .nox-todaywrap .nox-table.cardrows tr { grid-template-columns: auto minmax(0, 1fr) auto; } .nox-todaywrap .nox-table.cardrows td.c-name > span:first-child { word-break: keep-all; } }")
    && css.includes("@media (max-width: 1279px) { .nox-todaywrap .nox-table.cardrows tr { grid-template-columns: minmax(0, 1fr) auto auto; }") && css.indexOf("(max-width: 480px) { .nox-todaywrap") > css.indexOf("(max-width: 1279px) { .nox-todaywrap .nox-table.cardrows tr { grid-template-columns: minmax(0, 1fr)"));
  check("w(3) 承認待ちの人ごとの並び：休みの希望の行に「休み希望」（日付順の並びと同じ語・ボタンは変えない）", sb.includes('{r.wish?.kind === "off" && <span data-queue-off="1">休み希望</span>}') && sb.includes('(r.wish.kind ?? "work") === "off" ? "休み希望"'));
}

if (fails.length) { console.error(`✗ verify:nox-night1119 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-night1119 OK (${pass} checks)`);

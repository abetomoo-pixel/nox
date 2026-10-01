/*
 * verify:nox-reservation-flow — 便 M3（2026-10-01・裁定326-4／追補1-1・1-5／追補2-3＝予約申請の client 側）の係留（純関数＋配線 grep＋pg 直結 1 tx・env: SUPABASE_DB_URL・seed:f0 済み）。
 *   npm run verify:nox-reservation-flow。f0 末尾に連結。既存 verify:nox-reservation-request 12（RPC の最小段）と重ねない＝UI の引数組み立て・RLS 越しの担当客・can_crm 以外の決裁・店側タブの配線を見る。
 *
 *  rf(1) rsvRequestArgsOf: 4 引数（p_store_id／p_customer_id／p_at＝JST ISO／p_kind）・担当客なし／日付・時刻の形式／区分外／過去日時は err
 *  rf(2) 一覧の並び（承認待ちが先→来店日時の新しい順・limit）・状態の文言と色・注記（取消は店へ・人数／備考は送らない）・rsvCustomerNameOf
 *  rf(3) 配線: /mine page＝店設定 reservation_request ON のときだけカード・最終打刻は rsvWhen（JST）／カード＝reservation_request を 4 引数で呼ぶ・p_party_size／p_memo を送らない・Picker（担当客）・Toast／
 *      店側 reservation-panel＝「承認待ち（N）」「却下」タブ・「すべて」は pending／rejected を除く・承認／却下＝reservation_decide・却下は理由必須（UI）・STATUS_LABEL 2 値／punch-actions＝.nox-punchbtn／.nox-punchseg＋CSS not-allowed／rpc-err 4 語
 *  rf(4) DB（BEGIN…ROLLBACK）: cast の customers は全行 cast_id＝自分（担当外は選べない）・rsvRequestArgsOf の引数で reservation_request → 'pending'・
 *      staff（can_register のみ・can_crm なし）の decide → forbidden・staff（can_crm）の reject（理由）→ 'rejected'＋理由・manager の approve → 'booked'（予約一覧の booked 絞りに出る）・ROLLBACK 後 行数不変
 *  逆テスト 1 本（手動・1 回）: rsvRequestArgsOf の `ms <= now` を `ms < now` にしても赤にならない（過去判定は等号で見ない）ため、RSV_REQ_STATUS_LABEL.pending を "承認待ち!" にする→rf(2-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { RSV_KIND_OPTIONS, RSV_REQ_CANCEL_NOTE, RSV_REQ_SENT, RSV_REQ_STATUS_COLOR, RSV_REQ_STATUS_LABEL, rsvCustomerNameOf, rsvRequestArgsOf, rsvRequestRowsOf } from "../lib/nox/mine/reservation-request";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// (1) 引数
const now = new Date("2026-10-01T03:00:00Z");
const ok = rsvRequestArgsOf({ storeId: "s", customerId: "c", date: "2026-10-05", time: "20:30", kind: "dohan", now });
check("rf(1-1) rsvRequestArgsOf: 4 引数・p_at は JST ISO（+09:00）・p_kind", ok.ok && JSON.stringify(ok.args) === JSON.stringify({ p_store_id: "s", p_customer_id: "c", p_at: "2026-10-05T20:30:00+09:00", p_kind: "dohan" }) && Object.keys(ok.args).length === 4, JSON.stringify(ok));
const e1 = rsvRequestArgsOf({ storeId: "s", customerId: "", date: "2026-10-05", time: "20:30", kind: "hon", now });
const e2 = rsvRequestArgsOf({ storeId: "s", customerId: "c", date: "2026-10-5", time: "20:30", kind: "hon", now });
const e3 = rsvRequestArgsOf({ storeId: "s", customerId: "c", date: "2026-10-05", time: "25:00", kind: "hon", now });
const e4 = rsvRequestArgsOf({ storeId: "s", customerId: "c", date: "2026-10-05", time: "20:30", kind: "jonai", now });
const e5 = rsvRequestArgsOf({ storeId: "s", customerId: "c", date: "2026-09-30", time: "20:30", kind: "hon", now });
check("rf(1-2) 担当客なし／日付の形式／時刻 25:00／区分 jonai／過去日時は err（文言）", !e1.ok && e1.err === "担当客を選んでください" && !e2.ok && e2.err === "来店日を選んでください" && !e3.ok && e3.err.startsWith("来店予定時刻") && !e4.ok && e4.err.startsWith("区分は") && !e5.ok && e5.err === "来店日時は今より後にしてください");

// (2) 一覧・文言
const rows = rsvRequestRowsOf([
  { status: "booked", reserved_at: "2026-10-03T11:00:00Z" }, { status: "pending", reserved_at: "2026-10-02T11:00:00Z" }, { status: "rejected", reserved_at: "2026-10-04T11:00:00Z" }, { status: "pending", reserved_at: "2026-10-06T11:00:00Z" },
]);
check("rf(2-1) rsvRequestRowsOf: 承認待ちが先（新しい順）→ 他は来店日時の新しい順・limit", rows.map((r) => `${r.status}:${r.reserved_at.slice(5, 10)}`).join(",") === "pending:10-06,pending:10-02,rejected:10-04,booked:10-03" && rsvRequestRowsOf(rows, 2).length === 2);
check("rf(2-2) 文言: 状態 pending＝承認待ち／booked＝承認／rejected＝却下・色 3 値・区分 2 択（hon／dohan）・送信後・注記（取消は店へ・人数／卓は店で）・rsvCustomerNameOf", RSV_REQ_STATUS_LABEL.pending === "承認待ち" && RSV_REQ_STATUS_LABEL.booked === "承認" && RSV_REQ_STATUS_LABEL.rejected === "却下"
  && RSV_REQ_STATUS_COLOR.pending === "var(--champ)" && RSV_REQ_STATUS_COLOR.booked === "var(--ok)" && RSV_REQ_STATUS_COLOR.rejected === "var(--bad)" && JSON.stringify(RSV_KIND_OPTIONS.map((o) => o[0])) === JSON.stringify(["hon", "dohan"])
  && RSV_REQ_SENT === "申請しました（店の承認をお待ちください）" && RSV_REQ_CANCEL_NOTE.includes("店にご連絡ください") && RSV_REQ_CANCEL_NOTE.includes("人数") && rsvCustomerNameOf({ name: "玲奈" }) === "玲奈 様" && rsvCustomerNameOf([{ name: "玲奈" }]) === "玲奈 様" && rsvCustomerNameOf(null) === "お客様");

// (3) 配線
const src = (p: string) => fs.readFileSync(p, "utf8");
const page = src("app/mine/page.tsx"), card = src("app/mine/reservation-request-card.tsx"), panel = src("app/(manage)/register/reservation-panel.tsx"), pa = src("app/mine/punch-actions.tsx"), css = src("app/globals.css");
check("rf(3-1) /mine page: 店設定 reservation_request ON のときだけ <ReservationRequestCard・最終打刻は rsvWhen（JST）", page.includes("{ms.reservation_request && myStore && <ReservationRequestCard storeId={myStore.id as string} bizToday={bizToday} />}") && page.includes("（${rsvWhen(last.punched_at as string)}）") && !page.includes('toLocaleString("ja-JP")}）'));
check("rf(3-2) カード: reservation_request を rsvRequestArgsOf の 4 引数で呼ぶ（p_party_size／p_memo なし）・担当客は customers 直読（RLS）＋Picker・自分の申請＝requested_by_cast not null・Toast・rpcErrJa",
  card.includes('supabase.rpc("reservation_request", a.args)') && card.includes("rsvRequestArgsOf({ storeId, customerId, date, time, kind })") && !card.includes("p_party_size") && !card.includes("p_memo") && card.includes('from("customers").select("id, name, tel").eq("is_active", true)')
  && card.includes("<Picker dense items={customers.map(") && card.includes('.not("requested_by_cast", "is", null)') && card.includes("<Toast msg={msg}") && card.includes("rpcErrJa(error.message)"));
check("rf(3-3) 店側 reservation-panel: 「承認待ち（N）」「却下」タブ・「すべて」は pending／rejected を除く・承認／却下＝reservation_decide・却下は理由必須（UI）・STATUS_LABEL 2 値・和文",
  panel.includes('["pending", pendingCount > 0 ? `承認待ち（${pendingCount}）` : "承認待ち"]') && panel.includes('["rejected", "却下"]') && panel.includes('(r.status === "cancelled" || r.status === "pending" || r.status === "rejected")')
  && panel.includes('supabase.rpc("reservation_decide", { p_reservation_id: r.id, p_decision: decision, p_reason: decision === "reject" ? reason : null })') && panel.includes('if (decision === "reject" && reason.length === 0)') && panel.includes("disabled={busy || decideReason.trim().length === 0}")
  && panel.includes('pending: "承認待ち", rejected: "却下"') && panel.includes('if (msg.includes("not pending")) return "この申請はすでに決裁済みです";'));
check("rf(3-4) punch-actions: .nox-punchbtn ×2・.nox-punchseg・CSS＝disabled は not-allowed・hover で色不変／rpc-err 4 語", (pa.match(/className="nox-punchbtn"/g) ?? []).length === 2 && pa.includes('className="nox-seg nox-punchseg"') && css.includes(".nox-punchbtn:disabled, .nox-punchseg button:disabled { cursor: not-allowed; }") && css.includes(".nox-punchbtn:disabled:hover, .nox-punchseg button:disabled:hover")
  && rpcErrJa("bad customer") === "担当客の中から選んでください" && rpcErrJa("bad reserved_at") === "来店日時を入力してください" && rpcErrJa("bad decision") === "決裁の種別が正しくありません" && rpcErrJa("not bookable").startsWith("承認前の申請は"));

// (4) DB
async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await db.connect();
  const { q, one, errOf, as, uidOf, castOf } = pgTx(db);
  try {
    const A1 = await one<{ id: string; org_id: string }>("select id, org_id from public.stores where name='NOX-VERIFY-A1'");
    const mgr = await uidOf("managerA1"), crm = await uidOf("staffCrmOnA1"), reg = await uidOf("staffRegOnA1"), castU = await uidOf("castA1a");
    const castA = await castOf(A1.id, castU.id);
    check("rf(0-1) fixture: A1／manager-a1／staff crm-on／staff reg-on／cast-a1a", !!A1 && !!mgr && !!crm && !!reg && !!castA);
    const before = (await one<{ n: number }>("select count(*)::int n from public.reservations")).n;
    await db.query("begin");
    try {
      const cus = await as(castU, "select id, cast_id from public.customers where is_active order by name");
      const cuIds = cus.ok ? (cus.rows as { id: string; cast_id: string }[]) : [];
      check("rf(4-1) cast の customers（RLS）: 1 件以上・全行 cast_id＝自分（担当外は候補に出ない）", cus.ok && cuIds.length > 0 && cuIds.every((c) => c.cast_id === castA), errOf(cus) + ` n=${cuIds.length}`);
      const a = rsvRequestArgsOf({ storeId: A1.id, customerId: cuIds[0]?.id ?? "", date: "2036-10-10", time: "21:00", kind: "hon" });
      const a2 = rsvRequestArgsOf({ storeId: A1.id, customerId: cuIds[0]?.id ?? "", date: "2036-10-11", time: "21:00", kind: "dohan" });
      const r1 = a.ok ? await as(castU, "select public.reservation_request($1,$2,$3::timestamptz,$4) id", [a.args.p_store_id, a.args.p_customer_id, a.args.p_at, a.args.p_kind]) : { ok: false as const, err: "args" };
      const r2 = a2.ok ? await as(castU, "select public.reservation_request($1,$2,$3::timestamptz,$4) id", [a2.args.p_store_id, a2.args.p_customer_id, a2.args.p_at, a2.args.p_kind]) : { ok: false as const, err: "args" };
      const id1 = r1.ok ? (r1.rows[0].id as string) : null, id2 = r2.ok ? (r2.rows[0].id as string) : null;
      const st = async (id: string | null) => (id ? await one<{ status: string; rejected_reason: string | null; nom_type: string }>("select status, rejected_reason, nom_type from public.reservations where id=$1", [id]) : null);
      check("rf(4-2) rsvRequestArgsOf の引数で申請 2 件 → 'pending'（hon／dohan）", r1.ok && r2.ok && (await st(id1))?.status === "pending" && (await st(id2))?.status === "pending" && (await st(id2))?.nom_type === "dohan", [errOf(r1), errOf(r2)].join(" | "));
      const dReg = await as(reg, "select public.reservation_decide($1, 'approve', null) id", [id1]);
      const dRej = await as(crm, "select public.reservation_decide($1, 'reject', '満席の見込み') id", [id2]);
      const dApp = await as(mgr, "select public.reservation_decide($1, 'approve', null) id", [id1]);
      const mine = await as(castU, "select id, status, rejected_reason from public.reservations where requested_by_cast is not null and id = any($1) order by reserved_at", [[id1, id2]]);
      const bookedList = await as(mgr, "select id from public.reservations where store_id=$1 and status='booked' and id = any($2)", [A1.id, [id1, id2]]);
      check("rf(4-3) can_register だけの staff の決裁は forbidden・can_crm の staff の却下→'rejected'＋理由・manager の承認→'booked'・cast は自分の申請 2 件（状態と理由）を読める・booked 絞りに承認分だけ",
        !dReg.ok && dReg.err.includes("forbidden") && dRej.ok && (await st(id2))?.status === "rejected" && (await st(id2))?.rejected_reason === "満席の見込み" && dApp.ok && (await st(id1))?.status === "booked"
        && mine.ok && mine.rows.length === 2 && bookedList.ok && bookedList.rows.length === 1 && bookedList.rows[0].id === id1, [errOf(dReg), errOf(dRej), errOf(dApp), errOf(mine)].join(" | "));
    } finally {
      await db.query("rollback");
    }
    check("rf(0-2) ROLLBACK 後: reservations の行数不変（残留 0）", (await one<{ n: number }>("select count(*)::int n from public.reservations")).n === before);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-reservation-flow OK (${pass} checks)`);
  console.log("予約申請の client 側(便 M3・裁定326-4): 4 引数の組み立て・入力検証 / 一覧の並びと文言 / 配線（/mine カード・店側の承認待ちタブ・却下理由必須・打刻ボタンの not-allowed・rpc-err） / DB（担当客 RLS・申請→can_register 拒否→却下／承認・ROLLBACK 残留 0）");
}

main().catch((e) => { console.error(e); process.exit(1); });

/*
 * verify:nox-demo-dateshift — 夜間便 N7-5（裁定276-1〜3・2026-09-18）録画の日付ずらし lib/nox/demo/dateshift.ts の係留（純関数・DB 不触）。
 *   npm run verify:nox-demo-dateshift（env 不要）。f0 65 段目。
 *
 *  (1) relToIso: 営業日 targetBiz + $rel・JST 時刻 t・cutoff 前の深夜（30 時間制）は翌暦日＝bizDateOf で戻すと targetBiz + $rel に一致
 *  (2) isoToRel（採取側の鏡像）との往復＝恒等・cutoff ちょうどは当日（[cutoff, 翌 cutoff)）
 *  (3) relToDate／dateToRel（date 列）・isRel の判定
 *  (4) shiftRow／shiftPayload: {$rel} だけを実値に・他の値は不変・org_id は触らない
 *  (5) seed.ts: remapUuid が org ごとに決定的で衝突しない・buildPayloadFromRecording が org_id を付け替え meta.users を役割で写す・
 *      parseDemoUsers は壊れた env を null にする
 *  逆テスト 1 本（手動・1 回）: relToIso の `hm < cutoffHm` を `hm <= cutoffHm` にする→ds(2-2) 赤・戻して緑。
 */
import { dateToRel, isRel, isoToRel, relToDate, relToIso, shiftPayload, shiftRow } from "../lib/nox/demo/dateshift";
import { bizDateOf } from "../lib/nox/biz-date";
import { buildPayloadFromRecording, parseDemoUsers, remapUuid } from "../lib/nox/demo/seed";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const T = "2026-09-20"; // 再生先の営業日
const CUT = "06:00";

// (1)
const a = relToIso({ $rel: 0, t: "21:30:00.000" }, T, CUT);
check("ds(1-1) 当日 21:30 JST → 9/20 12:30Z・営業日 9/20", a === "2026-09-20T12:30:00.000Z" && bizDateOf(a, CUT) === T, a);
const b = relToIso({ $rel: 0, t: "02:15:00.000" }, T, CUT);
check("ds(1-2) 深夜 02:15 JST（cutoff 前）→ 翌暦日 9/21 02:15 JST＝9/20 17:15Z・営業日は 9/20 のまま", b === "2026-09-20T17:15:00.000Z" && bizDateOf(b, CUT) === T, b);
const c = relToIso({ $rel: -3, t: "23:59:59.999" }, T, CUT);
check("ds(1-3) $rel −3 → 営業日 9/17（bizDateOf で一致）", bizDateOf(c, CUT) === "2026-09-17" && c.startsWith("2026-09-17T14:59:59"), c);
check("ds(1-4) 月またぎ・年またぎ（$rel +12 → 10/2・cutoff 前は 10/3 の暦日）", relToIso({ $rel: 12, t: "01:00:00.000" }, T, CUT) === "2026-10-02T16:00:00.000Z" && relToIso({ $rel: 0, t: "20:00:00.000" }, "2026-12-31", CUT) === "2026-12-31T11:00:00.000Z");
// (2)
const rt = (rel: { $rel: number; t: string }) => isoToRel(relToIso(rel, T, CUT), T, CUT);
check("ds(2-1) 往復恒等（21:30／02:15／$rel −3）", JSON.stringify(rt({ $rel: 0, t: "21:30:00.000" })) === JSON.stringify({ $rel: 0, t: "21:30:00.000" }) && JSON.stringify(rt({ $rel: 0, t: "02:15:00.000" })) === JSON.stringify({ $rel: 0, t: "02:15:00.000" }) && JSON.stringify(rt({ $rel: -3, t: "23:59:59.999" })) === JSON.stringify({ $rel: -3, t: "23:59:59.999" }));
const atCut = relToIso({ $rel: 0, t: "06:00:00.000" }, T, CUT);
const beforeCut = relToIso({ $rel: 0, t: "05:59:59.000" }, T, CUT);
check("ds(2-2) cutoff ちょうど（06:00）は当日の暦日・05:59:59 は翌暦日（どちらも営業日 9/20）", atCut === "2026-09-19T21:00:00.000Z" && beforeCut === "2026-09-20T20:59:59.000Z" && bizDateOf(atCut, CUT) === T && bizDateOf(beforeCut, CUT) === T, `${atCut} / ${beforeCut}`);
check("ds(2-3) 採取側: 9/18 03:00 JST（営業日 9/17）を基準 9/17 で採ると $rel 0・t 03:00", JSON.stringify(isoToRel("2026-09-17T18:00:00.000Z", "2026-09-17", CUT)) === JSON.stringify({ $rel: 0, t: "03:00:00.000" }));
// (3)
check("ds(3-1) date 列: relToDate／dateToRel の往復", relToDate({ $rel: 5 }, T) === "2026-09-25" && dateToRel("2026-09-25", T).$rel === 5 && dateToRel("2026-09-01", T).$rel === -19);
check("ds(3-2) isRel: {$rel} だけ true（数値・文字列・配列・null・$rel が文字列は false）", isRel({ $rel: 1 }) && isRel({ $rel: 0, t: "x" }) && !isRel(5) && !isRel("2026-09-20") && !isRel([{ $rel: 1 }]) && !isRel(null) && !isRel({ $rel: "1" }));
// (4)
const row = { id: "x", org_id: "o", started_at: { $rel: -1, t: "22:00:00.000" }, biz_date: { $rel: -1 }, total: 12000, memo: null, tags: ["a"] };
const sr = shiftRow(row, T, CUT);
check("ds(4-1) shiftRow: {$rel} だけ実値・他は不変", sr.started_at === "2026-09-19T13:00:00.000Z" && sr.biz_date === "2026-09-19" && sr.total === 12000 && sr.memo === null && JSON.stringify(sr.tags) === '["a"]' && sr.org_id === "o");
const sp = shiftPayload({ checks: [row], seats: [{ id: "s", org_id: "o", name: "A" }] }, T, CUT);
check("ds(4-2) shiftPayload: 表ごと・行数不変", Object.keys(sp).join(",") === "checks,seats" && sp.checks.length === 1 && sp.seats[0].name === "A");
// (5)
const O1 = "11111111-1111-4111-8111-111111111111", O2 = "22222222-2222-4222-8222-222222222222";
const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
check("ds(5-1) remapUuid: 決定的・org ごとに別・uuid 形式", remapUuid(O1, U) === remapUuid(O1, U) && remapUuid(O1, U) !== remapUuid(O2, U) && /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(remapUuid(O1, U)));
const REC_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", DEMO_USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const built = buildPayloadFromRecording(O1, T, {
  meta: { cutoff: "05:00", users: { owner: REC_USER } },
  tables: { stores: [{ id: U, org_id: "old-org", name: "S", created_at: { $rel: -30, t: "12:00:00.000" } }], memberships: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", user_id: REC_USER, store_id: U, role: "owner" }] },
}, { owner: DEMO_USER });
check("ds(5-2) buildPayloadFromRecording: org_id を付け替え・uuid を写像・meta.users は役割の実ユーザーへ・cutoff 05:00 を使う", built.ok && built.payload.stores[0].org_id === O1 && built.payload.stores[0].id === remapUuid(O1, U) && built.payload.memberships[0].user_id === DEMO_USER && built.payload.memberships[0].store_id === remapUuid(O1, U) && built.payload.stores[0].created_at === "2026-08-21T03:00:00.000Z" && built.tables === 2 && built.rows === 2, JSON.stringify(built));
check("ds(5-3) buildPayloadFromRecording: 表が無ければ 503「録画なし」", (() => { const r = buildPayloadFromRecording(O1, T, { meta: {} }); return !r.ok && r.status === 503 && r.error === "録画なし"; })());
check("ds(5-4) parseDemoUsers: JSON 以外・配列・uuid でない値は捨てる", parseDemoUsers(undefined) === null && parseDemoUsers("{bad") === null && parseDemoUsers("[]") === null && JSON.stringify(parseDemoUsers(`{"cabaret:owner":"${U}","x":"nope"}`)) === JSON.stringify({ "cabaret:owner": U }));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-demo-dateshift OK (${pass} checks)`);

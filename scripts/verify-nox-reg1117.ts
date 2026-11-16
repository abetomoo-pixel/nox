/*
 * verify:nox-reg1117 — レジ › 指名・席の「この卓のキャスト」（2026-11-17 夜便 N1・見せ方だけ）。DB 不触・env 不要・逐語 pin。
 *   npm run verify:nox-reg1117。
 *  r(1) 「席」と「指名の分配率」の 2 つの枠をやめ、「この卓のキャスト」の 1 つの枠（data-table-casts）に本指名・場内・フリーを同じ形の行（.nox-nomcard）で出す。
 *  r(2) フリーの行＝分配率の欄なし・「分配に入りません」・着卓の時刻（着卓 20:05〜／18:50〜19:00（離席））と「離席」／「再着席」をその行に。
 *  r(3) 合計と「均等に分配」は一覧の下（フリーの行より後）・分配の対象（nomSelected）と保存（autoSaveNoms／check_set_nominations）は不変。
 */
import fs from "node:fs";
import { SEAT_FREE_NOTE, seatRowsOf, seatTimeTextOf, shareCardIdsOf, activeIdsOf, type RosterRow } from "../lib/nox/register/seat-roster";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const rb = fs.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

// r(1) 枠は 1 つ
const iCard = rb.indexOf('data-nom-cards="1" data-table-casts="1"');
check("r(1-1) 枠は「この卓のキャスト」の 1 つ（見出し 1 回）・旧「指名の分配率」「席」の見出しは無い",
  iCard > 0 && (rb.match(/>この卓のキャスト<\/h3>/g) ?? []).length === 1 && !rb.includes(">指名の分配率</h3>") && !rb.includes(`<h3 style={{ ...t.cardTitle, margin: "0 0 4px" }}>席</h3>`));
check("r(1-2) 枠が出る条件＝分配の人か、フリーの人が居る", rb.includes("{(nomSelected.length > 0 || seatRowsNow.length > 0) && (") && rb.includes("const seatRowsNow = seatRowsOf(noms, nomKinds, castName);"));
const iShare = rb.indexOf('<div key={ca.id} className="nox-nomcard" data-kind={kind}');
const iFree = rb.indexOf('<div key={r.castId} className="nox-nomcard" data-kind="free" data-seat-free={r.castId}');
const iTotal = rb.indexOf("分配率の合計", iCard);
const iEven = rb.indexOf("均等に分配", iTotal);
const iCust = rb.indexOf("<CheckCustomersCard checkId={check.id}");
check("r(1-3) 同じ枠の中の並び＝分配の行（本指名・場内）→ フリーの行 → 合計 → 均等に分配（次の枠＝顧客より前）",
  iCard < iShare && iShare < iFree && iFree < iTotal && iTotal < iEven && iEven < iCust, [iCard, iShare, iFree, iTotal, iEven, iCust]);
check("r(1-4) フリーの行も同じ形（写真 36・名前・区分の切替＝本／場内／フリーの nox-seg gold・左帯は灰）",
  rb.slice(iFree, iTotal).includes('<CastAvatar name={r.name} url={photoUrls.get(r.castId)} variant="flat" size={36} />') && rb.slice(iFree, iTotal).includes('<span className="nox-seg gold"') && css.includes(".nox-nomcard { display: grid;") && !/\.nox-nomcard\[data-kind="free"\] \{[^}]*border-left-color/.test(css));

// r(2) フリーの行
const freeBlock = rb.slice(iFree, iTotal);
check("r(2-1) フリーの行に分配率の欄が無い（% の入力・100%・× が無い）", !freeBlock.includes("の分配率`}") && !freeBlock.includes('type="number"') && !freeBlock.includes(">100%</b>") && !freeBlock.includes("removeShareCast"));
check("r(2-2) 印「分配に入りません」（data-seat-free-note・灰の札）", SEAT_FREE_NOTE === "分配に入りません" && freeBlock.includes('<span className="rk" data-seat-free-note="1">{SEAT_FREE_NOTE}</span>') && css.includes('.nox-nomcard[data-kind="free"] .nm .rk[data-seat-free-note]'));
check("r(2-3) 着卓の時刻と「離席」／「再着席」はその行の右（タップ領域 44px・ハンドラは setSeatEnded のまま）",
  freeBlock.includes('<span className="num" data-seat-time="1"') && freeBlock.includes('data-seat-leave="1" onClick={() => void setSeatEnded(r.castId, true)}>離席</button>') && freeBlock.includes('data-seat-reseat="1" onClick={() => void setSeatEnded(r.castId, false)}>再着席</button>') && (freeBlock.match(/minHeight: 44/g) ?? []).length === 2);
const noms: RosterRow[] = [
  { cast_id: "hina", ratio_weight: 60, nom_kind: "hon", is_dohan: false, created_at: "2026-11-16T10:00:00Z" },
  { cast_id: "sena", ratio_weight: 0, nom_kind: "free", is_dohan: false, created_at: "2026-11-16T11:05:00Z" },
  { cast_id: "noa", ratio_weight: 0, nom_kind: "free", is_dohan: false, created_at: "2026-11-16T09:50:00Z", ended_at: "2026-11-16T10:00:00Z" },
];
const kinds = { hina: "hon", sena: "free", noa: "free" };
const rows = seatRowsOf(noms, kinds, (id) => ({ sena: "せな", noa: "のあ" } as Record<string, string>)[id] ?? id);
check("r(2-4) 時刻の文字（JST）＝着卓中「着卓 20:05〜」・離席済み「18:50〜19:00（離席）」・着卓中が上", rows.map(seatTimeTextOf).join("|") === "着卓 20:05〜|18:50〜19:00（離席）", rows.map(seatTimeTextOf));
check("r(2-5) 離席済みの行は薄く（data-active なし）", css.includes(".nox-nomcard[data-seat-free]:not([data-active]) { opacity: .62; }") && freeBlock.includes('data-active={r.active ? "1" : undefined}'));

// r(3) 計算・保存は不変
check("r(3-1) 分配の対象は今のまま（着卓中かつフリー以外）＝フリーは合計に入らない", JSON.stringify(shareCardIdsOf(Object.keys(kinds), kinds, activeIdsOf(noms))) === JSON.stringify(["hina"]) && rb.includes("const shareIds = new Set(shareCardIdsOf(Object.keys(nomWeights), nomKinds, seatedIds));") && rb.includes("const nomTotalW = nomSelected.reduce((a, ca) => a + (nomWeights[ca.id] ?? 0), 0);"));
check("r(3-2) 合計のバッジは分配の人が居るときだけ・合計バーと均等は 2 人以上のとき（今のまま）", rb.includes("{nomSelected.length > 0 && <span style={{") && rb.includes("{nomSelected.length > 1 && (<>"));
check("r(3-3) フリーの行の区分の切替＝今の席の枠と同じ保存（defaultWeights → autoSaveNoms）・ⓘ に「分配に入らず」の注記",
  freeBlock.includes("const weights = defaultWeights(Object.keys(nomWeights), kinds); setNomKinds(kinds); setNomWeights(weights); void autoSaveNoms(weights, kinds, nomDohan, nomDohanN);") && rb.includes("<p style={{ margin: \"0 0 4px\" }}>{SEAT_FREE_INFO}</p>"));

if (fails.length) { console.error(`✗ verify:nox-reg1117 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-reg1117 OK (${pass} checks)`);
